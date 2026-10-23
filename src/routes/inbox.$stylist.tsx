// The stylist's inbox, laid out like an iPad mail app: conversations, the DM thread with the
// reply, and the brief as a salon service sheet where every field is a one-tap correction.
// Three columns on a wide iPad, two on a smaller one, and a slide-in thread on a phone.
import { createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import braiderTags from '../../data/braider/tags.json'
import colouristTags from '../../data/colourist/tags.json'
import { BackIcon, SendIcon, SunMoonIcon } from '../client/icons.tsx'
import { imageUrlForStylist, post, stylistToken, useRoom } from '../client/room.ts'
import { estimate } from '../shared/pricing.ts'
import { STYLISTS, isStylist, type RoomMessage, type StylistKey } from '../shared/stylists.ts'

export const Route = createFileRoute('/inbox/$stylist')({
  beforeLoad: ({ params }) => {
    if (!isStylist(params.stylist)) throw notFound()
  },
  head: () => ({ meta: [{ title: 'Inbox' }] }),
  component: InboxPage,
})

type Field = { path: string; label: string; options: string[] }
type Section = { title: string; fields: Field[] }
const TEXTURES = ['1', '2', '3a', '3b', '3c', '4a', '4b', '4c', 'relaxed']
const SHEET: Record<StylistKey, Section[]> = {
  braider: [
    { title: 'Look', fields: [
      { path: 'look.length', label: 'Length', options: braiderTags.fields.length },
      { path: 'look.size', label: 'Size', options: braiderTags.fields.size },
      { path: 'look.ends', label: 'Ends', options: braiderTags.fields.ends },
      { path: 'look.colour', label: 'Colour', options: braiderTags.fields.colour },
    ] },
    { title: 'Hair', fields: [
      { path: 'hair.texture', label: 'Texture', options: TEXTURES },
      { path: 'hair.current', label: 'Current length', options: ['short', 'medium', 'long'] },
      { path: 'hair_included', label: 'Hair included', options: ['yes', 'no'] },
    ] },
  ],
  colourist: [
    { title: 'Look', fields: [
      { path: 'look.shade', label: 'Shade', options: colouristTags.fields.shade },
      { path: 'look.length', label: 'Length', options: colouristTags.fields.length },
      { path: 'look.history', label: 'Colour history', options: colouristTags.fields.history },
    ] },
    { title: 'Hair', fields: [
      { path: 'hair.texture', label: 'Texture', options: TEXTURES },
      { path: 'patch_test', label: 'Patch test', options: ['needed', 'done'] },
    ] },
  ],
}
const SERVICES: Record<StylistKey, string[]> = { braider: braiderTags.fields.service, colourist: colouristTags.fields.service }
const NEXT = ['ask', 'quote', 'offer_slots', 'decline', 'refer']
const ASK: Record<string, string> = {
  service: 'Which service they want', length: 'How long', size: 'What size', shade: 'Which shade', date: 'Which day',
  length_photo: 'A photo of their hair now', consultation: 'A consultation first', confirm_length: 'Length: the photo and message disagree',
  confirm_ends: 'Ends: the photo and message disagree', confirm_shade: 'Shade: the photo and message disagree',
}

const get = (o: any, path: string) => path.split('.').reduce((v, k) => v?.[k], o)
const words = (v: unknown) => (v === null || v === undefined || v === 'unknown' ? '' : String(v).replaceAll('_', ' '))
const shortId = (id: string) => id.slice(0, 4).toUpperCase()
const time = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

function toggleTheme() {
  const root = document.documentElement
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  root.dataset.theme = dark ? 'light' : 'dark'
  try {
    localStorage.setItem('brief-builder-theme', root.dataset.theme)
  } catch {
    // The choice lasts for this page only.
  }
}

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
        <span className="avatar big" aria-hidden="true">{STYLISTS[stylist].name.slice(0, 1)}</span>
        <h1>{STYLISTS[stylist].name}</h1>
        <p className="muted">{denied ? 'That key didn’t work. Check it and try again.' : 'Enter your stylist key to open your inbox.'}</p>
        <label htmlFor="key" className="sr-only">Stylist key</label>
        <input id="key" type="password" autoComplete="off" placeholder="Stylist key" value={draftKey} onChange={(e) => setDraftKey(e.target.value)} />
        <button className="btn primary" type="submit" disabled={!draftKey.trim()}>Open inbox</button>
        <style>{CSS}</style>
      </form>
    )
  }

  return (
    <div className="mail" data-open={selected ? 'thread' : 'list'}>
      <aside className="list" aria-label="Conversations">
        <header>
          <div>
            <h1>Messages</h1>
            <small className={connected ? 'live on' : 'live'}>{connected ? `${STYLISTS[stylist].name} · live` : 'Reconnecting…'}</small>
          </div>
          <button className="icon-btn" onClick={toggleTheme} aria-label="Switch day or night"><SunMoonIcon /></button>
        </header>
        {list.length === 0 && <p className="muted empty">New DMs show up here the moment they’re sent.</p>}
        {list.map((m) => (
          <button key={m.id} className={m.id === current?.id ? 'row on' : 'row'} onClick={() => setSelected(m.id)}>
            <span className="avatar" aria-hidden="true">{shortId(m.clientId).slice(0, 1)}</span>
            <span className="row-text">
              <span className="row-top"><b>Client {shortId(m.clientId)}</b><small>{time(m.createdAt)}</small></span>
              <span className="snippet">{m.text || 'Sent a photo'}</span>
              <small className={`state ${m.status}`}>{m.status === 'drafting' ? 'Drafting…' : m.status === 'replied' ? 'Replied' : m.corrected ? 'You corrected this' : m.status === 'failed' ? 'Reply by hand' : 'Draft ready'}</small>
            </span>
          </button>
        ))}
      </aside>
      {current ? <Detail key={current.id} m={current} stylist={stylist} token={token} onBack={() => setSelected(null)} /> : <div className="detail empty-pane"><p className="muted">No messages yet.</p></div>}
      <style>{CSS}</style>
    </div>
  )
}

