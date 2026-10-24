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
import nailsProfile from "../../data/nails/profile.json"
import nailsTags from "../../data/nails/tags.json"
import nailsCorrections from "../../data/nails/corrections.jsonl?raw"
import braiderVoice from "../../data/braider/voice.jsonl?raw"
import colouristVoice from "../../data/colourist/voice.jsonl?raw"
import nailsVoice from "../../data/nails/voice.jsonl?raw"
import { datesNote, decide } from "../shared/decide.ts"
import { estimate } from "../shared/pricing.ts"
import type { RoomEvent, RoomMessage, StylistKey } from "../shared/stylists.ts"
import { callBrief } from "./brief-call.ts"
import { closestCorrections, closestVoice, correctionsBlock, editShare, voiceBlock, type Correction, type VoiceEdit } from "./corrections.ts"
import { applyTrustedPhotoTags, carryForward, guardEvidence, settledBlock } from "./guards.ts"
import { readPhotos, type ReaderFix } from "./photo-reader.ts"

const PROFILES = {
  braider: { profile: braiderProfile, tags: braiderTags, seedCorrections: braiderCorrections, seedVoice: braiderVoice },
  colourist: { profile: colouristProfile, tags: colouristTags, seedCorrections: colouristCorrections, seedVoice: colouristVoice },
  nails: { profile: nailsProfile, tags: nailsTags, seedCorrections: nailsCorrections, seedVoice: nailsVoice },
} as const

