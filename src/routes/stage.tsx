// The projector view: the locked-test scoreboard (from real runs) and the live room.
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import scoreboard from '../shared/scoreboard.json'
import { imageUrlForStylist, stylistToken, useRoom } from '../client/room.ts'
import mubit from '../shared/mubit-status.json'
import type { RoomMessage } from '../shared/stylists.ts'
import { Qr } from '../client/qr.tsx'
import { STYLISTS, type StylistKey } from '../shared/stylists.ts'

export const Route = createFileRoute('/stage')({
  head: () => ({ meta: [{ title: 'Stage · Brief Builder' }] }),
  component: Stage,
})

type Summary = { label: string; fullyRight: number; nextAction: number; fields: number; nextActionByRule: Record<string, number> }
type Board = { testSet: string; base: Summary | null; corrected: Summary | null; rules?: Summary | null }
const BOARDS = scoreboard as unknown as Record<string, Board | undefined>
const RULE_SHORT: Record<StylistKey, Record<string, string>> = {
  braider: {
    '1': 'Boho vs curly ends', '3': 'Hair not included', '4': 'Budget is a ceiling', '5': 'Offer slots, never book',
    '6': 'Smedium', '7': 'Groups and kids', '9': 'Day words', '11': 'Photo vs text',
  },
  nails: {
    '17': 'Soak-off from elsewhere', '18': 'Bitten nails: photo first', '19': 'Infection: refer', '20': 'Ballerina is coffin',
    '21': 'Infills within 3 weeks', '22': 'Pinterest art: photo first', '5': 'Offer slots, never book', '9': 'Day words',
  },
  colourist: {
    '12': 'Patch test first', '13': 'Toner included', '14': 'Lived-in blonde', '15': 'Box dye needs a consult',
    '16': 'Dark to blonde', '5': 'Offer slots, never book', '9': 'Day words', '4': 'Budget is a ceiling',
  },
}