function Photos({ ids, stylist, token }: { ids: string[]; stylist: StylistKey; token: string }) {
  const [urls, setUrls] = useState<string[]>([])
  useEffect(() => {
    let live = true
    const made: string[] = []
    Promise.all(ids.map((id) => imageUrlForStylist(stylist, id, token))).then((us) => {
      const ok = us.filter((u): u is string => !!u)
      made.push(...ok)
      if (live) setUrls(ok)
    })
    return () => {
      live = false
      made.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [ids.join(','), stylist, token])
  if (!ids.length) return null
  return <div className={`photos n${Math.min(ids.length, 4)}`}>{urls.map((u) => <img key={u} src={u} alt="Photo from the client" />)}</div>
}

function Detail({ m, stylist, token, onBack }: { m: RoomMessage; stylist: StylistKey; token: string; onBack: () => void }) {
  const brief = m.corrected ?? m.brief
  const [reply, setReply] = useState('')
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    setReply(m.reply ?? brief?.reply_draft ?? '')
  }, [m.id, m.status, brief?.reply_draft])
  const price = estimate(stylist, brief)
  const threshold = 0.6

  const correct = async (path: string, value: string, label: string) => {
    if (!brief) return
    const next = structuredClone(brief)
    const keys = path.split('.')
    const last = keys.pop()!
    const parent = keys.reduce((v: any, k) => v[k], next)
    parent[last] = value
    setError('')
    try {
      await post(stylist, 'correct', { id: m.id, corrected: next }, token)
      setSaved(`${label} fixed. Sent to Mubit.`)
      setTimeout(() => setSaved(''), 2600)
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

  const select = (f: Field) => {
    const value = get(brief, f.path) ?? 'unknown'
    const original = get(m.brief, f.path) ?? 'unknown'
    const fixed = !!m.corrected && String(value) !== String(original)
    return (
      <label key={f.path} className={fixed ? 'line fixed' : 'line'}>
        <span className="k">{f.label}</span>
        <span className="v">
          {fixed && <s>{words(original) || 'not set'}</s>}
          <select value={value} onChange={(e) => correct(f.path, e.target.value, f.label)} aria-label={`${f.label}: change to correct it`}>
            <option value="unknown">Not set, ask</option>
            {f.options.map((o) => <option key={o} value={o}>{words(o)}</option>)}
          </select>
          {m.guarded.includes(f.path) && <small className="faint">Cleared: no source in the DM</small>}
        </span>
      </label>
    )
  }

  return (
    <div className="detail slide-in">
      <section className="thread">
        <header className="thread-bar">
          <button className="icon-btn back" onClick={onBack} aria-label="All messages"><BackIcon /></button>
          <span className="avatar" aria-hidden="true">{shortId(m.clientId).slice(0, 1)}</span>
          <div><b>Client {shortId(m.clientId)}</b><small className="muted">{time(m.createdAt)}</small></div>
        </header>
        <div className="convo">
          <Photos ids={m.images} stylist={stylist} token={token} />
          {m.text && <p className="bubble in">{highlight(m.text, Object.values(brief?.evidence ?? {}) as string[])}</p>}
          {m.status === 'drafting' && <p className="muted typing"><span className="dots"><i /><i /><i /></span> Drafting the brief</p>}
          {m.reply && <p className="bubble out rise">{m.reply}</p>}
        </div>
        {!m.reply && brief && (
          <form className="reply" onSubmit={(e) => { e.preventDefault(); void send() }}>
            <label htmlFor="reply" className="eyebrow">Draft reply</label>
            <div className="reply-box">
              <textarea id="reply" rows={4} value={reply} onChange={(e) => setReply(e.target.value)} />
              <button type="submit" className="send on" disabled={!reply.trim()} aria-label="Send reply"><SendIcon /></button>
            </div>
          </form>
        )}
        {m.status === 'failed' && !m.reply && <p className="muted pad">No draft this time. Reply by hand.</p>}
        {error && <p className="error pad" role="alert">{error}</p>}
      </section>

      <section className="sheet-pane" aria-label="Service sheet">
        {!brief ? (
          <p className="muted">The service sheet appears once the brief is drafted.</p>
        ) : (
          <>
            <div className="sheet-head">
              <p className="eyebrow">Service sheet</p>
              <label className="service">
                <select value={brief.service} onChange={(e) => correct('service', e.target.value, 'Service')} aria-label="Service: change to correct it">
                  <option value="unknown">Service not set</option>
                  {SERVICES[stylist].map((o) => <option key={o} value={o}>{words(o)}</option>)}
                </select>
              </label>
              {price && <p className="price"><b>{price.from ? 'from ' : ''}£{price.amount}</b>{price.note && <span className="muted"> · {price.note}</span>}</p>}
              {saved && <p className="saved settle">{saved}</p>}
            </div>

            {SHEET[stylist].map((s) => (
              <div key={s.title} className="block">
                <h3 className="eyebrow">{s.title}</h3>
                {s.fields.map(select)}
              </div>
            ))}

            <div className="block">
              <h3 className="eyebrow">Booking</h3>
              <div className="line"><span className="k">When</span><span className="v">{[...(brief.when?.dates ?? []).map((d: string) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })), brief.when?.window].filter(Boolean).join(', ') || <span className="faint">Not said</span>}</span></div>
              <div className="line"><span className="k">Where</span><span className="v">{brief.area || <span className="faint">Not said</span>}</span></div>
              <div className="line"><span className="k">People</span><span className="v">{brief.people ?? 1}</span></div>
              <div className="line"><span className="k">Budget</span><span className="v">{brief.budget_max_gbp ? `Up to £${brief.budget_max_gbp}` : <span className="faint">Not said</span>}</span></div>
            </div>

            {m.photoTags && (
              <div className="block">
                <h3 className="eyebrow">What the photo shows</h3>
                {m.photoTags.map((t) => (
                  <div key={t.field + t.tag} className={t.confidence >= threshold ? 'line' : 'line unsure'}>
                    <span className="k">{words(t.field)}</span>
                    <span className="v">{words(t.tag)} <small className="faint">{Math.round(t.confidence * 100)}%{t.confidence < threshold ? ', not used' : ''}</small></span>
                  </div>
                ))}
              </div>
            )}

            <div className="block">
              <h3 className="eyebrow">Still to ask</h3>
              {(brief.missing ?? []).length ? <ul className="ask">{brief.missing.map((k: string) => <li key={k}>{ASK[k] ?? words(k)}</li>)}</ul> : <p className="muted">Nothing. Ready to quote or book.</p>}
              <label className="line">
                <span className="k">Next step</span>
                <span className="v">
                  <select value={brief.next_action} onChange={(e) => correct('next_action', e.target.value, 'Next step')} aria-label="Next step: change to correct it">
                    {NEXT.map((o) => <option key={o} value={o}>{words(o)}</option>)}
                  </select>
                </span>
              </label>
            </div>

            <p className="drafted faint">Drafted by gpt-6-luna through Mubit{m.ms ? ` in ${(m.ms / 1000).toFixed(1)} s` : ''}, using {m.correctionsUsed} of your past fixes.{m.requestId && <> <span className="mono">{m.requestId}</span></>}</p>
          </>
        )}
      </section>
    </div>
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

const CSS = `
.gate { max-width: 360px; margin: 14vh auto; display: grid; gap: 12px; padding: 0 16px; justify-items: center; text-align: center; }
.gate input, .gate .btn { width: 100%; }
.gate input { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; background: var(--surface); }
.avatar { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), oklch(62% 0.15 20)); color: var(--on-accent); display: grid; place-items: center; font-weight: 700; flex: none; }
.avatar.big { width: 72px; height: 72px; font-size: 28px; }
.mail { height: 100dvh; display: grid; grid-template-columns: 320px minmax(0, 1fr); background: var(--bg); }
.detail { display: grid; grid-template-columns: minmax(0, 1fr) 380px; height: 100dvh; min-width: 0; }
.list { border-right: 1px solid var(--line); overflow-y: auto; padding: calc(env(safe-area-inset-top) + 14px) 10px 14px max(10px, env(safe-area-inset-left)); display: flex; flex-direction: column; gap: 2px; }
.list header { display: flex; justify-content: space-between; align-items: center; padding: 0 8px 12px; }
.list h1 { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
.live { color: var(--faint); font-size: 13px; }
.live.on { color: var(--good); }
.empty { padding: 8px; }
.row { display: flex; gap: 10px; text-align: left; border: 0; background: none; border-radius: 14px; padding: 10px; align-items: flex-start; transition: background 120ms var(--ease); }
.row:hover { background: var(--sunken); }
.row.on { background: var(--accent-soft); }
.row-text { display: grid; gap: 1px; min-width: 0; flex: 1; }
.row-top { display: flex; justify-content: space-between; gap: 8px; }
.row-top small { color: var(--faint); font-size: 12px; }
.snippet { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.state { font-size: 12px; color: var(--faint); }
.state.drafted { color: var(--accent); }
.thread { display: grid; grid-template-rows: auto minmax(0, 1fr) auto auto; min-width: 0; border-right: 1px solid var(--line); }
.empty-pane { place-items: center; }
.thread-bar { display: flex; align-items: center; gap: 10px; padding: calc(env(safe-area-inset-top) + 10px) 16px 10px; border-bottom: 1px solid var(--line); background: var(--glass); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
.thread-bar div { display: grid; line-height: 1.2; }
.thread-bar small { font-size: 12px; }
.back { display: none; }
.convo { overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 8px; }
.bubble { padding: 10px 15px; border-radius: 20px; max-width: min(80%, 520px); white-space: pre-wrap; line-height: 1.42; font-size: 17px; overflow-wrap: anywhere; }
.bubble.in { background: var(--sunken); border-bottom-left-radius: 6px; align-self: flex-start; }
.bubble.out { background: var(--accent); color: var(--on-accent); border-bottom-right-radius: 6px; align-self: flex-end; }
.bubble.in mark { background: var(--mark); }
.photos { display: grid; gap: 3px; width: min(70%, 360px); border-radius: 18px; overflow: hidden; }
.photos.n2, .photos.n3, .photos.n4 { grid-template-columns: 1fr 1fr; }
.photos img { width: 100%; aspect-ratio: 1; object-fit: cover; background: var(--sunken); }
.photos.n1 img { aspect-ratio: auto; max-height: 360px; }
.typing { display: flex; gap: 8px; align-items: center; font-size: 14px; }
.reply { padding: 12px 16px calc(env(safe-area-inset-bottom) + 14px); display: grid; gap: 6px; border-top: 1px solid var(--line); }
.reply-box { display: flex; gap: 8px; align-items: flex-end; border: 1.5px dashed var(--line); border-radius: 18px; padding: 8px 8px 8px 14px; background: var(--surface); }
.reply-box textarea { flex: 1; border: 0; background: transparent; resize: none; outline: none; font-size: 16px; line-height: 1.45; field-sizing: content; max-height: 200px; }
.send { width: 40px; height: 40px; border-radius: 50%; border: 0; display: grid; place-items: center; background: var(--accent); color: var(--on-accent); flex: none; }
.send svg { width: 20px; height: 20px; }
.pad { padding: 0 16px 12px; }
.error { color: var(--bad); }
.sheet-pane { overflow-y: auto; padding: calc(env(safe-area-inset-top) + 18px) max(18px, env(safe-area-inset-right)) 24px 18px; display: flex; flex-direction: column; gap: 18px; background: var(--surface); }
.sheet-head { display: grid; gap: 4px; padding-bottom: 4px; }
.service select { font: 700 26px/1.15 var(--sans); letter-spacing: -0.02em; border: 0; background: transparent; padding: 0; text-transform: capitalize; max-width: 100%; appearance: none; cursor: pointer; }
.price { font-size: 17px; }
.price b { font-variant-numeric: tabular-nums; }
.saved { color: var(--accent); font-weight: 600; font-size: 14px; }
.block { display: grid; }
.block .eyebrow { margin-bottom: 4px; }
.line { display: grid; grid-template-columns: 118px minmax(0, 1fr); gap: 10px; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--line); min-height: 44px; }
.line .k { color: var(--muted); font-size: 14px; text-transform: capitalize; }
.line .v { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; text-transform: capitalize; }
.line select { border: 1px solid transparent; background: transparent; border-radius: 10px; padding: 5px 6px; margin-left: -6px; font-weight: 600; text-transform: capitalize; max-width: 100%; }
.line select:hover, .line select:focus { border-color: var(--line); background: var(--bg); }
.line.fixed select { color: var(--good); }
.line s { color: var(--bad); }
.line.unsure { opacity: 0.6; }
.ask { margin: 0 0 6px; padding-left: 18px; display: grid; gap: 4px; }
.drafted { font-size: 12px; line-height: 1.5; margin-top: auto; overflow-wrap: anywhere; }
/* Smaller iPad: the thread and the sheet stack in one scrolling column beside the list. */
@media (max-width: 1180px) {
  .mail { grid-template-columns: 300px minmax(0, 1fr); }
  .detail { grid-template-columns: minmax(0, 1fr); overflow-y: auto; align-content: start; }
  .thread { border-right: 0; grid-template-rows: auto auto auto auto; }
  .convo { overflow: visible; }
  .sheet-pane { overflow: visible; border-top: 1px solid var(--line); padding-top: 18px; }
}
/* Phone: the list, then the thread slides in over it. */
@media (max-width: 760px) {
  .mail { grid-template-columns: minmax(0, 1fr); }
  .list { border-right: 0; }
  .mail[data-open="list"] > .detail { display: none; }
  .mail[data-open="thread"] > .list { display: none; }
  .back { display: grid; }
}
`
