// One stylist's live inbox: a Durable Object holding that stylist's DMs, briefs and
// corrections in its own SQLite, and pushing every change to the chat, inbox and stage
// screens over WebSockets.
import { DurableObject } from "cloudflare:workers"
import { Schema } from "effect"
import { briefSchemaFor } from "../shared/brief.ts"
import braiderProfile from "../../data/braider/profile.json"
import braiderTags from "../../data/braider/tags.json"
import braiderCorrections from "../../data/braider/corrections.jsonl?raw"
import colouristProfile from "../../data/colourist/profile.json"
import colouristTags from "../../data/colourist/tags.json"
import colouristCorrections from "../../data/colourist/corrections.jsonl?raw"
import type { RoomEvent, RoomMessage, StylistKey } from "../shared/stylists.ts"
import { callBrief } from "./brief-call.ts"
import { closestCorrections, correctionsBlock, type Correction } from "./corrections.ts"
import { guardEvidence } from "./guards.ts"
import { readPhotos } from "./photo-reader.ts"

const PROFILES = {
  braider: { profile: braiderProfile, tags: braiderTags, seedCorrections: braiderCorrections },
  colourist: { profile: colouristProfile, tags: colouristTags, seedCorrections: colouristCorrections },
} as const

const parseJsonl = (s: string): Correction[] => s.trim() ? s.trim().split("\n").map((l) => JSON.parse(l)) : []
const MAX_DM = 1000
const MAX_CORRECTION_BYTES = 8_000
const DM_PER_WINDOW = 8
const DM_PER_ROOM_WINDOW = 60 // past this, DMs land undrafted
const DM_ROOM_HARD_CAP = 300 // past this, DMs from ids the room hasn't seen are refused
const DM_ROOM_ABSOLUTE_CAP = 600 // past this, every DM is refused for the rest of the window
const DM_WINDOW_MS = 10 * 60_000
const MAX_IMAGES_PER_DM = 4
const IMAGES_PER_WINDOW = 16
const MAX_IMAGE_BYTES = 1_500_000
const ROOM_IMAGE_BYTES_PER_WINDOW = 60_000_000
const ORPHAN_IMAGE_MS = 30 * 60_000
const CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// What a client's phone may see of a message: their words, its status and the stylist's reply.
const clientView = (m: RoomMessage): RoomMessage => ({
  ...m, photoTags: null, brief: null, corrected: null, changed: [], requestId: null, ms: null, correctionsUsed: 0, guarded: [],
})

