// The client's side: a DM thread with the stylist, built to feel like a messaging app on a
// phone or iPad. Photos can be attached, pasted or dropped anywhere on the screen.
import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackIcon, CloseIcon, InfoIcon, PhotoIcon, SendIcon } from '../client/icons.tsx'
import { isImage, shrinkImage, type Pending } from '../client/images.ts'
import { clientId, postRetrying, uploadImage, useRoom } from '../client/room.ts'
import { MENU, POLICIES, WORK } from '../shared/menu.ts'
import { STYLISTS, isStylist, type RoomMessage, type StylistKey } from '../shared/stylists.ts'

export const Route = createFileRoute('/s/$stylist')({
  beforeLoad: ({ params }) => {
    if (!isStylist(params.stylist)) throw notFound()
  },
  head: ({ params }) => ({ meta: [{ title: STYLISTS[params.stylist as StylistKey]?.name ?? 'Messages' }] }),
  component: ChatPage,
})

const MAX_PHOTOS = 4
const time = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

function ChatPage() {
  const { stylist } = Route.useParams() as { stylist: StylistKey }
  const info = STYLISTS[stylist]
  const [me, setMe] = useState('')
  const { messages, add } = useRoom(stylist, me ? { client: me } : null)
  const [text, setText] = useState('')
  const [pending, setPending] = useState<Pending[]>([])
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [closing, setClosing] = useState(false)
  // The drawer slides back down before it goes, the way it came up.
  const closeSheet = useCallback((then?: () => void) => {
    setClosing(true)
    window.setTimeout(() => { setSheet(false); setClosing(false); then?.() }, 220)
  }, [])
  useEffect(() => {
    if (!sheet) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSheet() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, closeSheet])
  const [dragging, setDragging] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setMe(clientId())
  }, [])
  const mine = useMemo(() => messages.filter((m) => m.clientId === me), [messages, me])
  // Braces matter: scrollIntoView returns a Promise in newer browsers, and an effect must not.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [mine.length, mine.at(-1)?.reply, pending.length])

  const addFiles = useCallback(async (files: File[]) => {
    const images = files.filter(isImage)
    if (!images.length) return
    setError('')
    const room = MAX_PHOTOS - pending.length
    if (images.length > room) setError(`You can send ${MAX_PHOTOS} photos at a time.`)
    for (const f of images.slice(0, Math.max(0, room))) {
      try {
        const small = await shrinkImage(f)
        setPending((p) => [...p, { key: crypto.randomUUID(), file: small, preview: URL.createObjectURL(small), state: 'ready' }])
      } catch {
        setError('That photo couldn’t be read. Try a JPEG or PNG.')
      }
    }
  }, [pending.length])

  // Paste a screenshot anywhere, or drop photos anywhere on the screen.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])]
      if (files.some(isImage)) {
        e.preventDefault()
        void addFiles(files)
      }
    }
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault()
        setDragging(true)
      }
    }
    const onDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      void addFiles([...(e.dataTransfer?.files ?? [])])
    }
    window.addEventListener('paste', onPaste)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [addFiles])

  const send = async () => {
    const body = text.trim()
    if ((!body && !pending.length) || sending) return
    setSending(true)
    setError('')
    try {
      const ids: string[] = []
      for (const p of pending) {
        setPending((all) => all.map((x) => (x.key === p.key ? { ...x, state: 'uploading' } : x)))
        ids.push(await uploadImage(stylist, me, p.file))
      }
      // One key per DM: if the network drops and the send is retried, it still arrives once.
      const { message } = await postRetrying<{ message: RoomMessage }>(stylist, 'dm', { clientId: me, text: body, imageIds: ids, key: crypto.randomUUID() })
      add(message)
      pending.forEach((p) => URL.revokeObjectURL(p.preview))
      setPending([])
      setText('')
      box.current?.focus()
    } catch (err) {
      setPending((all) => all.map((x) => ({ ...x, state: 'ready' })))
      setError(err instanceof Error ? err.message : 'Your message didn’t send. Try again.')
    } finally {
      setSending(false)
    }
  }

  const canSend = (text.trim() || pending.length) && !sending
  const last = mine.at(-1)

  return (
    <div className="dm-app">
      <header className="dm-bar">
        <Link to="/" className="icon-btn" aria-label="All stylists"><BackIcon /></Link>
        <button className="who" onClick={() => setSheet(true)} aria-label={`About ${info.name}`}>
          <span className="avatar" aria-hidden="true">{info.name.slice(0, 1)}</span>
          <span className="names">
            <b>{info.name}</b>
            <small>{info.area}</small>
          </span>
        </button>
        <button className="icon-btn" onClick={() => setSheet(true)} aria-label="Services and prices"><InfoIcon /></button>
      </header>

      <main className="dm-thread" aria-live="polite">
        <div className="intro">
          <span className="avatar big" aria-hidden="true">{info.name.slice(0, 1)}</span>
          <h1>{info.name}</h1>
          <p className="muted">{info.craft}</p>
          <div className="work">{WORK[stylist].map((w) => <img key={w.src} src={w.src} alt={w.alt} loading="lazy" />)}</div>
          <button className="btn" onClick={() => setSheet(true)}>Services and prices</button>
        </div>
        {mine.length > 0 && <p className="day">Today</p>}
        {mine.map((m) => (
          <div key={m.id} className="turn">
            {m.images.length > 0 && (
              <div className={`photos n${Math.min(m.images.length, 4)} out rise`}>
                {m.images.map((id) => <img key={id} src={`/api/room/${stylist}/image/${id}?client=${me}`} alt="Photo you sent" loading="lazy" />)}
              </div>
            )}
            {m.text && <p className="bubble out rise">{m.text}</p>}
            {m.reply && (
              <div className="from-them rise">
                <span className="avatar small" aria-hidden="true">{info.name.slice(0, 1)}</span>
                <p className="bubble in">{m.reply}</p>
              </div>
            )}
            {m.extra?.map((x, i) => (
              <div key={i} className="from-them rise">
                <span className="avatar small" aria-hidden="true">{info.name.slice(0, 1)}</span>
                <p className="bubble in">{x}</p>
              </div>
            ))}
          </div>
        ))}
        {/* She reads every reply before it goes, so say when to expect one. */}
        {last && !last.reply && <p className="receipt">Delivered · {time(last.createdAt)}<br />{info.owner} usually replies within the hour</p>}
        <div ref={end} />
      </main>

      <footer className="dm-compose">
        {error && <p className="error" role="alert">{error}</p>}
        {pending.length > 0 && (
          <div className="tray">
            {pending.map((p) => (
              <figure key={p.key} className={`thumb settle ${p.state}`}>
                <img src={p.preview} alt="Photo to send" />
                {p.state !== 'uploading' && (
                  <button className="remove" aria-label="Remove photo" onClick={() => {
                    URL.revokeObjectURL(p.preview)
                    setPending((all) => all.filter((x) => x.key !== p.key))
                  }}><CloseIcon /></button>
                )}
              </figure>
            ))}
          </div>
        )}
        <form className="pill" onSubmit={(e) => { e.preventDefault(); void send() }}>
          <button type="button" className="icon-btn" aria-label="Add photos" onClick={() => fileInput.current?.click()} disabled={pending.length >= MAX_PHOTOS}>
            <PhotoIcon />
          </button>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { void addFiles([...(e.target.files ?? [])]); e.target.value = '' }} />
          <label htmlFor="dm" className="sr-only">Message</label>
          <textarea id="dm" ref={box} rows={1} value={text} maxLength={1000} placeholder="Message…" enterKeyHint="send"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }} />
          <button type="submit" className={canSend ? 'send on' : 'send'} disabled={!canSend} aria-label="Send">
            {sending ? <span className="dots"><i /><i /><i /></span> : <SendIcon />}
          </button>
        </form>
        <p className="notice">Night Shift demo. Messages and photos are deleted after the demo.</p>
      </footer>

      {dragging && <div className="drop fade" aria-hidden="true"><PhotoIcon /><p>Drop photos to add them</p></div>}

      {sheet && (
        <div className={closing ? 'scrim out' : 'scrim fade'} onClick={() => closeSheet()}>
          <section className={closing ? 'sheet out' : 'sheet'} role="dialog" aria-modal="true" aria-label={`${info.name} services`} onClick={(e) => e.stopPropagation()}>
            <div className="grab" aria-hidden="true" />
            <header>
              <span className="avatar big" aria-hidden="true">{info.name.slice(0, 1)}</span>
              <div>
                <h2>{info.name}</h2>
                <p className="muted">{info.craft} · {info.area}</p>
              </div>
              <button className="icon-btn" onClick={() => closeSheet()} aria-label="Close"><CloseIcon /></button>
            </header>
            <div className="work wide">{WORK[stylist].map((w) => <img key={w.src} src={w.src} alt={w.alt} loading="lazy" />)}</div>
            {MENU[stylist].map((s) => (
              <div key={s.title} className="menu">
                <h3 className="eyebrow">{s.title}</h3>
                {s.items.map((i) => (
                  <div key={i.name} className="item">
                    <span>{i.name}{i.note && <small className="muted">{i.note}</small>}</span>
                    <b>{i.price}</b>
                  </div>
                ))}
              </div>
            ))}
            <div className="menu">
              <h3 className="eyebrow">Good to know</h3>
              <ul className="policies">{POLICIES[stylist].map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
            <button className="btn primary full" onClick={() => closeSheet(() => box.current?.focus())}>Message {info.owner}</button>
          </section>
        </div>
      )}
      <style>{CSS}</style>
    </div>
  )
}

