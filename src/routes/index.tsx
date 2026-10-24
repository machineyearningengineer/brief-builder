// The front page: what it does, the measured result, and the three stylists to message.
import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ChatIcon, InboxIcon, PinIcon } from '../client/icons.tsx'
import { Tip } from '../client/tip.tsx'
import scoreboard from '../shared/scoreboard.json'
import { STYLISTS, type StylistKey } from '../shared/stylists.ts'

export const Route = createFileRoute('/')({ component: Home })

type Summary = { fullyRight: number }
const BOARDS = scoreboard as unknown as Record<string, { testSet?: string; base?: Summary; corrected?: Summary; rules?: Summary } | undefined>
const steps = (s: StylistKey) => {
  const b = BOARDS[s]
  if (!b?.base || !b.corrected) return null
  return { plain: b.base.fullyRight, fixes: b.corrected.fullyRight, now: b.rules?.fullyRight ?? b.corrected.fullyRight }
}

// Her own work, used as her cover and avatar.
const LOOK: Record<StylistKey, { cover: string; services: string[]; blurb: string }> = {
  braider: { cover: '/work/knotless.webp', services: ['Knotless', 'Box braids', 'Locs', 'Silk press'], blurb: 'Reads the photo for style, length and size, prices it from her list, and never books without offering times.' },
  colourist: { cover: '/work/curls.webp', services: ['Balayage', 'Highlights', 'Toners', 'Colour correction'], blurb: 'Knows box dye means a consultation first, and that every new client needs a patch test 48 hours before.' },
  nails: { cover: '/work/chrome-aura.webp', services: ['BIAB', 'Gel', 'Acrylics', 'Nail art'], blurb: 'Adds the soak-off when gel is from another salon, and treats ballerina as coffin and infills as three weeks.' },
}

