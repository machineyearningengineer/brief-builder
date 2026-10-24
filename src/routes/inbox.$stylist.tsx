// The stylist's inbox, laid out like an iPad mail app: conversations, the DM thread with the
// reply, and the brief as a salon service sheet where every field is a one-tap correction.
// Three columns on a wide iPad, two on a smaller one, and a slide-in thread on a phone.
import { createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import braiderTags from '../../data/braider/tags.json'
import colouristTags from '../../data/colourist/tags.json'
import nailsTags from '../../data/nails/tags.json'
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
  nails: [
    { title: 'Look', fields: [
      { path: 'look.length', label: 'Length', options: nailsTags.fields.length },
      { path: 'look.shape', label: 'Shape', options: nailsTags.fields.shape },
      { path: 'look.finish', label: 'Finish', options: nailsTags.fields.finish },
    ] },
    { title: 'Nails now', fields: [
      { path: 'removal', label: 'On now', options: nailsTags.fields.removal },
    ] },
  ],
}
// The look's list field (braids extras, nail art), shown as chips with "Add…".
const EXTRAS: Record<StylistKey, { key: string; label: string; options: string[] } | null> = {
  braider: { key: 'extras', label: 'Extras', options: braiderTags.fields.extras },
  colourist: null,
  nails: { key: 'art', label: 'Art', options: nailsTags.fields.art },
}
const SERVICES: Record<StylistKey, string[]> = { braider: braiderTags.fields.service, colourist: colouristTags.fields.service, nails: nailsTags.fields.service }
const NEXT = ['ask', 'quote', 'offer_slots', 'decline', 'refer']
const ASK: Record<string, string> = {
  service: 'Which service they want', length: 'How long', size: 'What size', shade: 'Which shade', date: 'Which day',
  length_photo: 'A photo of their hair now', consultation: 'A consultation first', confirm_length: 'Length: the photo and message disagree',
  confirm_ends: 'Ends: the photo and message disagree', confirm_shade: 'Shade: the photo and message disagree',
}

const get = (o: any, path: string) => path.split('.').reduce((v, k) => v?.[k], o)
// Values read the way a stylist says them, in sentence case.
const SPOKEN: Record<string, string> = {
  butt: "bum length", mid_back: "mid-back", bra_strap: "bra strap", shoulder: "shoulder length", waist: "waist length",
  boho_throughout: "boho, curls throughout", curly_ends: "curly ends", two_tone: "two-tone", "1b": "1B", offer_slots: "offer slots",
  box_braids: "box braids", french_curls: "French curls", locs_retwist: "loc retwist", loc_install: "starter locs", silk_press: "silk press",
  sew_in: "sew-in", wig_install: "wig install", lived_in_blonde: "lived-in blonde", virgin_dark: "never dyed, dark", virgin_light: "never dyed, light",
  box_dye: "box dye", previously_lightened: "lightened before", root_touch_up: "root touch-up", full_colour: "full colour", colour_correction: "colour correction",
  biab: "BIAB", gel_manicure: "gel manicure", gel_pedicure: "gel pedicure", acrylic_full_set: "acrylic full set", acrylic_infill: "acrylic infill",
  gel_extensions: "gel extensions", classic_manicure: "classic manicure", soak_off_only: "soak-off only", xl: "extra long", french: "French tip",
  cat_eye: "cat eye", accent_nails: "accent nails", full_art: "art on every nail", none: "nothing on", own_work: "your own work", other_salon: "another salon's",
  heart_design: "heart design", triangle_parts: "triangle parts", fulani_pattern: "Fulani pattern", side_part: "side part", edges_laid: "edges laid",
}
const words = (v: unknown) => {
  if (v === null || v === undefined || v === "unknown") return ""
  const s = SPOKEN[String(v)] ?? String(v).replaceAll("_", " ")
  return s.charAt(0).toUpperCase() + s.slice(1)
}
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
  // One conversation per client, newest activity first.
  const [selected, setSelected] = useState<string | null>(null)
  const list = useMemo(() => {
    const byClient = new Map<string, RoomMessage[]>()
    for (const m of messages) byClient.set(m.clientId, [...(byClient.get(m.clientId) ?? []), m])
    return [...byClient.values()].sort((a, b) => b.at(-1)!.createdAt - a.at(-1)!.createdAt)
  }, [messages])
  const current = list.find((t) => t[0].clientId === selected) ?? list[0] ?? null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('textarea, input, select')) return
      const i = list.findIndex((t) => t[0].clientId === current?.[0].clientId)
      if (e.key === 'j' && i < list.length - 1) setSelected(list[i + 1][0].clientId)
      if (e.key === 'k' && i > 0) setSelected(list[i - 1][0].clientId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [list, current?.[0].clientId])

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
          <span className="tools">
            <ResetButton stylist={stylist} token={token} onDone={() => setSelected(null)} />
            <button className="icon-btn" onClick={toggleTheme} aria-label="Switch day or night"><SunMoonIcon /></button>
          </span>
        </header>
        {list.length === 0 && <p className="muted empty">New DMs show up here the moment they’re sent.</p>}
        {list.map((t) => {
          const m = t.at(-1)!
          return (
            <button key={m.clientId} className={m.clientId === current?.[0].clientId ? 'row on' : 'row'} onClick={() => setSelected(m.clientId)}>
              <span className="avatar" aria-hidden="true">{shortId(m.clientId).slice(0, 1)}</span>
              <span className="row-text">
                <span className="row-top"><b>Client {shortId(m.clientId)}</b><small>{time(m.createdAt)}</small></span>
                <span className="snippet">{m.text || 'Sent a photo'}</span>
                <small className={`state ${m.status}`}>{m.status === 'drafting' ? 'Drafting…' : m.status === 'replied' ? 'Replied' : m.corrected ? 'You corrected this' : m.status === 'failed' ? 'Reply by hand' : 'Draft ready'}{t.length > 1 ? ` · ${t.length} messages` : ''}</small>
              </span>
            </button>
          )
        })}
      </aside>
      {current ? <Detail key={current.at(-1)!.id} thread={current} stylist={stylist} token={token} onBack={() => setSelected(null)} /> : <div className="detail empty-pane"><p className="muted">No messages yet.</p></div>}
      <style>{CSS}</style>
    </div>
  )
}