function Stage() {
  const [stylist, setStylist] = useState<StylistKey>('braider')
  const [token, setToken] = useState('')
  const [origin, setOrigin] = useState('')
  useEffect(() => {
    setToken(stylistToken.get())
    setOrigin(location.origin)
  }, [])
  const { messages, connected } = useRoom(stylist, token ? { token } : null)
  const latest = messages.at(-1)
  const fixes = messages.filter((m) => m.corrected).length
  const lastFix = [...messages].reverse().find((m) => m.corrected && m.changed.length)
  const adapter = (mubit.adapters as Record<string, { version: string; base: string; quality: number | null; target: number; tests: number | null; kept: number; state: string; next?: string | null; calls?: number }>)[stylist]
  const board = BOARDS[stylist]
  const base = board?.base
  const fixed = board?.corrected
  // The app as it runs: her fixes plus the decisions made in code.
  const final = board?.rules ?? fixed

  return (
    <main className="stage">
      <header>
        <div>
          <p className="eyebrow">Brief Builder · {board?.testSet ?? 'locked test set'}</p>
          <h1>Every fix makes the next draft better, and trains her own model.</h1>
        </div>
        <div className="switch" role="group" aria-label="Stylist">
          {(Object.keys(STYLISTS) as StylistKey[]).map((s) => (
            <button key={s} className={s === stylist ? 'btn primary' : 'btn'} onClick={() => setStylist(s)}>{STYLISTS[s].name}</button>
          ))}
        </div>
      </header>

      {base && fixed ? (
        <section className="scores">
          <Score label="Briefs fully right" a={base.fullyRight} b={fixed.fullyRight} c={board?.rules?.fullyRight} />
          <Score label="Right next step" a={base.nextAction} b={fixed.nextAction} c={board?.rules?.nextAction} />
          <Score label="Fields right" a={base.fields} b={fixed.fields} c={board?.rules?.fields} />
        </section>
      ) : (
        <section className="scores"><p className="muted">This stylist’s locked test hasn’t been scored yet.</p></section>
      )}

      <section className="rules">
        <h2>Right next step, by house rule</h2>
        {base && final && <div className="legend"><span><i className="a" /> Plain model</span><span><i className="b" /> Brief Builder: her fixes and rules</span></div>}
        {base && final && Object.entries(RULE_SHORT[stylist]).filter(([id]) => id in base.nextActionByRule).map(([id, name]) => {
          const a = base.nextActionByRule[id] ?? 0
          const b = final.nextActionByRule[id] ?? 0
          return (
            <div key={id} className="rule">
              <span className="name">{name}</span>
              <span className="bars">
                <span className="bar a" style={{ width: `${a}%` }}><b>{a}%</b></span>
                <span className="bar b" style={{ width: `${b}%` }}><b>{b}%</b></span>
              </span>
            </div>
          )
        })}
      </section>

      <section className="live">
        <div className="scan">
          <Qr value={origin ? `${origin}/s/${stylist}` : ''} size={168} label={`QR code to message ${STYLISTS[stylist].name}`} />
          <div>
            <p className="eyebrow">Scan to message</p>
            <p className="scan-name">{STYLISTS[stylist].name}</p>
            <p className="muted mono">{origin.replace(/^https?:\/\//, '')}/s/{stylist}</p>
          </div>
        </div>
        <h2>Live <span className={connected ? 'dot on' : 'dot'} aria-label={connected ? 'connected' : 'connecting'} /></h2>
        {!token && <p className="muted">Open the inbox once on this laptop to connect the live view.</p>}
        {latest ? (
          <div className="latest rise" key={latest.id + latest.status}>
            {latest.images.length > 0 && token && <StagePhoto stylist={stylist} id={latest.images[0]} token={token} />}
            {latest.text && <p className="dm">“{latest.text}”</p>}
            {latest.status === 'drafting' && <p className="muted"><span className="dots"><i /><i /><i /></span> Drafting through Mubit…</p>}
            {latest.brief && (
              <p className="facts">
                {[latest.brief.service, latest.brief.look?.length, latest.brief.look?.size ?? latest.brief.look?.shade, latest.brief.look?.ends]
                  .filter((v) => v && v !== 'unknown').map((v) => String(v).replaceAll('_', ' ')).join(' · ')}
                <span> → {String(latest.brief.next_action).replace('_', ' ')}</span>
              </p>
            )}
            {latest.brief && <p className="muted">{(latest.ms! / 1000).toFixed(1)} s · {latest.correctionsUsed} past fixes used</p>}
            {latest.brief && latest.baseline && (
              <div className="versus">
                <div className="side plain">
                  <p className="eyebrow">Plain model</p>
                  <p>{latest.baseline.reply}</p>
                  <small className="faint">Next step: {latest.baseline.nextAction.replace('_', ' ')}</small>
                </div>
                <div className="side ours">
                  <p className="eyebrow">With {STYLISTS[stylist].name.split(' ')[0]}’s fixes</p>
                  <p>{(latest.corrected ?? latest.brief).reply_draft}</p>
                  <small>Next step: {String((latest.corrected ?? latest.brief).next_action).replace('_', ' ')}</small>
                </div>
              </div>
            )}
          </div>
        ) : token && <p className="muted">Scan the QR code and send a DM.</p>}
        {lastFix && <FixLine m={lastFix} name={STYLISTS[stylist].name.split(' ')[0]} />}
        {adapter && (
          <div className="mubit">
            <p className="eyebrow">{STYLISTS[stylist].name.split(' ')[0]}’s own model · in training on Mubit</p>
            <p><b>{adapter.version}</b> on {adapter.base} · trained on {adapter.kept}+ kept examples</p>
            <div className="meter" aria-label={adapter.quality == null ? 'Training' : `${adapter.quality}% of target`}><i style={{ width: `${adapter.quality ?? 0}%` }} /><span style={{ left: `${adapter.target}%` }} /></div>
            <p className="muted">{adapter.quality == null ? `${adapter.state}, aiming for ${adapter.target}%` : `Matches the big model on ${adapter.quality}% of ${adapter.tests} test cases, aiming for ${adapter.target}%. ${adapter.state}`}. Checked {mubit.checkedAt}.</p>
            {adapter.next && <p className="muted">{adapter.next}</p>}
          </div>
        )}
        <VoiceLine messages={messages} name={STYLISTS[stylist].name.split(' ')[0]} />
        <p className="count"><b>{fixes}</b> fixes this session · each one recorded by Mubit for the adapter</p>
      </section>
      <style>{STAGE_CSS}</style>
    </main>
  )
}

// How much of each draft she rewrote before sending, oldest to newest: falls as it learns her voice.
function VoiceLine({ messages, name }: { messages: RoomMessage[]; name: string }) {
  const shares = messages.filter((m) => m.editShare != null).map((m) => m.editShare!)
  if (shares.length < 2) return null
  const first = Math.round(shares[0] * 100)
  const last = Math.round(shares.at(-1)! * 100)
  return (
    <div className="voice">
      <p className="eyebrow">How much {name} rewrites each draft</p>
      <div className="bars">{shares.slice(-12).map((v, i) => <i key={i} style={{ height: `${Math.max(4, v * 100)}%` }} />)}</div>
      <p className="muted">{first}% of the first draft · {last}% of the latest</p>
    </div>
  )
}

function StagePhoto({ stylist, id, token }: { stylist: StylistKey; id: string; token: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let made: string | null = null
    imageUrlForStylist(stylist, id, token).then((u) => {
      made = u
      setUrl(u)
    })
    return () => {
      if (made) URL.revokeObjectURL(made)
    }
  }, [stylist, id, token])
  return url ? <img className="stage-photo" src={url} alt="The client's photo" /> : null
}

const say = (v: unknown) => (Array.isArray(v) ? v.join(', ') || 'none' : v === 'unknown' || v == null ? 'not set' : String(v)).replaceAll('_', ' ')

// The most recent correction, said the way the stylist made it.
function FixLine({ m, name }: { m: RoomMessage; name: string }) {
  const path = m.changed[0]
  const get = (o: any) => path.split('.').reduce((v, k) => v?.[k], o)
  const label = path.split('.').pop()!.replace('_', ' ')
  const before = get(m.brief)
  const after = get(m.corrected)
  const detail = Array.isArray(before) && Array.isArray(after)
    ? `${before.filter((x) => !after.includes(x)).map(say).join(', ') || 'none'} → ${after.filter((x) => !before.includes(x)).map(say).join(', ') || 'removed'}`
    : `${say(before)} → ${say(after)}`
  return (
    <p className="fixline settle" key={m.id + path}>
      <b>{name} fixed {label}</b> {detail}{m.changed.length > 1 ? ` (+${m.changed.length - 1} more)` : ''}
    </p>
  )
}

// Plain model → with her fixes → with her rules in code (when scored).
function Score({ label, a, b, c }: { label: string; a: number; b: number; c?: number }) {
  return (
    <div className="score">
      <p className="eyebrow">{label}</p>
      <p className="nums"><span className="from">{a}%</span><span className="arrow">→</span>{c == null ? <span className="to">{b}%</span> : <><span className="from">{b}%</span><span className="arrow">→</span><span className="to">{c}%</span></>}</p>
      <p className="muted steps">{c == null ? 'plain · her fixes' : 'plain · her fixes · her rules in code'}</p>
    </div>
  )
}

const STAGE_CSS = `
.stage { padding: 40px 56px; display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 28px 48px; min-height: 100dvh; align-content: start; }
.stage header { grid-column: 1 / -1; display: flex; justify-content: space-between; gap: 24px; align-items: flex-end; }
.stage h1 { font-size: clamp(30px, 3.4vw, 48px); font-weight: 750; max-width: 22ch; }
.switch { display: flex; gap: 8px; }
.scores { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.score { border: 1.5px dashed var(--line); border-radius: var(--radius); padding: 18px 22px; }
.nums { margin: 6px 0 0; display: flex; align-items: baseline; gap: 14px; font-family: var(--display); font-variant-numeric: tabular-nums; }
.from { font-size: 34px; color: var(--muted); }
.arrow { font-size: 26px; color: var(--muted); }
.to { font-size: 60px; font-weight: 750; color: var(--accent); }
.score .steps { margin: 4px 0 0; font-size: 13px; }
.rules h2, .live h2 { font-size: 22px; margin-bottom: 10px; display: flex; align-items: center; gap: 10px; }
.legend { display: flex; gap: 18px; font-size: 14px; color: var(--muted); margin-bottom: 10px; }
.legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; vertical-align: -1px; }
.legend i.a, .bar.a { background: var(--line); }
.legend i.b, .bar.b { background: var(--accent); }
.rule { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 14px; align-items: center; padding: 6px 0; }
.rule .name { font-size: 16px; }
.bars { display: grid; gap: 4px; }
.bar { height: 16px; border-radius: 4px; position: relative; min-width: 2px; }
.bar b { position: absolute; left: calc(100% + 6px); top: -2px; font-size: 13px; font-weight: 600; color: var(--muted); font-variant-numeric: tabular-nums; }
.bar.b b { color: var(--accent); }
.live { border-left: 1px solid var(--line); padding-left: 32px; display: flex; flex-direction: column; gap: 10px; }
.scan { display: flex; gap: 18px; align-items: center; padding: 14px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); margin-bottom: 8px; }
.scan svg { border-radius: 10px; flex: none; }
.scan-name { font: 700 22px/1.2 var(--sans); margin: 4px 0; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--line); display: inline-block; }
.dot.on { background: var(--good); }
.latest { border: 1.5px dashed var(--accent); border-radius: var(--radius); padding: 16px 18px; display: grid; gap: 6px; }
.latest .dm { font-size: 22px; margin: 0; }
.facts { margin: 0; font-weight: 600; font-size: 18px; }
.facts span { color: var(--accent); }
.stage-photo { width: 120px; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 12px; float: right; margin-left: 12px; }
.fixline { border-left: 3px solid var(--good); border-radius: 0; padding: 6px 12px; background: var(--good-soft); font-size: 16px; }
.fixline b { color: var(--good); margin-right: 6px; }
.voice { border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; display: grid; gap: 8px; background: var(--surface); }
.voice .bars { display: flex; align-items: flex-end; gap: 6px; height: 56px; }
.voice .bars i { flex: 1; border-radius: 4px; background: var(--accent); transition: height 400ms var(--ease); }
.mubit { border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; display: grid; gap: 6px; background: var(--surface); }
.mubit p { margin: 0; }
.meter { position: relative; height: 10px; border-radius: 5px; background: var(--sunken); overflow: visible; }
.meter i { display: block; height: 100%; border-radius: 5px; background: var(--accent); }
.meter span { position: absolute; top: -4px; width: 2px; height: 18px; background: var(--ink); }
.versus { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; margin-top: 6px; }
.side { border-radius: 14px; padding: 12px 14px; display: grid; gap: 6px; align-content: start; font-size: 15px; line-height: 1.45; }
.side.plain { background: var(--sunken); color: var(--muted); }
.side.ours { background: var(--accent-soft); border: 1.5px solid var(--accent); }
.side.ours small { color: var(--accent); font-weight: 600; }
.count { margin-top: auto; color: var(--muted); }
.count b { font: 750 32px var(--display); color: var(--ink); margin-right: 6px; }
@media (max-width: 900px) { .stage { grid-template-columns: minmax(0, 1fr); padding: 20px 16px; } .scores { grid-template-columns: minmax(0, 1fr); } .live { border-left: 0; padding-left: 0; } .stage header { flex-direction: column; align-items: flex-start; } .rule { grid-template-columns: 130px minmax(0, 1fr); } }
`