function Home() {
  const hero = steps('braider')
  return (
    <main className="home">
      <header className="intro">
        <p className="eyebrow">Night Shift · London · built on Mubit</p>
        <h1>Brief Builder</h1>
        <p className="lead">Turn “can u do these?” into a booking. A stylist’s DM inbox that drafts priced replies in her voice, and learns from every fix she makes.</p>
      </header>

      {hero && (
        <section className="proof" aria-label="Results">
          <div className="big">
            <span className="num">{hero.now}%</span>
            <span className="what"><Tip tip="Every detail of the brief matches what she would have written: service, look, day, price details and what to do next. Measured on 60 test DMs Mubit never trained on, run three times; this is the middle run.">of replies fully right on DMs it never trained on</Tip></span>
          </div>
          <Steps {...hero} />
        </section>
      )}

      <Film />

      <ol className="how" aria-label="How it works">
        <li><b>A client DMs</b><span>A photo and a few words.</span></li>
        <li><b>A priced reply drafts itself</b><span>From her prices, rules and voice.</span></li>
        <li><b>She fixes it in one tap</b><span>The next draft already knows.</span></li>
      </ol>

      <section className="stylists">
        <h2>Message a stylist</h2>
        <div className="grid">
          {(Object.keys(STYLISTS) as StylistKey[]).map((id) => {
            const s = STYLISTS[id]
            const look = LOOK[id]
            const r = steps(id)
            return (
              <article key={id} className="card">
                <div className="cover"><img src={look.cover} alt={`${s.name}’s work`} loading="lazy" /></div>
                <div className="body">
                  <span className="avatar" aria-hidden="true">{s.name.slice(0, 1)}</span>
                  <h3>{s.name}</h3>
                  <p className="place"><PinIcon /> {s.area}, London</p>
                  <ul className="chips">{look.services.map((x) => <li key={x}>{x}</li>)}</ul>
                  <p className="blurb">{look.blurb}</p>
                  {r && (
                    <div className="mini" aria-label={`Fully right: ${r.plain}% plain, ${r.now}% now`}>
                      <span className="track"><i style={{ width: `${r.now}%` }} /><s style={{ left: `${r.plain}%` }} /></span>
                      <span className="label"><span className="muted">{r.plain}% →</span> <b>{r.now}%</b> fully right</span>
                    </div>
                  )}
                  <div className="actions">
                    <Link to="/s/$stylist" params={{ stylist: id }} className="go"><ChatIcon /> Message her</Link>
                    <Link to="/inbox/$stylist" params={{ stylist: id }} className="quiet"><InboxIcon /> Her inbox</Link>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
        <p className="muted small">Her inbox needs the stylist’s key. Messages and photos are deleted after the demo.</p>
      </section>

      <footer className="foot">
        <Link to="/stage">Stage</Link>
        <Link to="/control">Control</Link>
        <a href="https://github.com/machineyearningengineer/brief-builder">Code on GitHub</a>
      </footer>
      <style>{CSS}</style>
    </main>
  )
}

// The film, sized to the screen: upright on a phone, landscape on a wider screen. The short cut
// is the 60-second version, for anyone in a hurry.
const CUTS = {
  film: { label: 'Full film', length: '1:59', wide: { src: '/media/brief-builder.mp4', poster: '/film/poster.jpg' }, tall: { src: '/media/brief-builder-mobile.mp4', poster: '/film/mobile-poster.jpg' } },
  short: { label: 'Short', length: '0:59', wide: { src: '/media/brief-builder-story.mp4', poster: '/film/story-poster.jpg' }, tall: { src: '/media/brief-builder-story.mp4', poster: '/film/story-poster.jpg' } },
} as const
type Cut = keyof typeof CUTS

function Film() {
  const [cut, setCut] = useState<Cut>('film')
  const [tall, setTall] = useState(false)
  useEffect(() => {
    const q = window.matchMedia('(max-aspect-ratio: 4/5)')
    setTall(q.matches)
    const on = () => setTall(q.matches)
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  const upright = tall || cut === 'short'
  const v = CUTS[cut][tall ? 'tall' : 'wide']
  return (
    <section className={`film ${upright ? 'upright' : ''}`} aria-labelledby="film-title">
      <div className="film-head">
        <h2 id="film-title">Watch it work</h2>
        <div className="cuts" role="group" aria-label="Which cut">
          {(Object.keys(CUTS) as Cut[]).map((k) => (
            <button key={k} type="button" aria-pressed={cut === k} onClick={() => setCut(k)}>{CUTS[k].label} <span>{CUTS[k].length}</span></button>
          ))}
        </div>
      </div>
      <video key={v.src} src={v.src} poster={v.poster} controls playsInline preload="metadata" />
      <a className="film-save" href={`${v.src}?download`} download>Download this cut</a>
    </section>
  )
}

// Plain model → her fixes → her rules in code, on one track.
function Steps({ plain, fixes, now }: { plain: number; fixes: number; now: number }) {
  return (
    <div className="steps">
      <div className="track"><i className="now" style={{ width: `${now}%` }} /><i className="fixes" style={{ width: `${fixes}%` }} /><i className="plain" style={{ width: `${plain}%` }} /></div>
      <dl>
        <div><dt><Tip tip="The base model on its own, with her prices and house rules in its instructions.">Plain model</Tip></dt><dd>{plain}%</dd></div>
        <div><dt><Tip tip="Her closest past fixes go into each draft as worked examples.">Her fixes</Tip></dt><dd>{fixes}%</dd></div>
        <div><dt><Tip tip="Code applies her stated rules exactly: the next step, what’s missing, dates, photo clashes, consultations and soak-offs." align="end">Her rules in code</Tip></dt><dd className="accent">{now}%</dd></div>
      </dl>
    </div>
  )
}

const CSS = `
.home { max-width: 1080px; margin: 0 auto; padding-block: 8vh 56px; padding-left: max(16px, env(safe-area-inset-left)); padding-right: max(16px, env(safe-area-inset-right)); display: grid; gap: 40px; }
.intro { display: grid; gap: 14px; max-width: 760px; }
.intro h1 { font-family: var(--display); font-size: clamp(48px, 9vw, 88px); font-weight: 750; letter-spacing: -0.035em; line-height: 0.95; }
.lead { font-size: clamp(18px, 2.4vw, 22px); margin: 0; color: var(--muted); }
.small { font-size: 13px; margin: 0; }
.proof { display: grid; gap: 16px; padding: 24px; border-radius: 22px; background: var(--surface); box-shadow: var(--shadow); border: 1px solid var(--line); }
.big { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 6px 20px; }
.big .num { font-family: var(--display); font-weight: 750; font-size: clamp(56px, 10vw, 96px); line-height: 0.9; letter-spacing: -0.03em; color: var(--accent); font-variant-numeric: tabular-nums; }
.big .what { font-size: 18px; max-width: 24ch; text-wrap: balance; padding-bottom: 0.35em; }
.steps .track { position: relative; height: 12px; border-radius: 12px; background: var(--sunken); overflow: hidden; }
.steps .track i { position: absolute; inset: 0 auto 0 0; border-radius: 12px; }
.steps .now { background: var(--accent); }
.steps .fixes { background: color-mix(in oklch, var(--accent) 45%, var(--sunken)); }
.steps .plain { background: var(--faint); }
.steps dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 12px 0 0; }
/* Numbers share one baseline even when a label wraps. */
.steps dl div { display: flex; flex-direction: column; justify-content: flex-end; }
.steps dt { font-size: 13px; color: var(--muted); }
.steps dd { margin: 2px 0 0; font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.steps dd.accent { color: var(--accent); }
.how { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; counter-reset: s; }
.how li { counter-increment: s; display: grid; gap: 4px; padding: 16px 18px; border: 1.5px dashed var(--line); border-radius: var(--radius); }
.how li::before { content: counter(s); width: 26px; height: 26px; border-radius: 26px; display: grid; place-items: center; font-size: 13px; font-weight: 700; background: var(--accent-soft); color: var(--accent); margin-bottom: 4px; }
.how span { color: var(--muted); font-size: 15px; }
.stylists { display: grid; gap: 16px; }
.stylists h2 { font-family: var(--display); font-size: 28px; letter-spacing: -0.02em; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.card { border-radius: 22px; overflow: hidden; background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow); display: flex; flex-direction: column; }
.cover { aspect-ratio: 16 / 9; overflow: hidden; background: var(--sunken); }
.cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.card .body { position: relative; padding: 36px 18px 18px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
.avatar { position: absolute; top: -30px; left: 18px; width: 56px; height: 56px; border-radius: 56px; border: 3px solid var(--surface); display: grid; place-items: center; font-family: var(--display); font-weight: 700; font-size: 24px; color: var(--on-accent); background: linear-gradient(135deg, var(--accent), oklch(66% 0.12 20)); }
.card h3 { font-size: 20px; }
.place { margin: -4px 0 0; display: flex; align-items: center; gap: 4px; color: var(--muted); font-size: 14px; }
.place svg { width: 16px; height: 16px; }
.chips { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.chips li { font-size: 12.5px; padding: 4px 10px; border-radius: 99px; background: var(--sunken); }
.blurb { margin: 0; font-size: 14.5px; color: var(--muted); }
.mini { display: grid; gap: 6px; margin-top: auto; padding-top: 6px; }
.mini .track { position: relative; height: 8px; border-radius: 8px; background: var(--sunken); }
.mini .track i { position: absolute; inset: 0 auto 0 0; border-radius: 8px; background: var(--accent); }
.mini .track s { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--muted); }
.mini .label { font-size: 14px; font-variant-numeric: tabular-nums; }
.mini b { color: var(--accent); }
.actions { display: flex; gap: 8px; align-items: center; }
.actions a { text-decoration: none; display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 15px; border-radius: 99px; padding: 10px 14px; }
.actions svg { width: 18px; height: 18px; }
.actions .go { flex: 1; justify-content: center; background: var(--accent); color: var(--on-accent); }
.actions .go:hover { background: var(--accent-hover); }
.actions .quiet { color: var(--muted); border: 1px solid var(--line); }
.actions .quiet:hover { color: var(--ink); }
.actions a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.film { display: grid; gap: 14px; }
.film-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; }
.film h2 { font-family: var(--display); font-size: 28px; letter-spacing: -0.02em; }
.cuts { display: inline-flex; padding: 3px; border-radius: 99px; background: var(--sunken); }
.cuts button { border: 0; background: none; padding: 7px 14px; border-radius: 99px; font-weight: 600; font-size: 14px; color: var(--muted); }
.cuts button span { font-weight: 500; font-variant-numeric: tabular-nums; opacity: 0.8; }
.cuts button[aria-pressed=true] { background: var(--surface); color: var(--ink); box-shadow: var(--shadow); }
.cuts button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.film video { display: block; width: 100%; border-radius: 22px; background: #0b090a; border: 1px solid var(--line); box-shadow: var(--shadow); aspect-ratio: 16 / 9; }
.film.upright video { aspect-ratio: 9 / 16; width: min(100%, 380px, calc(78svh * 9 / 16)); justify-self: center; }
.film-save { justify-self: start; font-size: 14px; color: var(--muted); }
.film.upright .film-save { justify-self: center; }
.foot { display: flex; gap: 18px; font-size: 14px; }
.foot a { color: var(--muted); }
@media (max-width: 880px) { .grid { grid-template-columns: 1fr; } .how { grid-template-columns: 1fr; gap: 0; } .how li { border: 0; border-bottom: 1px dashed var(--line); border-radius: 0; padding: 12px 0; grid-template-columns: 30px 1fr; column-gap: 10px; } .how li::before { grid-row: span 2; margin: 0; } .home { padding-block: 32px 48px; gap: 28px; } }
@media (max-width: 480px) { .steps dl { grid-template-columns: 1fr 1fr 1fr; } .steps dd { font-size: 18px; } }
`
