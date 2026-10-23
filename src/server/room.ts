// One stylist's live inbox: a Durable Object holding that stylist's DMs, briefs and
// corrections in its own SQLite, and pushing every change to the chat, inbox and stage
// screens over WebSockets.
import { DurableObject } from "cloudflare:workers"
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

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const [, , , stylist, action] = url.pathname.split("/") // /api/room/<stylist>/<action>
    this.remember(stylist as StylistKey)
    if (action === "ws") {
      if (request.headers.get("upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 })
      const pair = new WebSocketPair()
      this.ctx.acceptWebSocket(pair[1])
      return new Response(null, { status: 101, webSocket: pair[0] })
    }
    if (action === "state" && request.method === "GET") return Response.json({ messages: this.messages() })
    if (request.method !== "POST") return new Response("Not found", { status: 404 })
    const body: any = await request.json().catch(() => ({}))
    switch (action) {
      case "dm": return this.receiveDm(body)
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

  private broadcast(event: RoomEvent) {
    const data = JSON.stringify(event)
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data)
      } catch {
        // A closed socket is cleaned up by the runtime.
      }
    }
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
    if (!text || !body.clientId) return Response.json({ error: "A message needs text." }, { status: 400 })
    const m: RoomMessage = {
      id: crypto.randomUUID(), clientId: String(body.clientId).slice(0, 64), createdAt: Date.now(),
      receivedAt: londonTimestamp(new Date()), text, photoTags: body.photoTags ?? null, status: "drafting",
      brief: null, corrected: null, changed: [], reply: null, requestId: null, ms: null, correctionsUsed: 0, guarded: [],
    }
    this.save(m)
    this.ctx.waitUntil(this.draft(m))
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