const CSS = `
.dm-app { height: 100dvh; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; max-width: 720px; margin: 0 auto; background: var(--bg); }
.dm-bar { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 8px; padding: calc(env(safe-area-inset-top) + 8px) max(12px, env(safe-area-inset-right)) 8px max(12px, env(safe-area-inset-left)); background: var(--glass); backdrop-filter: saturate(1.6) blur(18px); -webkit-backdrop-filter: saturate(1.6) blur(18px); border-bottom: 1px solid var(--line); }
.who { flex: 1; display: flex; align-items: center; gap: 10px; background: none; border: 0; padding: 4px; text-align: left; border-radius: 12px; }
.names { display: grid; line-height: 1.2; }
.names b { font-weight: 650; }
.names small { color: var(--muted); font-size: 13px; }
.avatar { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), oklch(62% 0.15 20)); color: var(--on-accent); display: grid; place-items: center; font-weight: 700; flex: none; }
.avatar.big { width: 72px; height: 72px; font-size: 28px; }
.avatar.small { width: 26px; height: 26px; font-size: 12px; }
.dm-thread { overflow-y: auto; overscroll-behavior: contain; padding: 12px max(14px, env(safe-area-inset-right)) 12px max(14px, env(safe-area-inset-left)); display: flex; flex-direction: column; gap: 4px; }
.intro { display: grid; justify-items: center; text-align: center; gap: 6px; padding: 28px 0 20px; }
.intro h1 { font-size: 20px; }
.intro .btn { margin-top: 6px; }
.work { display: flex; gap: 6px; margin-top: 10px; }
.work img { width: 76px; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 12px; background: var(--sunken); }
.work.wide { margin: 0; overflow-x: auto; scroll-snap-type: x mandatory; }
.work.wide img { width: 140px; flex: none; scroll-snap-align: start; }
.day { text-align: center; color: var(--faint); font-size: 12px; margin: 10px 0 6px; }
.turn { display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; }
.bubble { padding: 9px 14px; border-radius: 20px; max-width: min(78%, 480px); white-space: pre-wrap; line-height: 1.38; overflow-wrap: anywhere; }
.bubble.out { align-self: flex-end; background: var(--accent); color: var(--on-accent); border-bottom-right-radius: 6px; }
.bubble.in { background: var(--sunken); border-bottom-left-radius: 6px; }
.from-them { display: flex; align-items: flex-end; gap: 6px; margin-top: 6px; }
.photos { align-self: flex-end; display: grid; gap: 3px; width: min(72%, 360px); border-radius: 18px; overflow: hidden; }
.photos.n2, .photos.n3, .photos.n4 { grid-template-columns: 1fr 1fr; }
.photos.n3 img:first-child { grid-column: 1 / -1; }
.photos img { width: 100%; height: 100%; aspect-ratio: 1; object-fit: cover; background: var(--sunken); }
.photos.n1 img { aspect-ratio: auto; max-height: 420px; }
.receipt { align-self: flex-end; text-align: right; color: var(--faint); font-size: 12px; line-height: 1.5; margin: 0 4px 4px; }
.dm-compose { padding: 6px max(10px, env(safe-area-inset-right)) calc(env(safe-area-inset-bottom) + 6px) max(10px, env(safe-area-inset-left)); background: var(--bg); display: grid; gap: 6px; }
.tray { display: flex; gap: 8px; padding: 4px 4px 0; overflow-x: auto; }
.thumb { position: relative; margin: 0; width: 64px; height: 64px; flex: none; border-radius: 12px; overflow: hidden; }
.thumb img { width: 100%; height: 100%; object-fit: cover; }
.thumb.uploading img { opacity: 0.5; }
.thumb .remove { position: absolute; top: 3px; right: 3px; width: 22px; height: 22px; border-radius: 50%; border: 0; padding: 3px; background: oklch(0% 0 0 / 0.6); color: white; display: grid; place-items: center; }
.thumb .remove svg { width: 14px; height: 14px; }
.pill { display: flex; align-items: flex-end; gap: 4px; background: var(--surface); border: 1px solid var(--line); border-radius: 24px; padding: 4px; box-shadow: var(--shadow); }
.pill textarea { flex: 1; border: 0; background: transparent; resize: none; padding: 9px 4px; min-height: 40px; max-height: 140px; field-sizing: content; outline: none; }
.send { width: 40px; height: 40px; border-radius: 50%; border: 0; display: grid; place-items: center; background: var(--sunken); color: var(--faint); transition: background 160ms var(--ease), color 160ms var(--ease), transform 120ms var(--ease); flex: none; }
.send.on { background: var(--accent); color: var(--on-accent); }
.send.on:active { transform: scale(0.92); }
.send svg { width: 20px; height: 20px; }
.error { color: var(--bad); font-size: 14px; padding: 0 8px; }
.notice { font-size: 11px; color: var(--faint); text-align: center; }
.drop { position: fixed; inset: 10px; border: 2px dashed var(--accent); border-radius: 24px; background: var(--glass); backdrop-filter: blur(8px); display: grid; place-content: center; justify-items: center; gap: 8px; color: var(--accent); font-weight: 600; z-index: 10; pointer-events: none; }
.drop svg { width: 40px; height: 40px; }
.scrim { position: fixed; inset: 0; background: oklch(0% 0 0 / 0.4); z-index: 20; display: flex; align-items: flex-end; justify-content: center; }
.sheet { background: var(--surface); width: min(560px, 100%); max-height: 88dvh; overflow-y: auto; border-radius: 22px 22px 0 0; padding: 8px 20px calc(env(safe-area-inset-bottom) + 20px); display: grid; gap: 18px; box-shadow: var(--shadow); }
@media (prefers-reduced-motion: no-preference) {
  .sheet { animation: sheet-up 280ms var(--ease) both; }
  .sheet.out { animation: sheet-down 220ms var(--ease) both; }
  .scrim.out { animation: fade 220ms var(--ease) reverse both; }
}
.grab { width: 40px; height: 5px; border-radius: 3px; background: var(--line); justify-self: center; }
.sheet header { display: flex; gap: 14px; align-items: center; }
.sheet header div { flex: 1; }
.sheet h2 { font-size: 20px; }
.menu { display: grid; gap: 2px; }
.menu .eyebrow { margin-bottom: 6px; }
.item { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); align-items: baseline; }
.item span { display: grid; }
.item small { font-size: 13px; }
.item b { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.policies { margin: 0; padding-left: 18px; display: grid; gap: 8px; color: var(--muted); }
.btn.full { width: 100%; padding: 13px; }
@media (min-width: 720px) {
  .scrim { align-items: center; }
  .sheet { border-radius: 22px; }
  .grab { display: none; }
}
`
