// The demo runner's phone page: every screen, every room and every file in one place, behind
// the stylist key. Clearing a room here is the same as Clear in that stylist's inbox.
import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { BackIcon, ChatIcon, InboxIcon } from '../client/icons.tsx'
import { post, stylistToken, useRoom } from '../client/room.ts'
import { STYLISTS, type StylistKey } from '../shared/stylists.ts'

export const Route = createFileRoute('/control')({
  head: () => ({ meta: [{ title: 'Control · Brief Builder' }, { name: 'robots', content: 'noindex' }] }),
  component: Control,
})

const RELEASE = 'https://github.com/machineyearningengineer/brief-builder/releases/download/v1.0'
const FILES = [
  { label: 'The film', note: 'Submission cut, under 2 minutes', href: `${RELEASE}/brief-builder-launch.mp4` },
  { label: 'Story cut', note: 'Upright, under a minute, for social', href: `${RELEASE}/brief-builder-story.mp4` },
  { label: 'Live footage', note: 'The real stage, 25 seconds', href: `${RELEASE}/brief-builder-live-footage.mp4` },
  { label: 'Deck', note: 'PDF, 10 slides', href: `${RELEASE}/brief-builder-deck.pdf` },
  { label: 'Code', note: 'GitHub repository', href: 'https://github.com/machineyearningengineer/brief-builder' },
]
const KEYS = Object.keys(STYLISTS) as StylistKey[]

export function useStylistKey() {
  const [token, setToken] = useState('')
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setToken(stylistToken.get())
    setReady(true)
  }, [])
  const save = (t: string) => {
    stylistToken.set(t)
    setToken(t)
  }
  return { token, ready, save }
}

export function KeyGate({ denied, onKey, title, what }: { denied: boolean; onKey: (k: string) => void; title: string; what: string }) {
  const [draft, setDraft] = useState('')
  return (
    <form className="ctl-gate" onSubmit={(e) => { e.preventDefault(); onKey(draft.trim()) }}>
      <h1>{title}</h1>
      <p className="muted">{denied ? 'That key didn’t work. Check it and try again.' : what}</p>
      <label htmlFor="key" className="sr-only">Stylist key</label>
      <input id="key" type="password" autoComplete="current-password" placeholder="Stylist key" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button className="btn primary" type="submit" disabled={!draft.trim()}>Open</button>
      <Link to="/" className="muted small">Back to Brief Builder</Link>
      <style>{CSS}</style>
    </form>
  )
}

function Control() {
  const { token, ready, save } = useStylistKey()
  const [denied, setDenied] = useState(false)
  useEffect(() => {
    if (!token) return
    fetch('/api/room/braider/state', { headers: { 'x-stylist-token': token } }).then((r) => setDenied(r.status === 401)).catch(() => {})
  }, [token])

  if (!ready) return null
  if (!token || denied) return <KeyGate denied={denied} onKey={(k) => { setDenied(false); save(k) }} title="Control" what="Enter the stylist key to run the demo from here." />

  return (
    <main className="ctl">
      <header className="ctl-head">
        <Link to="/" className="icon-btn" aria-label="Brief Builder home"><BackIcon /></Link>
        <h1>Control</h1>
      </header>

      <section aria-label="Run the demo" className="ctl-big">
        <Link to="/control/map" className="tile primary"><b>Demo map</b><span>Timeline, stories, what to say</span></Link>
        <Link to="/stage" className="tile"><b>Stage</b><span>The projector screen</span></Link>
      </section>

      <section aria-labelledby="rooms">
        <div className="ctl-row-head">
          <h2 id="rooms">Rooms</h2>
          <ClearAll token={token} />
        </div>
        <ul className="ctl-list">{KEYS.map((s) => <Room key={s} stylist={s} token={token} />)}</ul>
      </section>

      <section aria-labelledby="files">
        <h2 id="files">Files</h2>
        <ul className="ctl-list">
          {FILES.map((f) => (
            <li key={f.label}><a href={f.href} target="_blank" rel="noreferrer" className="ctl-link"><b>{f.label}</b><span className="muted">{f.note}</span><span aria-hidden="true">↗</span></a></li>
          ))}
        </ul>
      </section>

      <button className="ctl-forget" onClick={() => save('')}>Forget the key on this device</button>
      <style>{CSS}</style>
    </main>
  )
}