// Clears every DM, photo and live correction in this stylist's room, for a fresh demo run.
// The first tap arms it; a second tap within three seconds clears.
function ResetButton({ stylist, token, onDone }: { stylist: StylistKey; token: string; onDone: () => void }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  const click = async () => {
    if (!armed) return setArmed(true)
    setArmed(false)
    await post(stylist, 'reset', {}, token).catch(() => {})
    onDone()
  }
  return <button className={armed ? 'btn reset armed' : 'btn reset'} onClick={click}>{armed ? 'Tap again to clear' : 'Clear'}</button>
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

// A fix waits five seconds so a mis-tap can be undone; any change made in that window joins
// the same fix. Short option lists are one-tap choices; long ones stay as dropdowns.
const UNDO_MS = 5000
const ONE_TAP_MAX = 5
type Pending = { next: Record<string, any>; labels: string[] }

const setPath = (o: any, path: string, value: unknown) => {
  const keys = path.split('.')
  const last = keys.pop()!
  keys.reduce((v: any, k) => v[k], o)[last] = value
}
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

// A client's whole conversation; the sheet and the reply belong to its newest message, whose
// brief is the running brief for the conversation.
function Detail({ thread, stylist, token, onBack }: { thread: RoomMessage[]; stylist: StylistKey; token: string; onBack: () => void }) {
  const m = thread.at(-1)!
  const saved = m.corrected ?? m.brief
  const [pending, setPending] = useState<Pending | null>(null)
  const [left, setLeft] = useState(0)
  const [note, setNote] = useState('')
  const [reply, setReply] = useState('')
  const [error, setError] = useState('')
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  const brief = pending?.next ?? saved
  const price = estimate(stylist, brief)
  const threshold = 0.6

  useEffect(() => {
    setReply(m.reply ?? saved?.reply_draft ?? '')
  }, [m.id, m.status, saved?.reply_draft])

  const commit = async (p: Pending) => {
    if (timer.current) clearInterval(timer.current)
    pendingRef.current = null
    setPending(null)
    setError('')
    try {
      await post(stylist, 'correct', { id: m.id, corrected: p.next }, token)
      setNote(`${p.labels.join(', ')} fixed. Sent to Mubit.`)
      setTimeout(() => setNote(''), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That correction didn’t save.')
    }
  }

  // Leaving the message mid-countdown still saves the fix.
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current)
    const p = pendingRef.current
    if (p) void post(stylist, 'correct', { id: m.id, corrected: p.next }, token).catch(() => {})
  }, [m.id])

  const change = (label: string, mutate: (b: Record<string, any>) => void) => {
    if (!saved) return
    const next = structuredClone(pendingRef.current?.next ?? saved)
    mutate(next)
    const p = { next, labels: [...new Set([...(pendingRef.current?.labels ?? []), label])] }
    pendingRef.current = p
    setPending(p)
    const deadline = Date.now() + UNDO_MS
    setLeft(Math.ceil(UNDO_MS / 1000))
    if (timer.current) clearInterval(timer.current)
    timer.current = setInterval(() => {
      const s = Math.ceil((deadline - Date.now()) / 1000)
      if (s <= 0) void commit(p)
      else setLeft(s)
    }, 200)
  }

  const undo = () => {
    if (timer.current) clearInterval(timer.current)
    pendingRef.current = null
    setPending(null)
  }

  const send = async () => {
    setError('')
    try {
      await post(stylist, 'reply', { id: m.id, text: reply }, token)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The reply didn’t send.')
    }
  }

  // Where a value came from: the stylist, the photo (with its confidence) or the client's words.
  const source = (path: string, fixed: boolean, original: unknown) => {
    if (fixed) return `Your fix · was ${words(original) || 'not set'}`
    const ev = m.brief?.evidence?.[path]
    if (ev === '[photo]') {
      const t = m.photoTags?.find((x) => x.field === path.split('.').pop())
      if (t?.via === 'fix') return 'Like a photo you fixed'
      return t ? `From photo · ${Math.round(t.confidence * 100)}%` : 'From photo'
    }
    return ev ? `“${clip(String(ev), 26)}”` : ''
  }

  const field = (f: Field) => {
    const value = get(brief, f.path) ?? 'unknown'
    const original = get(m.brief, f.path) ?? 'unknown'
    const fixed = String(value) !== String(original)
    const set = (v: string) => change(f.label, (b) => setPath(b, f.path, v))
    return (
      <div key={f.path} className={fixed ? 'line fixed' : 'line'}>
        <span className="k">{f.label}<small className="src">{source(f.path, fixed, original)}</small></span>
        <span className="v">
          {f.options.length <= ONE_TAP_MAX ? (
            <span className="seg" role="radiogroup" aria-label={f.label}>
              {f.options.map((o) => (
                <button key={o} type="button" role="radio" aria-checked={value === o} className={value === o ? 'on' : ''} onClick={() => set(value === o ? 'unknown' : o)}>{words(o)}</button>
              ))}
            </span>
          ) : (
            <select value={value} onChange={(e) => set(e.target.value)} aria-label={`${f.label}: change to correct it`}>
              <option value="unknown">Not set, ask</option>
              {f.options.map((o) => <option key={o} value={o}>{words(o)}</option>)}
            </select>
          )}
          {m.guarded.includes(f.path) && <small className="faint">Cleared: no source in the DM</small>}
        </span>
      </div>
    )
  }

  const extras = () => {
    const x = EXTRAS[stylist]
    if (!x) return null
    const on: string[] = brief?.look?.[x.key] ?? []
    const was: string[] = m.brief?.look?.[x.key] ?? []
    const removed = was.filter((v) => !on.includes(v))
    const rest = x.options.filter((v) => !on.includes(v))
    const fromPhoto = m.brief?.evidence?.[`look.${x.key}`] === '[photo]'
    return (
      <div className="line extras">
        <span className="k">{x.label}<small className="src">{removed.length || on.some((v) => !was.includes(v)) ? 'Your fix' : fromPhoto ? 'From photo' : ''}</small></span>
        <span className="v">
          {on.map((v) => (
            <button key={v} type="button" className={was.includes(v) ? 'chip' : 'chip added'} onClick={() => change(x.label, (b) => { b.look[x.key] = on.filter((y) => y !== v) })} aria-label={`Remove ${words(v)}`}>
              {words(v)} <span aria-hidden="true">×</span>
            </button>
          ))}
          {removed.map((v) => <s key={v} className="faint">{words(v)}</s>)}
          {rest.length > 0 && (
            <select value="" onChange={(e) => { const v = e.target.value; if (v) change(x.label, (b) => { b.look[x.key] = [...on, v] }) }} aria-label={`Add ${x.label.toLowerCase()}`}>
              <option value="">Add…</option>
              {rest.map((v) => <option key={v} value={v}>{words(v)}</option>)}
            </select>
          )}
        </span>
      </div>
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
          {thread.map((t) => (
            <div key={t.id} className="turn">
              <Photos ids={t.images} stylist={stylist} token={token} />
              {t.text && <p className="bubble in">{highlight(t.text, Object.values(brief?.evidence ?? {}) as string[])}</p>}
              {t.status === 'drafting' && <p className="muted typing"><span className="dots"><i /><i /><i /></span> Reading the message{t.images.length ? ' and photo' : ''}</p>}
              {t.reply && <p className="bubble out rise">{t.reply}</p>}
              {t.extra.map((x, i) => <p key={i} className="bubble out rise">{x}</p>)}
            </div>
          ))}
        </div>
        <PriceCorrection m={m} stylist={stylist} token={token} />
        {!m.reply && saved && (
          <form className="reply" onSubmit={(e) => { e.preventDefault(); void send() }}>
            <label htmlFor="reply" className="eyebrow">{m.redrafting ? 'Updating the reply from your fix' : 'Draft reply'}</label>
            <div className={m.redrafting ? 'reply-box busy' : 'reply-box'}>
              <textarea id="reply" rows={4} value={reply} onChange={(e) => setReply(e.target.value)} disabled={m.redrafting} />
              <button type="submit" className="send on" disabled={!reply.trim() || m.redrafting} aria-label="Send reply">
                {m.redrafting ? <span className="dots"><i /><i /><i /></span> : <SendIcon />}
              </button>
            </div>
          </form>
        )}
        {m.baseline && !m.reply && (
          <details className="plain pad">
            <summary className="faint">Without your fixes</summary>
            <p className="muted">{m.baseline.reply}</p>
          </details>
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
                <select value={brief.service} onChange={(e) => change('Service', (b) => { b.service = e.target.value })} aria-label="Service: change to correct it">
                  <option value="unknown">Service not set</option>
                  {SERVICES[stylist].map((o) => <option key={o} value={o}>{words(o)}</option>)}
                </select>
              </label>
              {price && <p className="price"><b>{price.from ? 'from ' : ''}£{price.amount}</b>{price.note && <span className="muted"> · {price.note}</span>}</p>}
            </div>

            {SHEET[stylist].map((s) => (
              <div key={s.title} className="block">
                <h3 className="eyebrow">{s.title}</h3>
                {s.fields.map(field)}
                {s.title === 'Look' && extras()}
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
              {field({ path: 'next_action', label: 'Next step', options: NEXT })}
            </div>

            <p className="drafted faint">Drafted by gpt-6-luna through Mubit{m.ms ? ` in ${(m.ms / 1000).toFixed(1)} s` : ''}, using {m.correctionsUsed} of your past fixes.{m.requestId && <> <span className="mono">{m.requestId}</span></>}</p>

            {(pending || note) && (
              <div className="toast settle" role="status">
                {pending ? (
                  <><span>{pending.labels.join(', ')} fixed</span><button type="button" onClick={undo}>Undo · {left}</button></>
                ) : (
                  <span>{note}</span>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

// Marks each evidence quote where it appears in the DM, so every value shows its source.
// After a reply has gone, a fix that changes the price offers the client a one-tap correction.
function PriceCorrection({ m, stylist, token }: { m: RoomMessage; stylist: StylistKey; token: string }) {
  const now = estimate(stylist, m.corrected ?? m.brief)?.amount
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const offered = !!m.reply && m.sentPrice != null && now != null && now !== m.sentPrice
  useEffect(() => {
    if (offered) setText(`Quick correction, sorry! It's £${now}, not £${m.sentPrice}.`)
  }, [offered, now, m.sentPrice])
  if (!offered) return null
  const send = async () => {
    setSending(true)
    try { await post(stylist, 'reply', { id: m.id, text, append: true }, token) } finally { setSending(false) }
  }
  return (
    <form className="correction rise" onSubmit={(e) => { e.preventDefault(); void send() }}>
      <p><b>You told them £{m.sentPrice}.</b> With your fix it’s £{now}.</p>
      <div className="reply-box">
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} aria-label="Correction to send" />
        <button type="submit" className="send on" disabled={!text.trim() || sending} aria-label="Send correction"><SendIcon /></button>
      </div>
    </form>
  )
}

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
.tools { display: flex; gap: 4px; align-items: center; }
.reset { padding: 6px 12px; font-size: 13px; color: var(--muted); }
.reset.armed { color: var(--bad); border-color: var(--bad); }
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
.turn { display: flex; flex-direction: column; gap: 8px; }
.typing { display: flex; gap: 8px; align-items: center; font-size: 14px; }
.reply { padding: 12px 16px calc(env(safe-area-inset-bottom) + 14px); display: grid; gap: 6px; border-top: 1px solid var(--line); }
.reply-box { display: flex; gap: 8px; align-items: flex-end; border: 1.5px dashed var(--line); border-radius: 18px; padding: 8px 8px 8px 14px; background: var(--surface); }
.reply-box textarea { flex: 1; border: 0; background: transparent; resize: none; outline: none; font-size: 16px; line-height: 1.45; field-sizing: content; max-height: 200px; }
.send { width: 40px; height: 40px; border-radius: 50%; border: 0; display: grid; place-items: center; background: var(--accent); color: var(--on-accent); flex: none; }
.send svg { width: 20px; height: 20px; }
.pad { padding: 0 16px 12px; }
.plain summary { cursor: pointer; font-size: 13px; }
.plain p { margin-top: 6px; font-size: 15px; line-height: 1.45; }
.error { color: var(--bad); }
.sheet-pane { overflow-y: auto; padding: calc(env(safe-area-inset-top) + 18px) max(18px, env(safe-area-inset-right)) 24px 18px; display: flex; flex-direction: column; gap: 18px; background: var(--surface); }
.sheet-head { display: grid; gap: 4px; padding-bottom: 4px; }
.service select { font: 700 26px/1.15 var(--sans); letter-spacing: -0.02em; border: 0; background: transparent; padding: 0; max-width: 100%; appearance: none; cursor: pointer; }
.price { font-size: 17px; }
.price b { font-variant-numeric: tabular-nums; }
.saved { color: var(--accent); font-weight: 600; font-size: 14px; }
.block { display: grid; }
.block .eyebrow { margin-bottom: 4px; }
.line { display: grid; grid-template-columns: 118px minmax(0, 1fr); gap: 10px; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--line); min-height: 44px; }
.line .k { color: var(--muted); font-size: 14px; }
.line .v { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; }
.line select { border: 1px solid transparent; background: transparent; border-radius: 10px; padding: 5px 6px; margin-left: -6px; font-weight: 600; max-width: 100%; }
.line select:hover, .line select:focus { border-color: var(--line); background: var(--bg); }
.line.fixed select { color: var(--good); }
.line s { color: var(--bad); }
.line.unsure { opacity: 0.6; }
.line .k { display: grid; gap: 2px; align-self: start; padding-top: 6px; }
.src { font-size: 11.5px; color: var(--faint); line-height: 1.3; }
.line.fixed .src { color: var(--good); font-weight: 600; }
.seg { display: flex; flex-wrap: wrap; gap: 4px; }
.seg button { border: 1px solid var(--line); background: var(--bg); border-radius: 9px; padding: 6px 10px; font-size: 13.5px; color: var(--muted); min-height: 34px; transition: background 140ms var(--ease), color 140ms var(--ease), border-color 140ms var(--ease); }
.seg button:hover { border-color: var(--faint); color: var(--ink); }
.seg button.on { background: var(--ink); border-color: var(--ink); color: var(--bg); font-weight: 600; }
.line.fixed .seg button.on { background: var(--good); border-color: var(--good); color: var(--bg); }
.correction { margin: 0 16px 12px; padding: 14px 16px; border-radius: var(--radius); background: var(--accent-soft); display: grid; gap: 10px; }
.correction p { margin: 0; }
.extras .v { gap: 6px; }
.chip { border: 1px solid var(--line); background: var(--bg); border-radius: 9px; padding: 5px 9px; font-size: 13.5px; font-weight: 600; min-height: 32px; }
.chip.added { border-color: var(--good); color: var(--good); }
.extras select { border: 1px dashed var(--line); border-radius: 9px; padding: 5px 8px; font-size: 13.5px; color: var(--muted); background: transparent; }
.reply-box.busy { opacity: 0.6; }
.toast { position: sticky; bottom: 12px; display: flex; justify-content: space-between; align-items: center; gap: 12px; background: var(--ink); color: var(--bg); border-radius: 14px; padding: 10px 12px 10px 16px; font-size: 14px; font-weight: 600; box-shadow: var(--shadow); }
.toast button { border: 0; background: var(--bg); color: var(--ink); border-radius: 10px; padding: 7px 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
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
