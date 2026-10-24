// The demo map, full screen on a phone. It's a private page uploaded with scripts/push-doc.ts,
// fetched with the stylist key, so it never sits in the public repo or a public URL.
import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { BackIcon } from '../client/icons.tsx'
import { KeyGate, useStylistKey } from './control.tsx'

export const Route = createFileRoute('/control_/map')({
  head: () => ({ meta: [{ title: 'Demo map · Brief Builder' }, { name: 'robots', content: 'noindex' }] }),
  component: DemoMap,
})

function DemoMap() {
  const { token, ready, save } = useStylistKey()
  const [page, setPage] = useState<{ url: string } | { status: number } | null>(null)
  useEffect(() => {
    if (!token) return
    setPage(null)
    fetch('/api/doc/demo-map', { headers: { 'x-stylist-token': token } })
      // A blob URL, not srcdoc, so the map's own #links scroll within it.
      .then(async (r) => setPage(r.ok ? { url: URL.createObjectURL(new Blob([await r.text()], { type: 'text/html' })) } : { status: r.status }))
      .catch(() => setPage({ status: 0 }))
  }, [token])
  useEffect(() => () => { if (page && 'url' in page) URL.revokeObjectURL(page.url) }, [page])

  if (!ready) return null
  const denied = !!page && 'status' in page && page.status === 401
  if (!token || denied) return <KeyGate denied={denied} onKey={save} title="Demo map" what="Enter the stylist key to open the demo map." />

  return (
    <div className="map-shell">
      <header>
        <Link to="/control" className="map-back"><BackIcon /> Control</Link>
      </header>
      {!page ? <p className="map-note muted">Loading…</p>
        : 'url' in page ? <iframe title="Demo map" src={page.url} sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" />
        : <p className="map-note muted">{page.status === 404 ? 'The map isn’t uploaded yet. On the laptop: node scripts/push-doc.ts demo-map <file>' : 'The map didn’t load. Check the connection and reload.'}</p>}
      <style>{`
        .map-shell { position: fixed; inset: 0; display: grid; grid-template-rows: auto 1fr; background: var(--bg); }
        .map-shell header { padding: max(8px, env(safe-area-inset-top)) 12px 8px; border-bottom: 1px solid var(--line); }
        .map-back { display: inline-flex; align-items: center; gap: 4px; min-height: 36px; text-decoration: none; color: var(--ink); font-weight: 600; }
        .map-back svg { width: 20px; height: 20px; }
        .map-shell iframe { width: 100%; height: 100%; border: 0; background: #fff; }
        .map-note { padding: 24px 16px; }
      `}</style>
    </div>
  )
}