// Live counts for one stylist, and the ways into her room.
function Room({ stylist, token }: { stylist: StylistKey; token: string }) {
  const { messages, connected } = useRoom(stylist, { token })
  const threads = new Set(messages.map((m) => m.clientId)).size
  const s = STYLISTS[stylist]
  return (
    <li className="ctl-room">
      <span className="avatar" aria-hidden="true">{s.owner.slice(0, 1)}</span>
      <div className="who">
        <b>{s.owner}</b>
        <span className="muted">{!connected ? 'Connecting…' : threads === 0 ? 'Empty' : `${threads} ${threads === 1 ? 'client' : 'clients'}`}</span>
      </div>
      <Link to="/inbox/$stylist" params={{ stylist }} className="icon-btn" aria-label={`${s.owner}’s inbox`}><InboxIcon /></Link>
      <Link to="/s/$stylist" params={{ stylist }} className="icon-btn" aria-label={`Message ${s.owner} as a client`}><ChatIcon /></Link>
      <TwoTap label="Clear" armedLabel="Tap again" onConfirm={() => post(stylist, 'reset', {}, token)} />
    </li>
  )
}

function ClearAll({ token }: { token: string }) {
  return <TwoTap label="Clear all" armedLabel="Tap again to clear all" onConfirm={() => Promise.all(KEYS.map((s) => post(s, 'reset', {}, token)))} />
}

// The first tap arms it; a second tap within three seconds does it.
function TwoTap({ label, armedLabel, onConfirm }: { label: string; armedLabel: string; onConfirm: () => Promise<unknown> }) {
  const [state, setState] = useState<'idle' | 'armed' | 'busy' | 'done' | 'failed'>('idle')
  useEffect(() => {
    if (state !== 'armed' && state !== 'done' && state !== 'failed') return
    const t = setTimeout(() => setState('idle'), state === 'armed' ? 3000 : 1800)
    return () => clearTimeout(t)
  }, [state])
  const click = () => {
    if (state === 'idle') return setState('armed')
    if (state !== 'armed') return
    setState('busy')
    onConfirm().then(() => setState('done'), () => setState('failed'))
  }
  const text = { idle: label, armed: armedLabel, busy: 'Clearing…', done: 'Cleared', failed: 'Didn’t clear, try again' }[state]
  return <button className={`btn ctl-clear ${state}`} onClick={click} disabled={state === 'busy'}>{text}</button>
}

const CSS = `
.ctl { max-width: 560px; margin: 0 auto; padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 40px max(16px, env(safe-area-inset-left)); display: grid; gap: 28px; }
.ctl-head { display: flex; align-items: center; gap: 8px; }
.ctl h1 { font-family: var(--display); font-size: 30px; letter-spacing: -0.02em; }
.ctl h2 { font-size: 15px; font-weight: 650; color: var(--muted); margin: 0 0 8px; }
.ctl-big { display: grid; grid-template-columns: 1.4fr 1fr; gap: 10px; }
.tile { display: grid; gap: 4px; align-content: end; min-height: 120px; padding: 16px; border-radius: 20px; text-decoration: none; color: var(--ink); background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow); }
.tile b { font-size: 19px; }
.tile span { font-size: 14px; color: var(--muted); }
.tile.primary { background: var(--accent); border-color: transparent; color: var(--on-accent); }
.tile.primary span { color: color-mix(in oklch, var(--on-accent) 80%, transparent); }
.ctl-row-head { display: flex; align-items: baseline; justify-content: space-between; }
.ctl-list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); overflow: hidden; }
.ctl-list > li + li { border-top: 1px dashed var(--line); }
.ctl-room { display: flex; align-items: center; gap: 4px; padding: 10px 10px 10px 14px; }
.ctl-room .avatar { width: 38px; height: 38px; flex: none; border-radius: 38px; display: grid; place-items: center; font-weight: 700; color: var(--on-accent); background: linear-gradient(135deg, var(--accent), oklch(66% 0.12 20)); margin-right: 8px; }
.ctl-room .who { flex: 1; min-width: 0; display: grid; }
.ctl-room .who span { font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ctl .icon-btn { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 44px; color: var(--ink); }
.ctl .icon-btn svg { width: 20px; height: 20px; }
.ctl-clear { font-size: 13px; padding: 6px 12px; color: var(--muted); white-space: nowrap; }
.ctl-clear.armed, .ctl-clear.failed { color: var(--bad); border-color: var(--bad); }
.ctl-clear.done { color: var(--good, var(--accent)); }
.ctl-link { display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto; column-gap: 12px; padding: 12px 16px; text-decoration: none; color: var(--ink); }
.ctl-link span[aria-hidden] { grid-row: span 2; grid-column: 2; grid-row-start: 1; align-self: center; color: var(--muted); }
.ctl-link .muted { font-size: 13.5px; }
.ctl-forget { justify-self: start; background: none; border: 0; padding: 0; color: var(--muted); font-size: 13.5px; text-decoration: underline; }
.ctl-gate { max-width: 360px; margin: 14vh auto; display: grid; gap: 12px; padding: 0 16px; justify-items: center; text-align: center; }
.ctl-gate h1 { font-family: var(--display); font-size: 30px; }
.ctl-gate input, .ctl-gate .btn { width: 100%; }
.ctl-gate input { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; background: var(--surface); font-size: 16px; }
.ctl-gate .small { font-size: 13.5px; }
`
