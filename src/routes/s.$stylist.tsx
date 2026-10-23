// The client's side: the stylist's page and a DM thread, phone first.
import { createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import braiderProfile from '../../data/braider/profile.json'
import colouristProfile from '../../data/colourist/profile.json'
import { clientId, post, useRoom } from '../client/room.ts'
import { STYLISTS, isStylist, type RoomMessage, type StylistKey } from '../shared/stylists.ts'

export const Route = createFileRoute('/s/$stylist')({
  beforeLoad: ({ params }) => {
    if (!isStylist(params.stylist)) throw notFound()
  },
  head: ({ params }) => ({ meta: [{ title: `${STYLISTS[params.stylist as StylistKey]?.name ?? 'Stylist'} · Brief Builder` }] }),
  component: ChatPage,
})

const PRICE_LINES: Record<StylistKey, string[]> = {
  braider: [
    `Knotless from £${braiderProfile.prices.base.knotless - 30}`,
    `Box braids from £${braiderProfile.prices.base.box_braids - 30}`,
    `Silk press £${braiderProfile.prices.fixed.silk_press}`,
    `Retwist £${braiderProfile.prices.fixed.locs_retwist}`,
  ],
  colourist: [
    `Balayage from £${colouristProfile.prices.base.balayage}`,
    `Highlights from £${colouristProfile.prices.base.highlights}`,
    `Roots £${colouristProfile.prices.fixed.root_touch_up}`,
    `Toner £${colouristProfile.prices.fixed.toner}`,
  ],
}

function ChatPage() {
  const { stylist } = Route.useParams() as { stylist: StylistKey }
  const info = STYLISTS[stylist]
  const [me, setMe] = useState('')
  const { messages, add } = useRoom(stylist, me ? { client: me } : null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => setMe(clientId()), [])
  const mine = useMemo(() => messages.filter((m) => m.clientId === me), [messages, me])
  useEffect(() => end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }), [mine.length, mine.at(-1)?.reply])

  const send = async (e: { preventDefault: () => void }) => {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setText('')
    setError('')
    try {
      const { message } = await post<{ message: RoomMessage }>(stylist, 'dm', { clientId: me, text: body })
      add(message)
    } catch (err) {
      setText(body)
      setError(err instanceof Error ? err.message : 'Your message didn’t send. Try again.')
    }
  }

  return (
    <div className="chat">
      <header className="chat-head">
        <div className="avatar" aria-hidden="true">{info.name.slice(0, 1)}</div>
        <div>
          <h1>{info.name}</h1>
          <p className="muted">{info.craft} · {info.area}</p>
        </div>
      </header>
      <section className="prices" aria-label="Prices">
        {PRICE_LINES[stylist].map((p) => <span key={p}>{p}</span>)}
      </section>
      <main className="thread" aria-live="polite">
        {mine.length === 0 && <p className="hint">Ask about a style, a date or a price. A screenshot of the look helps.</p>}
        {mine.map((m) => (
          <div key={m.id} className="pair">
            <p className="bubble me rise">{m.text}</p>
            {m.reply ? <p className="bubble them rise">{m.reply}</p> : <p className="bubble them typing"><span className="dots"><i /><i /><i /></span></p>}
          </div>
        ))}
        <div ref={end} />
      </main>
      <form className="composer" onSubmit={send}>
        <label htmlFor="dm" className="sr-only">Message</label>
        <textarea id="dm" rows={1} value={text} maxLength={1000} placeholder="Message…" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(e) } }} />
        <button className="btn primary" type="submit" disabled={!text.trim()}>Send</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="notice">Demo at Night Shift. Messages are deleted after the demo.</p>
      <style>{CHAT_CSS}</style>
    </div>
  )
}

const CHAT_CSS = `
.chat { max-width: 560px; margin: 0 auto; min-height: 100dvh; display: flex; flex-direction: column;
  padding: max(12px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 0 max(16px, env(safe-area-inset-left)); }
.chat-head { display: flex; gap: 12px; align-items: center; padding: 8px 0 12px; }
.chat-head h1 { font-size: 22px; }
.chat-head p { margin: 2px 0 0; font-size: 14px; }
.avatar { width: 48px; height: 48px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; font: 750 22px var(--display); flex: none; }
.prices { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 10px 14px; border: 1.5px dashed var(--line); border-radius: var(--radius); font-size: 14px; color: var(--muted); }
.thread { flex: 1; display: flex; flex-direction: column; gap: 8px; padding: 16px 0; }
.pair { display: flex; flex-direction: column; gap: 8px; }
.hint { color: var(--muted); text-align: center; margin: 32px 0; }
.bubble { margin: 0; padding: 9px 14px; border-radius: 18px; max-width: 82%; white-space: pre-wrap; line-height: 1.4; }
.bubble.me { align-self: flex-end; background: var(--accent); color: var(--on-accent); border-bottom-right-radius: 6px; }
.bubble.them { align-self: flex-start; background: var(--surface); border: 1px solid var(--line); border-bottom-left-radius: 6px; }
.bubble.typing { padding: 12px 16px; }
.composer { position: sticky; bottom: 0; display: flex; gap: 8px; align-items: flex-end; padding: 10px 0 max(10px, env(safe-area-inset-bottom)); background: var(--paper); }
.composer textarea { flex: 1; resize: none; border: 1px solid var(--line); border-radius: 20px; padding: 10px 14px; background: var(--surface); min-height: 44px; max-height: 140px; }
.composer .btn { min-height: 44px; }
.error { color: var(--bad); margin: 0 0 8px; font-size: 14px; }
.notice { font-size: 12px; color: var(--muted); text-align: center; margin: 0 0 max(8px, env(safe-area-inset-bottom)); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
`