const parseJsonl = <T = Correction>(s: string): T[] => s.trim() ? s.trim().split("\n").map((l) => JSON.parse(l)) : []
const PHOTO_LIKENESS = 0.5
// A draft or re-draft still unfinished after this long is retried once by the alarm, then failed.
// Longer than one model call's whole budget (photo reader plus brief), so it never races a live call.
const STUCK_MS = 200_000
const SIGN_OFF: Record<StylistKey, string> = { braider: "Amara x", colourist: "Lou", nails: "Jade x" }
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
  ...m, photoTags: null, brief: null, corrected: null, changed: [], requestId: null, ms: null, correctionsUsed: 0, guarded: [], baseline: null, redrafting: false,
  editShare: null, sentPrice: null, hidden: false,
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
    // When the stylist changes something the photo reader said: what it said, what's right.
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS reader_fixes (field TEXT, said TEXT, now TEXT, created_at INTEGER)`)
    // Every time the stylist rewrote a draft before sending it.
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS voice (id TEXT PRIMARY KEY, dm TEXT, draft TEXT, sent TEXT, created_at INTEGER)`)
    // A photo fix remembers the rest of that photo's tags, so it only applies to photos like it.
    if (!ctx.storage.sql.exec(`PRAGMA table_info(reader_fixes)`).toArray().some((c) => c.name === "sig")) ctx.storage.sql.exec(`ALTER TABLE reader_fixes ADD COLUMN sig TEXT`)
    // Rooms created before photos existed get the column in place.
    const cols = ctx.storage.sql.exec(`PRAGMA table_info(messages)`).toArray().map((c) => c.name)
    if (!cols.includes("images")) ctx.storage.sql.exec(`ALTER TABLE messages ADD COLUMN images TEXT`)
    if (!cols.includes("baseline")) ctx.storage.sql.exec(`ALTER TABLE messages ADD COLUMN baseline TEXT`)
    if (!cols.includes("redrafting")) ctx.storage.sql.exec(`ALTER TABLE messages ADD COLUMN redrafting INTEGER`)
    if (!cols.includes("edit_share")) ctx.storage.sql.exec(`ALTER TABLE messages ADD COLUMN edit_share REAL`)
    if (!cols.includes("sent_price")) ctx.storage.sql.exec(`ALTER TABLE messages ADD COLUMN sent_price INTEGER`)
    if (!cols.includes("extra")) ctx.storage.sql.exec(`ALTER TABLE messages ADD COLUMN extra TEXT`)
    if (!cols.includes("hidden")) ctx.storage.sql.exec(`ALTER TABLE messages ADD COLUMN hidden INTEGER`)
    if (!cols.includes("booking")) ctx.storage.sql.exec(`ALTER TABLE messages ADD COLUMN booking TEXT`)
    // Drafts and re-drafts in flight. An alarm finishes or fails any left behind by a restart.
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS inflight (id TEXT, kind TEXT, started_at INTEGER, attempts INTEGER, PRIMARY KEY (id, kind))`)
    // Clients whose threads the stylist keeps off the stage, including their later messages.
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS hidden_clients (client_id TEXT PRIMARY KEY)`)
    // Private pages for the control page, such as the demo map. Kept out of the public repo and
    // out of reach of a reset.
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS docs (name TEXT PRIMARY KEY, html TEXT, updated_at INTEGER)`)
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
    if (action === "doc") return this.doc(request, itemId ?? "", isStylist)
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
      case "hide": return this.hide(body)
      case "retry": return this.retry(body)
      case "book": return this.book(body)
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
        reply, request_id, ms, corrections_used, guarded, images, baseline, redrafting, edit_share, sent_price, extra, hidden, booking) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      m.id, m.clientId, m.createdAt, m.receivedAt, m.text, JSON.stringify(m.photoTags), m.status, JSON.stringify(m.brief),
      JSON.stringify(m.corrected), JSON.stringify(m.changed), m.reply, m.requestId, m.ms, m.correctionsUsed, JSON.stringify(m.guarded),
      JSON.stringify(m.images), JSON.stringify(m.baseline), m.redrafting ? 1 : 0, m.editShare, m.sentPrice, JSON.stringify(m.extra ?? []), m.hidden ? 1 : 0, JSON.stringify(m.booking ?? null),
    )
    this.broadcast({ type: "message", message: m })
  }

  // This client's earlier turns, oldest first, each with the brief as it stood afterwards:
  // the stylist's fixes win over the draft, and the reply they actually sent wins over the
  // drafted one. Capped so a long thread stays a reasonable size.
  private history(m: RoomMessage) {
    return this.messages()
      .filter((x) => x.clientId === m.clientId && x.id !== m.id && x.createdAt < m.createdAt && (x.corrected ?? x.brief))
      .slice(-6)
      .map((x) => {
        const b = { ...(x.corrected ?? x.brief)! }
        // The client only saw what she sent; a draft she never sent isn't part of the conversation.
        if (x.reply) b.reply_draft = x.reply
        else delete b.reply_draft
        // A photo tag the turn's final brief contradicts (the stylist fixed it) isn't resent,
        // so the model can't pick the reader's guess over her fix.
        const tags = x.photoTags?.filter((t) => agrees(b, t)) ?? null
        return { dm: { received_at: x.receivedAt, text: x.text, photo: tags ? { reader_output: tags } : null }, brief: b }
      })
  }

  // Photo fixes she made on photos that look like this one (most of their other tags agree):
  // the tag she corrected is swapped for hers. A fix on a different-looking photo changes nothing.
  private applySimilarFixes(tags: RoomMessage["photoTags"]): RoomMessage["photoTags"] {
    if (!tags) return tags
    const rows = this.ctx.storage.sql.exec(`SELECT field, said, now, sig FROM reader_fixes WHERE sig IS NOT NULL ORDER BY created_at DESC LIMIT 40`).toArray()
    let out = tags
    for (const r of rows) {
      const field = r.field as string
      if (!out.some((t) => t.field === field && t.tag === r.said)) continue
      const theirs = new Set(JSON.parse(r.sig as string) as string[])
      const ours = new Set(out.filter((t) => t.field !== field).map((t) => `${t.field}=${t.tag}`))
      const shared = [...ours].filter((x) => theirs.has(x)).length
      if (shared / (new Set([...ours, ...theirs]).size || 1) < PHOTO_LIKENESS) continue
      out = out.flatMap((t) => (t.field === field && t.tag === r.said ? (r.now === "none" || r.now === "unknown" ? [] : [{ ...t, tag: r.now as string, via: "fix" as const }]) : [t]))
    }
    return out
  }

  // Every value in her tag list, masked out of voice examples.
  private voiceTerms(): string[] {
    const fields = (PROFILES[this.stylist!].tags as any).fields as Record<string, string[]>
    return [...new Set(Object.values(fields).flat().filter((t) => t.length > 2))]
  }

  private voicePool(): VoiceEdit[] {
    const live = this.ctx.storage.sql.exec(`SELECT dm, draft, sent FROM voice ORDER BY created_at`).toArray() as unknown as VoiceEdit[]
    return [...parseJsonl<VoiceEdit>(PROFILES[this.stylist!].seedVoice), ...live]
  }

  // The stylist's most recent photo corrections, one per field and wrong tag.
  private readerFixes(): ReaderFix[] {
    const rows = this.ctx.storage.sql.exec(`SELECT field, said, now FROM reader_fixes ORDER BY created_at DESC LIMIT 40`).toArray()
    const seen = new Set<string>()
    return rows.flatMap((r) => {
      const key = `${r.field}:${r.said}`
      if (seen.has(key)) return []
      seen.add(key)
      return [{ field: r.field as string, said: r.said as string, now: r.now as string }]
    })
  }

  private correctionPool(): Correction[] {
    const live = this.ctx.storage.sql.exec(`SELECT json FROM corrections ORDER BY created_at`).toArray().map((r) => JSON.parse(r.json as string))
    return [...parseJsonl(PROFILES[this.stylist!].seedCorrections), ...live]
  }

  private async receiveDm(body: { clientId?: string; text?: string; imageIds?: unknown; key?: unknown }) {
    const text = String(body.text ?? "").trim().slice(0, MAX_DM)
    if (!CLIENT_ID.test(String(body.clientId ?? ""))) return Response.json({ error: "Unknown client." }, { status: 400 })
    // The phone sends a key with each DM, so a retried request never creates the message twice.
    const key = typeof body.key === "string" && CLIENT_ID.test(body.key) ? body.key : null
    const existing = key ? this.message(key) : null
    if (existing) return Response.json({ message: existing.clientId === body.clientId ? clientView(existing) : null })
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
      id: key ?? crypto.randomUUID(), clientId: String(body.clientId).slice(0, 64), createdAt: Date.now(),
      receivedAt: londonTimestamp(new Date()), text, photoTags: null, images, status: draft ? "drafting" : "failed",
      brief: null, corrected: null, changed: [], reply: null, requestId: null, ms: null, correctionsUsed: 0, guarded: [], baseline: null,
      redrafting: false, editShare: null, sentPrice: null, extra: [], booking: null,
      hidden: this.ctx.storage.sql.exec(`SELECT 1 FROM hidden_clients WHERE client_id = ?`, body.clientId).toArray().length > 0,
    }
    this.save(m)
    if (draft) this.ctx.waitUntil(this.draft(m))
    return Response.json({ message: m })
  }

  // Drafting and re-drafting are tracked durably: if this object restarts mid-call, the alarm
  // retries once, then gives up cleanly, so no message stays "drafting" for ever.
  private track(id: string, kind: "draft" | "redraft") {
    this.ctx.storage.sql.exec(`INSERT INTO inflight VALUES (?, ?, ?, 0) ON CONFLICT (id, kind) DO UPDATE SET started_at = excluded.started_at`, id, kind, Date.now())
    void this.ensureAlarm()
  }

  private untrack(id: string, kind: "draft" | "redraft") {
    this.ctx.storage.sql.exec(`DELETE FROM inflight WHERE id = ? AND kind = ?`, id, kind)
  }

  private async ensureAlarm() {
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now() + STUCK_MS)
  }

  async alarm() {
    const rows = this.ctx.storage.sql.exec(`SELECT id, kind, started_at, attempts FROM inflight`).toArray()
    const stuck = rows.filter((r) => Number(r.started_at) < Date.now() - STUCK_MS)
    for (const r of stuck) {
      const id = String(r.id)
      const kind = r.kind as "draft" | "redraft"
      const m = this.message(id)
      if (!m) { this.untrack(id, kind); continue }
      if (Number(r.attempts) < 1) {
        this.ctx.storage.sql.exec(`UPDATE inflight SET attempts = attempts + 1, started_at = ? WHERE id = ? AND kind = ?`, Date.now(), id, kind)
        if (kind === "draft") await this.draftOnce(m).catch(() => this.failDraft(id))
        else await this.redraftOnce(id).catch(() => this.failRedraft(id))
        this.untrack(id, kind)
      } else {
        this.untrack(id, kind)
        if (kind === "draft") this.failDraft(id)
        else this.failRedraft(id)
      }
    }
    if (this.ctx.storage.sql.exec(`SELECT 1 FROM inflight LIMIT 1`).toArray().length) await this.ctx.storage.setAlarm(Date.now() + STUCK_MS)
  }

  private failDraft(id: string) {
    const m = this.message(id)
    if (m && !m.brief) this.save({ ...m, status: "failed" })
  }

  private failRedraft(id: string) {
    const m = this.message(id)
    if (m?.redrafting) this.save({ ...m, redrafting: false })
  }

  private async draft(m: RoomMessage) {
    this.track(m.id, "draft")
    try {
      await this.draftOnce(m)
    } catch {
      this.failDraft(m.id)
    } finally {
      this.untrack(m.id, "draft")
    }
  }

  private async draftOnce(m: RoomMessage) {
    const { profile, tags } = PROFILES[this.stylist!]
    // Photos are read into tags first (through Mubit, like every model call); the brief model
    // only ever sees the tags, never the image.
    if (m.images.length) {
      const photos = m.images.flatMap((id) => {
        const r = this.ctx.storage.sql.exec(`SELECT mime, bytes FROM images WHERE id = ?`, id).toArray()[0]
        return r ? [{ mime: r.mime as string, bytes: r.bytes as ArrayBuffer }] : []
      })
      const read = await readPhotos({ key: this.env.MUBIT_API_KEY, tags: tags as any, photos, fixes: this.readerFixes() }).catch(() => null)
      m = { ...m, photoTags: this.applySimilarFixes(read) }
      // Merge into the stored message, never overwrite it: it may have changed while we waited
      // (hidden from the stage, say).
      this.save({ ...(this.message(m.id) ?? m), photoTags: m.photoTags })
    }
    const used = closestCorrections(m.text, this.correctionPool())
    const dm = { received_at: m.receivedAt, text: m.text, photo: m.photoTags ? { reader_output: m.photoTags } : null }
    const history = this.history(m)
    const failed = (e: unknown) => ({ status: 0, ms: 0, requestId: null, brief: null, error: String(e), tokensIn: null, tokensOut: null })
    // The real draft, with this stylist's closest fixes, and the plain model alongside it for
    // the before-and-after. The plain call is never recorded, so it can't train the adapter.
    // Both see the client's conversation so far, so a follow-up continues the same brief.
    const [result, plain] = await Promise.all([
      callBrief({ key: this.env.MUBIT_API_KEY, profile: profile as any, tags: tags as any, effort: "low", dm, history, corrections: correctionsBlock(used) + voiceBlock(closestVoice(m.text, this.voicePool()), this.voiceTerms()) + settledBlock(history.at(-1)?.brief ?? null) + datesNote(m.text, m.receivedAt) }).catch(failed),
      callBrief({ key: this.env.MUBIT_API_KEY, profile: profile as any, tags: tags as any, effort: "low", dm, history, record: "off" }).catch(failed),
    ])
    const plainBrief = plain.brief as Record<string, any> | null
    const baseline = plainBrief && typeof plainBrief.reply_draft === "string"
      ? { reply: plainBrief.reply_draft.replace(/\s*[—–]\s*/g, ", "), nextAction: String(plainBrief.next_action ?? ""), ms: plain.ms }
      : null
    const brief = result.brief as Record<string, any> | null
    // Photos sent earlier in the conversation still count: "does that include hair?" is about them.
    const threadTags = [...history.flatMap((h) => h.dm.photo?.reader_output ?? []), ...(m.photoTags ?? [])]
    const trusted = new Set(threadTags.filter((t) => t.confidence >= (tags as any).trust_threshold).map((t) => t.field))
    if (brief && threadTags.length) {
      applyTrustedPhotoTags(brief, threadTags, (tags as any).trust_threshold)
      // A field the photo now answers is no longer something to ask about.
      if (Array.isArray(brief.missing)) brief.missing = brief.missing.filter((k: string) => brief.look?.[k] === undefined || brief.look[k] === "unknown")
    }
    // Evidence can come from any message in the conversation, not just the newest one.
    const said = [...history.map((h) => h.dm.text), m.text].join("\n")
    const guarded = brief ? guardEvidence(brief, said, trusted) : []
    // A field carried forward from earlier in the thread wasn't really cleared.
    const carried = brief ? carryForward(brief, history.at(-1)?.brief ?? null, m.text) : []
    const stillCleared = guarded.filter((p) => !carried.includes(p))
    // Next step, what's missing, dates from day words and time windows are decided in code.
    if (brief) decide(this.stylist!, brief, { text: m.text, received_at: m.receivedAt, photo: { reader_output: threadTags } })
    // House style for replies: no em dashes. Tidied here, not in the instructions, so the
    // Mubit task (keyed on the exact instructions) keeps its examples.
    if (brief && typeof brief.reply_draft === "string") brief.reply_draft = brief.reply_draft.replace(/\s*[—–]\s*/g, ", ")
    // Same here: only the drafting fields are written onto whatever the message is now.
    const now = this.message(m.id) ?? m
    if (now.reply) return // she already answered by hand while this was drafting
    this.save({ ...now, photoTags: m.photoTags, status: brief ? "drafted" : "failed", brief, requestId: result.requestId, ms: result.ms, correctionsUsed: used.length, guarded: stillCleared, baseline })
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
    for (const f of readerFixes(m.photoTags, m.brief, body.corrected, (PROFILES[this.stylist!].tags as any).trust_threshold)) {
      const sig = (m.photoTags ?? []).filter((t) => t.field !== f.field).map((t) => `${t.field}=${t.tag}`)
      this.ctx.storage.sql.exec(`INSERT INTO reader_fixes VALUES (?, ?, ?, ?, ?)`, f.field, f.said, f.now, Date.now(), JSON.stringify(sig))
    }
    this.save({ ...m, corrected: body.corrected, changed, redrafting: !m.reply })
    // Later messages in this thread that she hasn't answered yet are drafted again on top of the
    // fix, in order, after this one's reply is re-drafted.
    const later = this.messages().filter((x) => x.clientId === m.clientId && x.createdAt > m.createdAt && !x.reply && x.status === "drafted")
    for (const x of later) this.save({ ...x, status: "drafting" })
    this.ctx.waitUntil((async () => {
      if (!m.reply) await this.redraft(m.id)
      for (const x of later) { const fresh = this.message(x.id); if (fresh) await this.draft(fresh) }
    })())
    return Response.json({ changed })
  }

  // After a fix, the same DM goes back through Mubit with the stylist's correction leading the
  // worked examples, so the reply matches the corrected brief. Mubit records this answer: it's
  // the corrected example the adapter trains on. Only the reply text is taken from it; the
  // stylist's corrected fields stay exactly as they set them.
  private async redraft(id: string) {
    this.track(id, "redraft")
    try {
      await this.redraftOnce(id)
    } catch {
      this.failRedraft(id)
    } finally {
      this.untrack(id, "redraft")
    }
  }

  private async redraftOnce(id: string) {
    const m = this.message(id)
    if (!m?.corrected) return
    const { profile, tags } = PROFILES[this.stylist!]
    const pool = this.correctionPool()
    const own = pool.filter((c) => c.id === m.id)
    const others = closestCorrections(m.text, pool.filter((c) => c.id !== m.id), 2)
    const result = await callBrief({
      key: this.env.MUBIT_API_KEY, profile: profile as any, tags: tags as any, effort: "low",
      dm: { received_at: m.receivedAt, text: m.text, photo: m.photoTags ? { reader_output: m.photoTags } : null },
      corrections: correctionsBlock([...own, ...others]) + voiceBlock(closestVoice(m.text, this.voicePool()), this.voiceTerms()) + datesNote(m.text, m.receivedAt),
      history: this.history(m),
    }).catch(() => null)
    const latest = this.message(id)
    if (!latest?.corrected) return
    // A newer fix landed while this one was re-drafting: that fix's own re-draft owns the reply.
    const { reply_draft: _a, ...was } = m.corrected
    const { reply_draft: _b, ...is } = latest.corrected
    if (JSON.stringify(was) !== JSON.stringify(is)) return
    const reply = (result?.brief as any)?.reply_draft
    const corrected = typeof reply === "string" ? { ...latest.corrected, reply_draft: reply.replace(/\s*[—–]\s*/g, ", ") } : latest.corrected
    this.save({ ...latest, corrected, redrafting: false })
  }

  // She confirms the booking: the client gets one clear message with the day, time, what's
  // booked and the total from her price list, and every screen shows it as booked.
  private book(body: { id?: string; date?: string; time?: string }) {
    const m = body.id ? this.message(body.id) : null
    const date = String(body.date ?? "")
    const time = String(body.time ?? "")
    if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return Response.json({ error: "Pick a day and a time." }, { status: 400 })
    const brief = m.corrected ?? m.brief
    const price = brief ? estimate(this.stylist!, brief) : null
    const SAID: Record<string, string> = {
      butt: "bum length", waist: "waist length", mid_back: "mid-back", bra_strap: "bra-strap length", shoulder: "shoulder length",
      box_braids: "box braids", french_curls: "French curls", curly_ends: "curly ends", boho_throughout: "boho curls throughout",
      lived_in_blonde: "lived-in blonde", acrylic_full_set: "acrylic set", gel_extensions: "gel extensions", biab: "BIAB", xl: "extra long", cat_eye: "cat eye",
    }
    const words = (v: unknown) => SAID[String(v)] ?? String(v).replaceAll("_", " ")
    const look = brief?.look ?? {}
    const summary = [brief?.service, look.length, look.size ?? look.shade, look.ends, look.shape, look.finish]
      .filter((v) => v && v !== "unknown" && v !== "straight" && v !== "plain").map(words).join(", ")
    const day = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    const [h, min] = time.split(":").map(Number)
    const clock = `${h % 12 || 12}${min ? `:${String(min).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`
    const sign = SIGN_OFF[this.stylist!]
    const total = price && !price.from ? `£${price.amount}` : price ? `from £${price.amount}` : null
    const text = `You’re booked in for ${day} at ${clock}${summary ? `: ${summary}` : ""}${total ? `, ${total}` : ""}${price?.note ? ` (${price.note})` : ""}. See you then! ${sign}`
    const booking = { date, time, total: price?.amount ?? null, summary }
    const done = m.reply ? { ...m, extra: [...m.extra, text].slice(-4), booking } : { ...m, reply: text, status: "replied" as const, booking }
    this.save(done)
    return Response.json({ booking })
  }

  // Drafts a failed message again, when the stylist asks.
  private retry(body: { id?: string }) {
    const m = body.id ? this.message(body.id) : null
    if (!m || m.reply || m.status === "drafting") return Response.json({ error: "Nothing to retry." }, { status: 400 })
    const again = { ...m, status: "drafting" as const }
    this.save(again)
    this.ctx.waitUntil(this.draft(again))
    return Response.json({ ok: true })
  }

  // Keeps one client's thread off the projector (or shows it again). Their chat is unchanged.
  private hide(body: { clientId?: string; hidden?: boolean }) {
    const client = String(body.clientId ?? "")
    if (!CLIENT_ID.test(client)) return Response.json({ error: "Unknown client." }, { status: 400 })
    const hidden = body.hidden !== false
    if (hidden) this.ctx.storage.sql.exec(`INSERT OR IGNORE INTO hidden_clients VALUES (?)`, client)
    else this.ctx.storage.sql.exec(`DELETE FROM hidden_clients WHERE client_id = ?`, client)
    for (const m of this.messages().filter((x) => x.clientId === client)) this.save({ ...m, hidden })
    return Response.json({ hidden })
  }

  private async reply(body: { id?: string; text?: string; append?: boolean }) {
    const m = body.id ? this.message(body.id) : null
    const text = String(body.text ?? "").trim().slice(0, MAX_DM)
    if (!m || !text) return Response.json({ error: "A reply needs text." }, { status: 400 })
    // A follow-up after the reply, such as a price correction.
    if (body.append) {
      if (!m.reply) return Response.json({ error: "Send the reply first." }, { status: 400 })
      this.save({ ...m, extra: [...m.extra, text].slice(-4), sentPrice: estimate(this.stylist!, m.corrected ?? m.brief)?.amount ?? m.sentPrice })
      return Response.json({ ok: true })
    }
    const final = m.corrected ?? m.brief
    const draft = typeof final?.reply_draft === "string" ? final.reply_draft : null
    const share = draft ? editShare(draft, text) : null
    // A real rewrite is how she talks; a typo fix isn't worth learning from.
    if (draft && share !== null && share >= 0.1) {
      this.ctx.storage.sql.exec(`INSERT OR REPLACE INTO voice VALUES (?, ?, ?, ?, ?)`, m.id, m.text, draft, text, Date.now())
    }
    this.save({ ...m, reply: text, status: "replied", editShare: share, sentPrice: estimate(this.stylist!, final)?.amount ?? null })
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

  private async doc(request: Request, name: string, isStylist: boolean) {
    if (!isStylist) return new Response("Only the stylist can do that.", { status: 401 })
    if (!/^[a-z0-9-]{1,40}$/.test(name)) return new Response("Not found", { status: 404 })
    if (request.method === "PUT") {
      const html = await request.text()
      if (!html || html.length > 1_000_000) return new Response("Expected a page under 1 MB", { status: 400 })
      this.ctx.storage.sql.exec(`INSERT OR REPLACE INTO docs (name, html, updated_at) VALUES (?, ?, ?)`, name, html, Date.now())
      return Response.json({ ok: true })
    }
    const row = this.ctx.storage.sql.exec(`SELECT html, updated_at FROM docs WHERE name = ?`, name).toArray()[0]
    if (!row) return new Response("Not found", { status: 404 })
    return new Response(row.html as string, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-updated-at": String(row.updated_at) } })
  }

  private reset() {
    this.ctx.storage.sql.exec(`DELETE FROM messages`)
    this.ctx.storage.sql.exec(`DELETE FROM corrections`)
    this.ctx.storage.sql.exec(`DELETE FROM images`)
    this.ctx.storage.sql.exec(`DELETE FROM reader_fixes`)
    this.ctx.storage.sql.exec(`DELETE FROM voice`)
    this.ctx.storage.sql.exec(`DELETE FROM hidden_clients`)
    this.broadcast({ type: "reset" })
    return Response.json({ ok: true })
  }
}

// Which trusted photo tags the stylist overruled in a correction. A scalar field counts when
// the stylist changed what the photo put there; an extra counts when the stylist removed it,
// paired with whatever extra they added instead ("none" if they only removed it).
function agrees(brief: Record<string, any>, t: { field: string; tag: string }) {
  const v = t.field === "service" ? brief.service : brief.look?.[t.field]
  return v === undefined || v === "unknown" || v === t.tag || (Array.isArray(v) && v.includes(t.tag))
}

function readerFixes(tags: RoomMessage["photoTags"], before: any, after: any, threshold: number): ReaderFix[] {
  const out: ReaderFix[] = []
  for (const t of tags ?? []) {
    if (t.confidence < threshold) continue
    if (t.field === "service") {
      if (before?.service === t.tag && after?.service !== t.tag) out.push({ field: "service", said: t.tag, now: String(after?.service ?? "unknown") })
      continue
    }
    const was = before?.look?.[t.field]
    const is = after?.look?.[t.field]
    if (Array.isArray(was) && Array.isArray(is)) {
      if (was.includes(t.tag) && !is.includes(t.tag)) out.push({ field: t.field, said: t.tag, now: is.find((x: string) => !was.includes(x)) ?? "none" })
    } else if (was === t.tag && is !== t.tag) {
      out.push({ field: t.field, said: t.tag, now: String(is ?? "unknown") })
    }
  }
  return out
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
    correctionsUsed: r.corrections_used ?? 0, guarded: JSON.parse(r.guarded ?? "[]"), images: JSON.parse(r.images ?? "[]") ?? [], baseline: JSON.parse(r.baseline ?? "null"), redrafting: !!r.redrafting,
    editShare: r.edit_share ?? null, sentPrice: r.sent_price ?? null, extra: JSON.parse(r.extra ?? "[]") ?? [], hidden: !!r.hidden, booking: JSON.parse(r.booking ?? "null"),
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
