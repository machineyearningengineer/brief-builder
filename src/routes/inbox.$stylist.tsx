// The stylist's inbox: conversations, the DM with its evidence highlighted, the brief with
// one-tap corrections, and the reply. Stacks list → thread → brief on a phone.
import { createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import braiderTags from '../../data/braider/tags.json'
import colouristTags from '../../data/colourist/tags.json'
import { post, stylistToken, useRoom } from '../client/room.ts'
import { STYLISTS, isStylist, type RoomMessage, type StylistKey } from '../shared/stylists.ts'

export const Route = createFileRoute('/inbox/$stylist')({
  beforeLoad: ({ params }) => {
    if (!isStylist(params.stylist)) throw notFound()
  },
  head: () => ({ meta: [{ title: 'Inbox · Brief Builder' }] }),
  component: InboxPage,
})

type Field = { path: string; label: string; options: string[] }
const COMMON_TAIL: Field[] = [
  { path: 'hair.texture', label: 'Hair texture', options: ['1', '2', '3a', '3b', '3c', '4a', '4b', '4c', 'relaxed'] },
  { path: 'next_action', label: 'Next step', options: ['ask', 'quote', 'offer_slots', 'decline', 'refer'] },
]
const FIELDS: Record<StylistKey, Field[]> = {
  braider: [
    { path: 'service', label: 'Service', options: braiderTags.fields.service },
    { path: 'look.length', label: 'Length', options: braiderTags.fields.length },
    { path: 'look.size', label: 'Size', options: braiderTags.fields.size },
    { path: 'look.ends', label: 'Ends', options: braiderTags.fields.ends },
    { path: 'look.colour', label: 'Colour', options: braiderTags.fields.colour },
    { path: 'hair_included', label: 'Hair included', options: ['yes', 'no'] },
    ...COMMON_TAIL,
  ],
  colourist: [
    { path: 'service', label: 'Service', options: colouristTags.fields.service },
    { path: 'look.length', label: 'Length', options: colouristTags.fields.length },
    { path: 'look.shade', label: 'Shade', options: colouristTags.fields.shade },
    { path: 'look.history', label: 'Colour history', options: colouristTags.fields.history },
    { path: 'patch_test', label: 'Patch test', options: ['needed', 'done'] },
    ...COMMON_TAIL,
  ],
}

const get = (o: any, path: string) => path.split('.').reduce((v, k) => v?.[k], o)
const words = (v: unknown) => (v === null || v === undefined || v === 'unknown' ? '' : String(v).replaceAll('_', ' '))
const shortId = (id: string) => id.slice(0, 4).toUpperCase()

function InboxPage() {
  const { stylist } = Route.useParams() as { stylist: StylistKey }
  const [token, setToken] = useState('')
  const [draftKey, setDraftKey] = useState('')
  useEffect(() => {
    setToken(stylistToken.get())
  }, [])
  const { messages, connected, denied } = useRoom(stylist, token ? { token } : null)
  const [selected, setSelected] = useState<string | null>(null)

  const list = useMemo(() => [...messages].reverse(), [messages])
  const current = messages.find((m) => m.id === selected) ?? list[0] ?? null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('textarea, input, select')) return
      const i = list.findIndex((m) => m.id === current?.id)
      if (e.key === 'j' && i < list.length - 1) setSelected(list[i + 1].id)
      if (e.key === 'k' && i > 0) setSelected(list[i - 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [list, current?.id])

  if (!token || denied) {
    return (
      <form className="gate" onSubmit={(e) => { e.preventDefault(); stylistToken.set(draftKey.trim()); setToken(draftKey.trim()) }}>
        <h1>{STYLISTS[stylist].name} inbox</h1>
        <p className="muted">{denied ? 'That stylist key didn’t work. Check it and try again.' : 'Enter the stylist key to open the inbox.'}</p>
        <label htmlFor="key" className="eyebrow">Stylist key</label>
        <input id="key" type="password" autoComplete="off" value={draftKey} onChange={(e) => setDraftKey(e.target.value)} />
        <button className="btn primary" type="submit" disabled={!draftKey.trim()}>Open inbox</button>
        <style>{INBOX_CSS}</style>
      </form>
    )
  }

  return (
    <div className="inbox" data-open={selected ? 'thread' : 'list'}>
      <aside className="list" aria-label="Conversations">
        <header>
          <h1>{STYLISTS[stylist].name}</h1>
          <span className={connected ? 'live on' : 'live'}>{connected ? 'Live' : 'Reconnecting…'}</span>
        </header>
        {list.length === 0 && <p className="muted empty">New DMs appear here the moment they’re sent.</p>}
        {list.map((m) => (
          <button key={m.id} className={m.id === current?.id ? 'row on' : 'row'} onClick={() => setSelected(m.id)}>
            <b>Client {shortId(m.clientId)}</b>
            <span>{m.text}</span>
            <small className="muted">{m.status === 'drafting' ? 'Drafting…' : m.status === 'replied' ? 'Replied' : m.corrected ? 'Corrected' : m.status === 'failed' ? 'Draft failed' : 'Draft ready'}</small>
          </button>
        ))}
      </aside>
      {current ? <Detail key={current.id} m={current} stylist={stylist} token={token} onBack={() => setSelected(null)} /> : <section className="thread" />}
      <style>{INBOX_CSS}</style>
    </div>
  )
}

function Detail({ m, stylist, token, onBack }: { m: RoomMessage; stylist: StylistKey; token: string; onBack: () => void }) {
  const brief = m.corrected ?? m.brief
  const [reply, setReply] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    setReply(m.reply ?? brief?.reply_draft ?? '')
  }, [m.id, m.status, brief?.reply_draft])

  const correct = async (path: string, value: string) => {
    if (!brief) return
    const next = structuredClone(brief)
    const keys = path.split('.')
    const last = keys.pop()!
    const parent = keys.reduce((v: any, k) => v[k], next)
    parent[last] = value
    setError('')
    try {
      await post(stylist, 'correct', { id: m.id, corrected: next }, token)
      setSaved(true)
      setTimeout(() => setSaved(false), 2400)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That correction didn’t save.')
    }
  }

  const send = async () => {
    setError('')
    try {
      await post(stylist, 'reply', { id: m.id, text: reply }, token)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The reply didn’t send.')
    }
  }

  return (
    <>
      <section className="thread">
        <button className="back btn" onClick={onBack}>All messages</button>
        <p className="eyebrow">Client {shortId(m.clientId)} · {new Date(m.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
        <p className="dm">{highlight(m.text, Object.values(brief?.evidence ?? {}) as string[])}</p>
        {m.status === 'drafting' && <p className="muted"><span className="dots"><i /><i /><i /></span> Drafting the brief…</p>}
        {m.status === 'failed' && <p className="error">The draft failed. Reply by hand or ask the client again.</p>}
        {brief && (
          <div className="reply">
            <label htmlFor="reply" className="eyebrow">{m.reply ? 'Sent' : 'Draft reply'}</label>
            <textarea id="reply" rows={5} value={reply} onChange={(e) => setReply(e.target.value)} disabled={!!m.reply} />
            {!m.reply && <button className="btn primary" onClick={send} disabled={!reply.trim()}>Send</button>}
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      <section className="brief" aria-label="Brief">
        <header>
          <h2>Brief</h2>
          {saved && <span className="saved settle">Fix sent to Mubit</span>}
        </header>
        {!brief && <p className="muted">The brief appears here once it’s drafted.</p>}
        {brief && FIELDS[stylist].map((f) => {
          const value = get(brief, f.path)
          const original = get(m.brief, f.path)
          const fixed = m.corrected && String(value) !== String(original)
          const cleared = m.guarded.includes(f.path)
          return (
            <label key={f.path} className={fixed ? 'field fixed' : 'field'}>
              <span className="name">{f.label}</span>
              <span className="value">
                {fixed && <s className="old">{words(original) || 'unknown'}</s>}
                <select value={value ?? 'unknown'} onChange={(e) => correct(f.path, e.target.value)} aria-label={`${f.label}, change to correct it`}>
                  <option value="unknown">unknown, ask</option>
                  {f.options.map((o) => <option key={o} value={o}>{words(o)}</option>)}
                </select>
                {cleared && <small className="muted">No evidence in the DM</small>}
              </span>
            </label>
          )
        })}
        {brief && (
          <dl className="meta">
            <div><dt>Missing</dt><dd>{(brief.missing ?? []).map(words).join(', ') || 'nothing'}</dd></div>
            <div><dt>Budget</dt><dd>{brief.budget_max_gbp ? `up to £${brief.budget_max_gbp}` : '—'}</dd></div>
            <div><dt>When</dt><dd>{[...(brief.when?.dates ?? []), brief.when?.window].filter(Boolean).join(', ') || '—'}</dd></div>
            <div><dt>Drafted by</dt><dd>gpt-6-luna via Mubit · {m.ms ? `${(m.ms / 1000).toFixed(1)} s` : '—'} · {m.correctionsUsed} past fixes used</dd></div>
            {m.requestId && <div><dt>Request</dt><dd className="mono">{m.requestId}</dd></div>}
          </dl>
        )}
      </section>
    </>
  )
}

// Marks each evidence quote where it appears in the DM, so every value shows its source.
function highlight(text: string, quotes: string[]) {
  const spans: [number, number][] = []
  const lower = text.toLowerCase()
  for (const q of quotes) {
    if (!q || q === '[photo]') continue
    const i = lower.indexOf(q.toLowerCase())
    if (i >= 0) spans.push([i, i + q.length])
  }
  spans.sort((a, b) => a[0] - b[0])
  const out: React.ReactNode[] = []
  let at = 0
  for (const [s, e] of spans) {
    if (s < at) continue
    out.push(text.slice(at, s), <mark key={s}>{text.slice(s, e)}</mark>)
    at = e
  }
  out.push(text.slice(at))
  return out
}

const INBOX_CSS = `
.gate { max-width: 380px; margin: 12vh auto; display: grid; gap: 12px; padding: 0 16px; }
.gate input { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: var(--surface); }
.inbox { display: grid; grid-template-columns: 300px minmax(0, 1fr) 340px; height: 100dvh; }
.list { border-right: 1px solid var(--line); overflow-y: auto; padding: 16px 12px; display: flex; flex-direction: column; gap: 4px; }
.list header { display: flex; justify-content: space-between; align-items: baseline; padding: 0 6px 12px; }
.list h1 { font-size: 20px; }
.live { font-size: 12px; color: var(--muted); }
.live.on { color: var(--good); }
.empty { padding: 0 6px; }
.row { text-align: left; border: 1px solid transparent; background: none; border-radius: 10px; padding: 10px; display: grid; gap: 2px; }
.row span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--muted); }
.row.on { background: var(--surface); border-color: var(--line); }
.thread { padding: 24px 32px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
.back { display: none; align-self: flex-start; }
.dm { font-size: 22px; line-height: 1.45; white-space: pre-wrap; margin: 0; max-width: 60ch; }
.reply { display: grid; gap: 8px; border: 1.5px dashed var(--line); border-radius: var(--radius); padding: 14px; }
.reply textarea { border: 0; background: transparent; resize: vertical; font-size: 17px; line-height: 1.5; }
.reply textarea:disabled { color: var(--muted); }
.reply .btn { justify-self: end; }
.brief { border-left: 1px solid var(--line); padding: 24px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.brief header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.brief h2 { font-size: 20px; }
.saved { color: var(--accent); font-weight: 600; font-size: 14px; }
.field { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px dashed var(--line); }
.field .name { color: var(--muted); font-size: 14px; }
.field .value { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; }
.field select { border: 1px solid transparent; background: transparent; border-radius: 8px; padding: 4px 6px; font-weight: 600; max-width: 100%; }
.field select:hover, .field select:focus { border-color: var(--line); background: var(--surface); }
.field.fixed select { color: var(--good); }
.old { color: var(--bad); }
.meta { margin: 14px 0 0; display: grid; gap: 8px; font-size: 14px; }
.meta div { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 10px; }
.meta dt { color: var(--muted); }
.meta dd { margin: 0; overflow-wrap: anywhere; }
.error { color: var(--bad); margin: 0; }
@media (max-width: 900px) {
  .inbox { grid-template-columns: minmax(0, 1fr); height: auto; }
  .inbox[data-open="list"] .thread, .inbox[data-open="list"] .brief { display: none; }
  .inbox[data-open="thread"] .list { display: none; }
  .back { display: inline-block; }
  .thread { padding: 16px; }
  .brief { border-left: 0; border-top: 1px solid var(--line); padding: 16px; }
  .dm { font-size: 19px; }
}
`