export class StylistRoom extends DurableObject<Env> {
  private stylist: StylistKey | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, client_id TEXT, created_at INTEGER, received_at TEXT, text TEXT, photo TEXT,
      status TEXT, brief TEXT, corrected TEXT, changed TEXT, reply TEXT, request_id TEXT, ms INTEGER,
      corrections_used INTEGER, guarded TEXT)`)
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS corrections (id TEXT PRIMARY KEY, json TEXT, created_at INTEGER)`)
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`)
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, client_id TEXT, mime TEXT, bytes BLOB, created_at INTEGER)`)
    // Rooms created before photos existed get the column in place.
    const cols = ctx.storage.sql.exec(`PRAGMA table_info(messages)`).toArray().map((c) => c.name)
    if (!cols.includes("images")) ctx.storage.sql.exec(`ALTER TABLE messages ADD COLUMN images TEXT`)
    const row = ctx.storage.sql.exec(`SELECT value FROM meta WHERE key = 'stylist'`).toArray()[0]
    if (row) this.stylist = row.value as StylistKey
  }

  // Two kinds of caller. The stylist proves themselves with STYLIST_TOKEN and sees everything.
  // Anyone else is a client, known only by the random id their phone made, who may send DMs
  // and sees only their own thread: their messages and the stylist's replies, never briefs.
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const [, , , stylist, action, itemId] = url.pathname.split("/") // /api/room/<stylist>/<action>[/<id>]
    this.remember(stylist as StylistKey)
    // The key never travels in a URL: HTTP sends it as x-stylist-token, and a browser
    // WebSocket (which can't set headers) offers it as a "key.<token>" subprotocol.
    const protocols = (request.headers.get("sec-websocket-protocol") ?? "").split(",").map((p) => p.trim())
    const offered = request.headers.get("x-stylist-token") ?? protocols.find((p) => p.startsWith("key."))?.slice(4) ?? ""
    const isStylist = sameSecret(offered, this.env.STYLIST_TOKEN)
    const client = url.searchParams.get("client") ?? ""

    if (action === "ws") {
      if (request.headers.get("upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 })
      if (!isStylist && !CLIENT_ID.test(client)) return new Response("Unknown client", { status: 401 })
      const pair = new WebSocketPair()
      this.ctx.acceptWebSocket(pair[1], [isStylist ? "stylist" : `client:${client}`])
      const headers = protocols.includes("brief-builder") ? { "sec-websocket-protocol": "brief-builder" } : undefined
      return new Response(null, { status: 101, webSocket: pair[0], headers })
    }
    if (action === "state" && request.method === "GET") {
      if (isStylist) return Response.json({ messages: this.messages() })
      if (!CLIENT_ID.test(client)) return new Response("Unknown client", { status: 401 })
      return Response.json({ messages: this.messages().filter((m) => m.clientId === client).map(clientView) })
    }
    if (action === "image" && request.method === "GET") return this.serveImage(itemId ?? "", isStylist, client)
    if (action === "image" && request.method === "POST") return this.receiveImage(request, client)
    if (request.method !== "POST") return new Response("Not found", { status: 404 })
    const body: any = await request.json().catch(() => ({}))
    if (action === "dm") return this.receiveDm(body)
    if (!isStylist) return Response.json({ error: "Only the stylist can do that." }, { status: 401 })
    switch (action) {
      case "correct": return this.correct(body)
      case "reply": return this.reply(body)
      case "reset": return this.reset()
      default: return new Response("Not found", { status: 404 })
    }
  }

  webSocketMessage() {}
  webSocketClose(ws: WebSocket, code: number) {
    ws.close(code, "closing")
  }

  private remember(stylist: StylistKey) {
    if (this.stylist || !(stylist in PROFILES)) return
    this.stylist = stylist
    this.ctx.storage.sql.exec(`INSERT OR REPLACE INTO meta (key, value) VALUES ('stylist', ?)`, stylist)
  }

  // Stylist screens get every change; a client's phone gets only its own messages, redacted.
  private broadcast(event: RoomEvent) {
    const send = (ws: WebSocket, e: RoomEvent) => {
      try {
        ws.send(JSON.stringify(e))
      } catch {
        // A closed socket is cleaned up by the runtime.
      }
    }
    for (const ws of this.ctx.getWebSockets("stylist")) send(ws, event)
    if (event.type === "reset") {
      for (const ws of this.ctx.getWebSockets()) if (!this.ctx.getTags(ws).includes("stylist")) send(ws, event)
      return
    }
    for (const ws of this.ctx.getWebSockets(`client:${event.message.clientId}`)) send(ws, { type: "message", message: clientView(event.message) })
  }

  private messages(): RoomMessage[] {
    return this.ctx.storage.sql.exec(`SELECT * FROM messages ORDER BY created_at`).toArray().map(toMessage)
  }

  private message(id: string): RoomMessage | null {
    const row = this.ctx.storage.sql.exec(`SELECT * FROM messages WHERE id = ?`, id).toArray()[0]
    return row ? toMessage(row) : null
  }

  private save(m: RoomMessage) {
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO messages (id, client_id, created_at, received_at, text, photo, status, brief, corrected, changed,
        reply, request_id, ms, corrections_used, guarded, images) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      m.id, m.clientId, m.createdAt, m.receivedAt, m.text, JSON.stringify(m.photoTags), m.status, JSON.stringify(m.brief),
      JSON.stringify(m.corrected), JSON.stringify(m.changed), m.reply, m.requestId, m.ms, m.correctionsUsed, JSON.stringify(m.guarded),
      JSON.stringify(m.images),
    )
    this.broadcast({ type: "message", message: m })
  }

  private correctionPool(): Correction[] {
    const live = this.ctx.storage.sql.exec(`SELECT json FROM corrections ORDER BY created_at`).toArray().map((r) => JSON.parse(r.json as string))
    return [...parseJsonl(PROFILES[this.stylist!].seedCorrections), ...live]
  }

  private async receiveDm(body: { clientId?: string; text?: string; imageIds?: unknown }) {
    const text = String(body.text ?? "").trim().slice(0, MAX_DM)
    if (!CLIENT_ID.test(String(body.clientId ?? ""))) return Response.json({ error: "Unknown client." }, { status: 400 })
    // Only photos this phone uploaded can be attached.
    const wanted = Array.isArray(body.imageIds) ? body.imageIds.filter((x): x is string => typeof x === "string").slice(0, MAX_IMAGES_PER_DM) : []
    const images = wanted.filter((id) => this.ctx.storage.sql.exec(`SELECT 1 FROM images WHERE id = ? AND client_id = ?`, id, body.clientId).toArray().length > 0)
    if (!text && !images.length) return Response.json({ error: "Write a message or add a photo." }, { status: 400 })
    // Each DM costs a Mubit call, so one phone can send a few per window, not a flood.
    // One phone past its limit is refused. Past the room-wide cap (client ids are self-chosen)
    // DMs are still accepted and shown to the stylist, just not drafted, so a flood caps the
    // Mubit cost without locking real clients out. No per-IP limit: venue Wi-Fi shares one address.
    const since = Date.now() - DM_WINDOW_MS
    const recent = this.ctx.storage.sql.exec(`SELECT COUNT(*) AS n FROM messages WHERE client_id = ? AND created_at > ?`, body.clientId, since).toArray()[0]
    if (Number(recent?.n ?? 0) >= DM_PER_WINDOW) {
      return Response.json({ error: "That's a lot of messages. Give the stylist a minute to reply." }, { status: 429 })
    }
    const roomRecent = Number(this.ctx.storage.sql.exec(`SELECT COUNT(*) AS n FROM messages WHERE created_at > ?`, since).toArray()[0]?.n ?? 0)
    // Past the hard cap only ids the room hasn't seen are refused: storage stays bounded, no
    // sender can delete anyone's messages, and clients already in a thread (each still under
    // their own limit) aren't locked out by a flood of minted ids.
    // Above the absolute cap everyone waits, so total storage per window is bounded either way.
    if (roomRecent >= DM_ROOM_ABSOLUTE_CAP) {
      return Response.json({ error: "The stylist's inbox is full right now. Try again in a few minutes." }, { status: 429 })
    }
    if (roomRecent >= DM_ROOM_HARD_CAP) {
      const known = this.ctx.storage.sql.exec(`SELECT 1 FROM messages WHERE client_id = ? LIMIT 1`, body.clientId).toArray().length > 0
      if (!known) return Response.json({ error: "The stylist's inbox is full right now. Try again in a few minutes." }, { status: 429 })
    }
    const draft = roomRecent < DM_PER_ROOM_WINDOW
    const m: RoomMessage = {
      id: crypto.randomUUID(), clientId: String(body.clientId).slice(0, 64), createdAt: Date.now(),
      receivedAt: londonTimestamp(new Date()), text, photoTags: null, images, status: draft ? "drafting" : "failed",
      brief: null, corrected: null, changed: [], reply: null, requestId: null, ms: null, correctionsUsed: 0, guarded: [],
    }
    this.save(m)
    if (draft) this.ctx.waitUntil(this.draft(m))
    return Response.json({ message: m })
  }

  private async draft(m: RoomMessage) {
    const { profile, tags } = PROFILES[this.stylist!]
    // Photos are read into tags first (through Mubit, like every model call); the brief model
    // only ever sees the tags, never the image.
    if (m.images.length) {
      const photos = m.images.flatMap((id) => {
        const r = this.ctx.storage.sql.exec(`SELECT mime, bytes FROM images WHERE id = ?`, id).toArray()[0]
        return r ? [{ mime: r.mime as string, bytes: r.bytes as ArrayBuffer }] : []
      })
      m = { ...m, photoTags: await readPhotos({ key: this.env.MUBIT_API_KEY, tags: tags as any, photos }).catch(() => null) }
      this.save(m)
    }
    const used = closestCorrections(m.text, this.correctionPool())
    const result = await callBrief({
      key: this.env.MUBIT_API_KEY, profile: profile as any, tags: tags as any, effort: "low",
      dm: { received_at: m.receivedAt, text: m.text, photo: m.photoTags ? { reader_output: m.photoTags } : null },
      corrections: correctionsBlock(used),
    }).catch((e) => ({ status: 0, ms: 0, requestId: null, brief: null, error: String(e), tokensIn: null, tokensOut: null }))
    const brief = result.brief as Record<string, any> | null
    const trusted = new Set((m.photoTags ?? []).filter((t) => t.confidence >= (tags as any).trust_threshold).map((t) => t.field))
    const guarded = brief ? guardEvidence(brief, m.text, trusted) : []
    // House style for replies: no em dashes. Tidied here, not in the instructions, so the
    // Mubit task (keyed on the exact instructions) keeps its examples.
    if (brief && typeof brief.reply_draft === "string") brief.reply_draft = brief.reply_draft.replace(/\s*[—–]\s*/g, ", ")
    this.save({ ...m, status: brief ? "drafted" : "failed", brief, requestId: result.requestId, ms: result.ms, correctionsUsed: used.length, guarded })
  }

  private async correct(body: { id?: string; corrected?: Record<string, any> }) {
    const m = body.id ? this.message(body.id) : null
    if (!m || !m.brief || !body.corrected) return Response.json({ error: "Nothing to correct." }, { status: 400 })
    // Corrections go into future prompts and Mubit's training data, so only a brief that fits
    // this stylist's schema, at a sane size, is kept.
    if (JSON.stringify(body.corrected).length > MAX_CORRECTION_BYTES) return Response.json({ error: "That correction is too large." }, { status: 400 })
    // Unknown keys are dropped and only the decoded brief is stored.
    const decoded = Schema.decodeUnknownExit(briefSchemaFor[this.stylist!])(body.corrected)
    if (decoded._tag !== "Success") return Response.json({ error: "That correction doesn't fit the brief." }, { status: 400 })
    body.corrected = decoded.value as Record<string, any>
    const changed = diffPaths(m.brief, body.corrected)
    const correction: Correction = {
      id: m.id, received_at: m.receivedAt, text: m.text,
      photoTags: m.photoTags?.map((t) => `${t.field}=${t.tag} (${t.confidence})`).join(", ") ?? "none",
      corrected: body.corrected, changed,
    }
    this.ctx.storage.sql.exec(`INSERT OR REPLACE INTO corrections VALUES (?, ?, ?)`, m.id, JSON.stringify(correction), Date.now())
    this.save({ ...m, corrected: body.corrected, changed })
    return Response.json({ changed })
  }

  private async reply(body: { id?: string; text?: string }) {
    const m = body.id ? this.message(body.id) : null
    const text = String(body.text ?? "").trim().slice(0, MAX_DM)
    if (!m || !text) return Response.json({ error: "A reply needs text." }, { status: 400 })
    this.save({ ...m, reply: text, status: "replied" })
    return Response.json({ ok: true })
  }

  // Photos arrive already resized on the phone. Only real JPEG, PNG or WebP bytes are kept.
  private async receiveImage(request: Request, client: string) {
    if (!CLIENT_ID.test(client)) return Response.json({ error: "Unknown client." }, { status: 400 })
    const recent = Number(this.ctx.storage.sql.exec(`SELECT COUNT(*) AS n FROM images WHERE client_id = ? AND created_at > ?`, client, Date.now() - DM_WINDOW_MS).toArray()[0]?.n ?? 0)
    if (recent >= IMAGES_PER_WINDOW) return Response.json({ error: "That's a lot of photos. Try again in a few minutes." }, { status: 429 })
    // Photos never attached to a message are removed after 30 minutes.
    this.ctx.storage.sql.exec(
      `DELETE FROM images WHERE created_at < ? AND id NOT IN (SELECT j.value FROM messages, json_each(messages.images) AS j)`,
      Date.now() - ORPHAN_IMAGE_MS,
    )
    const roomBytes = Number(this.ctx.storage.sql.exec(`SELECT COALESCE(SUM(length(bytes)), 0) AS n FROM images WHERE created_at > ?`, Date.now() - DM_WINDOW_MS).toArray()[0]?.n ?? 0)
    if (roomBytes >= ROOM_IMAGE_BYTES_PER_WINDOW) return Response.json({ error: "The stylist can't take more photos right now. Try again in a few minutes." }, { status: 429 })
    if (Number(request.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) return Response.json({ error: "That photo is too large." }, { status: 413 })
    const bytes = await readCapped(request, MAX_IMAGE_BYTES)
    if (!bytes || bytes.byteLength === 0) return Response.json({ error: "That photo is too large." }, { status: 413 })
    const mime = sniffImage(new Uint8Array(bytes.slice(0, 12)))
    if (!mime) return Response.json({ error: "Only photos can be attached." }, { status: 415 })
    // Re-check both limits now the body is in, with no await before the insert, so uploads
    // that were in flight together can't all slip past the earlier check.
    const since = Date.now() - DM_WINDOW_MS
    const mineNow = Number(this.ctx.storage.sql.exec(`SELECT COUNT(*) AS n FROM images WHERE client_id = ? AND created_at > ?`, client, since).toArray()[0]?.n ?? 0)
    const roomNow = Number(this.ctx.storage.sql.exec(`SELECT COALESCE(SUM(length(bytes)), 0) AS n FROM images WHERE created_at > ?`, since).toArray()[0]?.n ?? 0)
    if (mineNow >= IMAGES_PER_WINDOW || roomNow + bytes.byteLength > ROOM_IMAGE_BYTES_PER_WINDOW) {
      return Response.json({ error: "That's a lot of photos. Try again in a few minutes." }, { status: 429 })
    }
    const id = crypto.randomUUID()
    this.ctx.storage.sql.exec(`INSERT INTO images (id, client_id, mime, bytes, created_at) VALUES (?, ?, ?, ?, ?)`, id, client, mime, bytes, Date.now())
    return Response.json({ id })
  }

  // The sender and the stylist can see a photo; nobody else can.
  private serveImage(id: string, isStylist: boolean, client: string) {
    const r = this.ctx.storage.sql.exec(`SELECT client_id, mime, bytes FROM images WHERE id = ?`, id).toArray()[0]
    if (!r || (!isStylist && r.client_id !== client)) return new Response("Not found", { status: 404 })
    return new Response(r.bytes as ArrayBuffer, {
      headers: { "content-type": r.mime as string, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" },
    })
  }

  private reset() {
    this.ctx.storage.sql.exec(`DELETE FROM messages`)
    this.ctx.storage.sql.exec(`DELETE FROM corrections`)
    this.ctx.storage.sql.exec(`DELETE FROM images`)
    this.broadcast({ type: "reset" })
    return Response.json({ ok: true })
  }
}

// Reads a request body as it arrives and gives up once it passes `limit`, so an oversized or
// unlabelled upload is never fully buffered. Returns null when the body is too large.
async function readCapped(request: Request, limit: number): Promise<ArrayBuffer | null> {
  if (!request.body) return new ArrayBuffer(0)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.byteLength
  }
  return out.buffer
}

