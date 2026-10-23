import { Link, createFileRoute } from '@tanstack/react-router'
import { STYLISTS } from '../shared/stylists.ts'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main className="home">
      <p className="eyebrow">Night Shift · London</p>
      <h1>Brief Builder</h1>
      <p className="lead">A stylist’s inbox that turns client DMs into bookable briefs, and learns that stylist’s house rules from every fix.</p>
      <ul>
        {Object.values(STYLISTS).map((s) => (
          <li key={s.id}>
            <b>{s.name}</b> <span className="muted">· {s.area}</span>
            <span className="links">
              <Link to="/s/$stylist" params={{ stylist: s.id }}>Message</Link>
              <Link to="/inbox/$stylist" params={{ stylist: s.id }}>Inbox</Link>
            </span>
          </li>
        ))}
      </ul>
      <style>{`
        .home { max-width: 640px; margin: 10vh auto; padding: 0 max(16px, env(safe-area-inset-left)); display: grid; gap: 14px; }
        .home h1 { font-size: clamp(40px, 8vw, 64px); font-weight: 750; letter-spacing: -0.02em; }
        .lead { font-size: 20px; margin: 0; }
        .home ul { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 10px; }
        .home li { border: 1.5px dashed var(--line); border-radius: var(--radius); padding: 14px 16px; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
        .links { margin-left: auto; display: flex; gap: 14px; }
        .home a { color: var(--accent); font-weight: 600; }
      `}</style>
    </main>
  )
}
