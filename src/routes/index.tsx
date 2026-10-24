import { Link, createFileRoute } from '@tanstack/react-router'
import scoreboard from '../shared/scoreboard.json'
import { STYLISTS, type StylistKey } from '../shared/stylists.ts'

export const Route = createFileRoute('/')({ component: Home })

type Summary = { fullyRight: number }
const BOARDS = scoreboard as unknown as Record<string, { base?: Summary; corrected?: Summary; rules?: Summary } | undefined>
// The app as it runs: her fixes plus the decisions made in code, else her fixes alone.
const result = (s: StylistKey) => {
  const b = BOARDS[s]
  const end = b?.rules?.fullyRight ?? b?.corrected?.fullyRight
  return b?.base && end != null ? { from: b.base.fullyRight, to: end } : null
}

function Home() {
  const hero = result('braider')
  return (
    <main className="home">
      <p className="eyebrow">Night Shift · London · built on Mubit</p>
      <h1>Brief Builder</h1>
      <p className="lead">Turn “can u do these?” into a booking. A stylist’s DM inbox that drafts priced replies in her voice, and learns from every fix she makes.</p>
      {hero && <p className="proof"><b>{hero.from}% → {hero.to}%</b> of replies fully right on DMs it never trained on.</p>}
      <ul>
        {(Object.keys(STYLISTS) as StylistKey[]).map((id) => {
          const s = STYLISTS[id]
          const r = result(id)
          return (
            <li key={id}>
              <span className="who"><b>{s.name}</b><span className="muted">{s.area} · {s.craft}</span></span>
              {r && <span className="muted score">{r.from}% → {r.to}%</span>}
              <span className="links">
                <Link to="/s/$stylist" params={{ stylist: id }} className="btn primary">Message her</Link>
                <Link to="/inbox/$stylist" params={{ stylist: id }}>Her inbox</Link>
              </span>
            </li>
          )
        })}
      </ul>
      <p className="muted foot">
        <Link to="/stage">Stage</Link> · <a href="https://github.com/machineyearningengineer/brief-builder">Code on GitHub</a> · The inbox needs the stylist’s key.
      </p>
      <style>{`
        .home { max-width: 720px; margin: 9vh auto; padding-block: 0 48px; padding-left: max(16px, env(safe-area-inset-left)); padding-right: max(16px, env(safe-area-inset-right)); display: grid; gap: 14px; }
        .home h1 { font-size: clamp(44px, 9vw, 72px); font-weight: 750; letter-spacing: -0.025em; }
        .lead { font-size: 20px; margin: 0; max-width: 56ch; }
        .proof { margin: 4px 0 0; font-size: 18px; }
        .proof b { color: var(--accent); }
        .home ul { list-style: none; padding: 0; margin: 14px 0 0; display: grid; gap: 10px; }
        .home li { border: 1.5px dashed var(--line); border-radius: var(--radius); padding: 14px 16px; display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; }
        .who { display: grid; gap: 2px; min-width: 0; }
        .score { font-variant-numeric: tabular-nums; }
        .links { margin-left: auto; display: flex; gap: 14px; align-items: center; }
        .home a { color: var(--accent); font-weight: 600; }
        .home a.btn.primary { color: var(--on-accent); }
        .foot { margin-top: 10px; font-size: 14px; }
      `}</style>
    </main>
  )
}
