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
import type { RoomEvent, RoomMessage, StylistKey } from "../shared/stylists.ts"
import { callBrief } from "./brief-call.ts"
import { closestCorrections, correctionsBlock, type Correction } from "./corrections.ts"
import { guardEvidence } from "./guards.ts"

const PROFILES = {
  braider: { profile: braiderProfile, tags: braiderTags, seedCorrections: braiderCorrections },
  colourist: { profile: colouristProfile, tags: colouristTags, seedCorrections: "" },
} as const

const parseJsonl = (s: string): Correction[] => s.trim() ? s.trim().split("\n").map((l) => JSON.parse(l)) : []
const MAX_DM = 1000
const MAX_CORRECTION_BYTES = 8_000
const DM_PER_WINDOW = 8
const DM_PER_ROOM_WINDOW = 60 // past this, DMs land undrafted
const DM_ROOM_HARD_CAP = 300 // past this, refused, so storage can't be flooded
const DM_WINDOW_MS = 10 * 60_000
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
    const row = ctx.storage.sql.exec(`SELECT value FROM meta WHERE key = 'stylist'`).toArray()[0]
    if (row) this.stylist = row.value as StylistKey
  }

  // Two kinds of caller. The stylist proves themselves with STYLIST_TOKEN and sees everything.
  // Anyone else is a client, known only by the random id their phone made, who may send DMs
  // and sees only their own thread: their messages and the stylist's replies, never briefs.
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const [, , , stylist, action] = url.pathname.split("/") // /api/room/<stylist>/<action>
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
      `INSERT OR REPLACE INTO messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      m.id, m.clientId, m.createdAt, m.receivedAt, m.text, JSON.stringify(m.photoTags), m.status, JSON.stringify(m.brief),
      JSON.stringify(m.corrected), JSON.stringify(m.changed), m.reply, m.requestId, m.ms, m.correctionsUsed, JSON.stringify(m.guarded),
    )
    this.broadcast({ type: "message", message: m })
  }

  private correctionPool(): Correction[] {
    const live = this.ctx.storage.sql.exec(`SELECT json FROM corrections ORDER BY created_at`).toArray().map((r) => JSON.parse(r.json as string))
    return [...parseJsonl(PROFILES[this.stylist!].seedCorrections), ...live]
  }

  private async receiveDm(body: { clientId?: string; text?: string; photoTags?: RoomMessage["photoTags"] }) {
    const text = String(body.text ?? "").trim().slice(0, MAX_DM)
    if (!text) return Response.json({ error: "A message needs text." }, { status: 400 })
    if (!CLIENT_ID.test(String(body.clientId ?? ""))) return Response.json({ error: "Unknown client." }, { status: 400 })
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
    if (roomRecent >= DM_ROOM_HARD_CAP) return Response.json({ error: "The stylist's inbox is full right now. Try again in a few minutes." }, { status: 429 })
    const draft = roomRecent < DM_PER_ROOM_WINDOW
    const photoTags = cleanPhotoTags(body.photoTags)
    const m: RoomMessage = {
      id: crypto.randomUUID(), clientId: String(body.clientId).slice(0, 64), createdAt: Date.now(),
      receivedAt: londonTimestamp(new Date()), text, photoTags, status: draft ? "drafting" : "failed",
      brief: null, corrected: null, changed: [], reply: null, requestId: null, ms: null, correctionsUsed: 0, guarded: [],
    }
    this.save(m)
    if (draft) this.ctx.waitUntil(this.draft(m))
    return Response.json({ message: m })
  }

  private async draft(m: RoomMessage) {
    const { profile, tags } = PROFILES[this.stylist!]
    const used = closestCorrections(m.text, this.correctionPool())
    const result = await callBrief({
      key: this.env.MUBIT_API_KEY, profile: profile as any, tags: tags as any, effort: "low",
      dm: { received_at: m.receivedAt, text: m.text, photo: m.photoTags ? { reader_output: m.photoTags } : null },
      corrections: correctionsBlock(used),
    }).catch((e) => ({ status: 0, ms: 0, requestId: null, brief: null, error: String(e), tokensIn: null, tokensOut: null }))
    const brief = result.brief as Record<string, any> | null
    const trusted = new Set((m.photoTags ?? []).filter((t) => t.confidence >= (tags as any).trust_threshold).map((t) => t.field))
    const guarded = brief ? guardEvidence(brief, m.text, trusted) : []
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

  private reset() {
    this.ctx.storage.sql.exec(`DELETE FROM messages`)
    this.ctx.storage.sql.exec(`DELETE FROM corrections`)
    this.broadcast({ type: "reset" })
    return Response.json({ ok: true })
  }
}

// Photo tags come from the client side for now, so keep only a few short, well-formed ones.
function cleanPhotoTags(raw: unknown): RoomMessage["photoTags"] {
  if (!Array.isArray(raw)) return null
  const tags = raw.slice(0, 12).flatMap((t) => {
    const { field, tag, confidence } = (t ?? {}) as Record<string, unknown>
    if (typeof field !== "string" || typeof tag !== "string" || typeof confidence !== "number") return []
    if (field.length > 20 || tag.length > 40 || !(confidence >= 0 && confidence <= 1)) return []
    return [{ field, tag, confidence }]
  })
  return tags.length ? tags : null
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
    correctionsUsed: r.corrections_used ?? 0, guarded: JSON.parse(r.guarded ?? "[]"),
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