// Reads the file's first bytes rather than trusting the declared type.
function sniffImage(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg"
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png"
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp"
  return null
}

// Constant-time comparison, so response timing can't reveal how much of a guess matched.
function sameSecret(offered: string, secret: string | undefined): boolean {
  if (!secret || offered.length !== secret.length) return false
  let diff = 0
  for (let i = 0; i < secret.length; i++) diff |= offered.charCodeAt(i) ^ secret.charCodeAt(i)
  return diff === 0
}

function toMessage(r: Record<string, any>): RoomMessage {
  return {
    id: r.id, clientId: r.client_id, createdAt: r.created_at, receivedAt: r.received_at, text: r.text,
    photoTags: JSON.parse(r.photo), status: r.status, brief: JSON.parse(r.brief), corrected: JSON.parse(r.corrected),
    changed: JSON.parse(r.changed ?? "[]"), reply: r.reply, requestId: r.request_id, ms: r.ms,
    correctionsUsed: r.corrections_used ?? 0, guarded: JSON.parse(r.guarded ?? "[]"), images: JSON.parse(r.images ?? "[]") ?? [],
  }
}

// Field paths whose values differ, ignoring evidence and the reply text.
function diffPaths(a: any, b: any, prefix = ""): string[] {
  const out: string[] = []
  for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    if (k === "evidence" || k === "reply_draft") continue
    const x = a?.[k]
    const y = b?.[k]
    if (x && y && typeof x === "object" && typeof y === "object" && !Array.isArray(x)) out.push(...diffPaths(x, y, `${prefix}${k}.`))
    else if (JSON.stringify(x) !== JSON.stringify(y)) out.push(`${prefix}${k}`)
  }
  return out
}

// Day words like "sat" resolve against London time, which moves from BST to GMT at 02:00 on 25 October.
function londonTimestamp(d: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZoneName: "longOffset",
  }).formatToParts(d).map((p) => [p.type, p.value]))
  const offset = (parts.timeZoneName as string).replace("GMT", "") || "+00:00"
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`
}
