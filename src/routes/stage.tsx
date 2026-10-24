// The projector view, read left to right at 1920×1080: the measured result, then the live room.
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

type Summary = { fullyRight: number; nextAction: number; fields: number; nextActionByRule: Record<string, number> }
type Board = { testSet: string; base: Summary | null; corrected: Summary | null; rules?: Summary | null }
type Adapter = { version: string; base: string; quality: number | null; target: number; state: string }
const BOARDS = scoreboard as unknown as Record<string, Board | undefined>
const ADAPTERS = mubit.adapters as unknown as Record<string, Adapter | undefined>

// Each house rule as she'd say it.
const RULE_SHORT: Record<StylistKey, Record<string, string>> = {
  braider: {
    '1': 'Boho vs curly ends', '3': 'Hair not included', '4': 'Budget is a ceiling', '5': 'Offers times, never books',
    '6': 'Smedium', '7': 'Groups and kids', '9': 'Day words', '11': 'Photo vs text',
  },
  colourist: {
    '12': 'Patch test first', '13': 'Toner included', '14': 'Lived-in blonde', '15': 'Box dye needs a consult',
    '16': 'Dark to blonde', '5': 'Offers times, never books', '9': 'Day words', '4': 'Budget is a ceiling',
  },
  nails: {
    '17': 'Soak-off from elsewhere', '18': 'Bitten nails: photo first', '19': 'Infection: refer', '20': 'Ballerina is coffin',
    '21': 'Infills within 3 weeks', '22': 'Pinterest art: photo first', '5': 'Offers times, never books', '9': 'Day words',
  },
}

const SPOKEN: Record<string, string> = {
  butt: 'bum length', xl: 'extra long', cat_eye: 'cat eye', mid_back: 'mid-back', bra_strap: 'bra strap', box_braids: 'box braids', french_curls: 'French curls',
  offer_slots: 'offer times', acrylic_full_set: 'acrylic set', gel_extensions: 'gel extensions', biab: 'BIAB', lived_in_blonde: 'lived-in blonde',
}
const say = (v: unknown) => {
  const s = Array.isArray(v) ? v.join(', ') : String(v ?? '')
  return SPOKEN[s] ?? s.replaceAll('_', ' ')
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
  const lastFix = [...messages].reverse().find((m) => m.corrected && m.changed.length)
  const fixes = messages.filter((m) => m.corrected).length
  const name = STYLISTS[stylist].name
  const first = STYLISTS[stylist].owner
  const board = BOARDS[stylist]
  const url = `${origin.replace(/^https?:\/\//, '')}/s/${stylist}`

  return (
    <main className="stage">
      <nav className="top" aria-label="Stylist">
        <b className="mark">Brief Builder</b>
        <span className={connected ? 'dot on' : 'dot'} title={connected ? 'Live' : 'Connecting'} />
        <div className="switch">
          {(Object.keys(STYLISTS) as StylistKey[]).map((s) => (
            <button key={s} className={s === stylist ? 'btn primary' : 'btn'} onClick={() => setStylist(s)}>{STYLISTS[s].name}</button>
          ))}
        </div>
      </nav>

      <section className="proof">
        <h1>Every fix makes the next draft better.</h1>
        {board?.base && board.corrected ? <Proof board={board} /> : <p className="muted">Not scored yet.</p>}
        {board?.base && <RuleMoves stylist={stylist} board={board} />}
        <Model adapter={ADAPTERS[stylist]} first={first} fixes={fixes} />
      </section>

      <section className="room" aria-live="polite">
        {!token && <p className="muted">Open {first}’s inbox once on this laptop to connect.</p>}
        {latest ? (
          <>
            <Latest m={latest} stylist={stylist} token={token} first={first} />
            {lastFix && <FixLine m={lastFix} first={first} />}
            <VoiceLine messages={messages} first={first} />
            <div className="scan small">
              <Qr value={origin ? `${origin}/s/${stylist}` : ''} size={112} label={`QR code to message ${name}`} />
              <span><b>Scan to DM {first}</b><span className="mono muted">{url}</span></span>
            </div>
          </>
        ) : (
          <div className="scan big">
            <Qr value={origin ? `${origin}/s/${stylist}` : ''} size={360} label={`QR code to message ${name}`} />
            <b>Scan to DM {name}</b>
            <span className="mono muted">{url}</span>
          </div>
        )}
      </section>
      <style>{STAGE_CSS}</style>
    </main>
  )
}

// One big number, then how it got there.
function Proof({ board }: { board: Board }) {
  const base = board.base!
  const fixes = board.corrected!
  const final = board.rules ?? fixes
  return (
    <div className="numbers">
      <p className="big"><span className="num">{final.fullyRight}%</span><span>of replies fully right, on {board.testSet.split(',')[0].replace(' locked DMs', '')} DMs it never trained on</span></p>
      <div className="track" aria-hidden="true">
        <i className="now" style={{ width: `${final.fullyRight}%` }} />
        <i className="fixes" style={{ width: `${fixes.fullyRight}%` }} />
        <i className="plain" style={{ width: `${base.fullyRight}%` }} />
      </div>
      <dl className="steps">
        <div><dt>Plain model</dt><dd>{base.fullyRight}%</dd></div>
        <div><dt>+ her fixes</dt><dd>{fixes.fullyRight}%</dd></div>
        <div><dt>+ her rules in code</dt><dd className="accent">{final.fullyRight}%</dd></div>
      </dl>
      <dl className="pair">
        <div><dd>{base.nextAction}% → <b>{final.nextAction}%</b></dd><dt>right next step</dt></div>
        <div><dd>{base.fields}% → <b>{final.fields}%</b></dd><dt>fields right</dt></div>
      </dl>
    </div>
  )
}

// The four house rules that moved most.
function RuleMoves({ stylist, board }: { stylist: StylistKey; board: Board }) {
  const base = board.base!
  const final = board.rules ?? board.corrected!
  const rows = Object.entries(RULE_SHORT[stylist])
    .filter(([id]) => id in base.nextActionByRule && id in final.nextActionByRule)
    .map(([id, label]) => ({ label, a: base.nextActionByRule[id], b: final.nextActionByRule[id] }))
    .sort((x, y) => y.b - y.a - (x.b - x.a))
    .slice(0, 4)
  return (
    <ul className="moves">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="label">{r.label}</span>
          <span className="bar"><i style={{ width: `${r.b}%` }} /><s style={{ left: `${r.a}%` }} /></span>
          <span className="vals"><span className="muted">{r.a}% →</span> <b>{r.b}%</b></span>
        </li>
      ))}
    </ul>
  )
}

function Model({ adapter, first, fixes }: { adapter?: Adapter; first: string; fixes: number }) {
  if (!adapter) return null
  return (
    <div className="model">
      <span className="what"><b>{first}’s own model</b> {adapter.quality == null ? 'is training on Mubit' : `matches the big model ${adapter.quality}% of the time, aiming for ${adapter.target}%`}</span>
      <span className="meter"><i style={{ width: `${adapter.quality ?? 0}%` }} /><s style={{ left: `${adapter.target}%` }} /></span>
      <span className="muted">{fixes} {fixes === 1 ? 'fix' : 'fixes'} sent to Mubit this session</span>
    </div>
  )
}

function Latest({ m, stylist, token, first }: { m: RoomMessage; stylist: StylistKey; token: string; first: string }) {
  const brief = m.corrected ?? m.brief
  const facts = brief ? [brief.service, brief.look?.length, brief.look?.size ?? brief.look?.shade, brief.look?.shape, brief.look?.finish]
    .filter((v) => v && v !== 'unknown').map(say) : []
  return (
    <div className="latest rise" key={m.id + m.status}>
      <div className="dm">
        {m.images.length > 0 && token && <StagePhoto stylist={stylist} id={m.images[0]} token={token} />}
        <div>
          {m.text && <p className="text">“{m.text}”</p>}
          {m.status === 'drafting' && <p className="muted"><span className="dots"><i /><i /><i /></span> Drafting</p>}
          {brief && (
            <ul className="facts">
              {facts.map((f) => <li key={f}>{f}</li>)}
              <li className="next">{say(brief.next_action)}</li>
            </ul>
          )}
        </div>
      </div>
      {brief && m.baseline && (
        <div className="versus">
          <div className="side plain"><b>Plain model</b><p>{m.baseline.reply}</p></div>
          <div className="side ours"><b>{first}’s draft</b><p>{brief.reply_draft}</p></div>
        </div>
      )}
    </div>
  )
}

// How much of each draft she rewrote before sending, oldest to newest.
function VoiceLine({ messages, first }: { messages: RoomMessage[]; first: string }) {
  const shares = messages.filter((m) => m.editShare != null).map((m) => m.editShare!)
  if (shares.length < 2) return null
  return (
    <p className="voice">
      <span className="bars" aria-hidden="true">{shares.slice(-12).map((v, i) => <i key={i} style={{ height: `${Math.max(8, v * 100)}%` }} />)}</span>
      {first} rewrote {Math.round(shares[0] * 100)}% of her first draft, {Math.round(shares.at(-1)! * 100)}% of her latest
    </p>
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

// The latest fix, the way she made it.
function FixLine({ m, first }: { m: RoomMessage; first: string }) {
  const path = m.changed[0]
  const get = (o: any) => path.split('.').reduce((v, k) => v?.[k], o)
  const before = get(m.brief)
  const after = get(m.corrected)
  const value = (v: unknown) => (v === 'unknown' || v == null || (Array.isArray(v) && !v.length) ? 'not set' : say(v))
  return (
    <p className="fixline settle" key={m.id + path}>
      <b>{first} fixed {say(path.split('.').pop())}:</b> {value(before)} → {value(after)}{m.changed.length > 1 ? `, and ${m.changed.length - 1} more` : ''}
    </p>
  )
}

const STAGE_CSS = `
.stage { height: 100dvh; padding: 28px 56px 40px; display: grid; grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr); grid-template-rows: auto minmax(0, 1fr); gap: 24px 64px; overflow: hidden; }
.top { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; }
.mark { font-family: var(--display); font-size: 20px; letter-spacing: -0.01em; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--line); }
.dot.on { background: var(--good); }
.switch { margin-left: auto; display: flex; gap: 8px; }
.proof { display: flex; flex-direction: column; gap: 28px; min-height: 0; }
.proof h1 { font-family: var(--display); font-size: clamp(36px, 3.4vw, 60px); font-weight: 750; letter-spacing: -0.03em; line-height: 1; max-width: 16ch; }
.numbers { display: grid; gap: 14px; }
.big { margin: 0; display: flex; align-items: baseline; gap: 18px; font-size: 20px; color: var(--muted); }
.big .num { font-family: var(--display); font-weight: 750; font-size: clamp(96px, 9vw, 168px); line-height: 0.85; letter-spacing: -0.04em; color: var(--accent); font-variant-numeric: tabular-nums; }
.big span:last-child { max-width: 22ch; text-wrap: balance; }
.track { position: relative; height: 14px; border-radius: 14px; background: var(--sunken); overflow: hidden; }
.track i { position: absolute; inset: 0 auto 0 0; border-radius: 14px; }
.track .now { background: var(--accent); }
.track .fixes { background: color-mix(in oklch, var(--accent) 45%, var(--sunken)); }
.track .plain { background: var(--faint); }
dl { margin: 0; }
.steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.steps dt { font-size: 15px; color: var(--muted); }
.steps dd { margin: 2px 0 0; font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; }
.steps dd.accent, .pair b, .moves b { color: var(--accent); }
.pair { display: flex; gap: 40px; padding-top: 6px; border-top: 1px dashed var(--line); }
.pair div { display: flex; align-items: baseline; gap: 10px; }
.pair dd { margin: 0; font-size: 24px; font-weight: 600; font-variant-numeric: tabular-nums; }
.pair dt { color: var(--muted); }
.moves { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.moves li { display: grid; grid-template-columns: 230px minmax(0, 1fr) 120px; gap: 14px; align-items: center; font-size: 17px; }
.moves .bar { position: relative; height: 10px; border-radius: 10px; background: var(--sunken); }
.moves .bar i { position: absolute; inset: 0 auto 0 0; border-radius: 10px; background: var(--accent); }
.moves .bar s { position: absolute; top: -4px; bottom: -4px; width: 2px; background: var(--muted); }
.moves .vals { text-align: right; font-variant-numeric: tabular-nums; }
.model { margin-top: auto; display: grid; gap: 8px; font-size: 16px; }
.model .meter { position: relative; height: 8px; border-radius: 8px; background: var(--sunken); }
.model .meter i { position: absolute; inset: 0 auto 0 0; border-radius: 8px; background: var(--accent); }
.model .meter s { position: absolute; top: -4px; bottom: -4px; width: 2px; background: var(--ink); }
.room { display: flex; flex-direction: column; gap: 16px; min-height: 0; }
.latest { display: grid; gap: 16px; padding: 22px; border-radius: 24px; background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow); }
.latest .dm { display: flex; gap: 18px; align-items: flex-start; }
.stage-photo { width: 132px; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 14px; flex: none; }
.latest .text { margin: 0 0 12px; font-size: 30px; line-height: 1.25; font-weight: 600; }
.facts { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.facts li { padding: 6px 12px; border-radius: 99px; background: var(--sunken); font-size: 16px; font-weight: 600; }
.facts .next { background: var(--accent); color: var(--on-accent); }
.versus { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
.side { border-radius: 16px; padding: 14px 16px; display: grid; gap: 6px; align-content: start; }
.side b { font-size: 14px; }
.side p { margin: 0; font-size: 19px; line-height: 1.45; }
.side.plain { background: var(--sunken); color: var(--muted); }
.side.ours { background: var(--accent-soft); outline: 1.5px solid var(--accent); }
.side.ours b { color: var(--accent); }
.fixline { margin: 0; padding: 10px 14px; border-radius: 14px; background: var(--good-soft); font-size: 18px; }
.fixline b { color: var(--good); }
.voice { margin: 0; display: flex; align-items: center; gap: 12px; color: var(--muted); font-size: 16px; }
.voice .bars { display: flex; align-items: flex-end; gap: 4px; height: 32px; width: 120px; }
.voice .bars i { flex: 1; border-radius: 3px; background: var(--accent); }
.scan { display: flex; align-items: center; gap: 16px; }
.scan svg { border-radius: 12px; flex: none; }
.scan.small { margin-top: auto; align-self: flex-end; }
.scan.small > span { display: grid; gap: 2px; text-align: right; order: -1; }
.scan.big { flex: 1; flex-direction: column; justify-content: center; gap: 14px; font-size: 30px; }
.scan.big .mono { font-size: 18px; }
@media (max-width: 1100px) { .stage { height: auto; overflow: visible; grid-template-columns: minmax(0, 1fr); padding: 20px 16px; } .moves li { grid-template-columns: 150px minmax(0, 1fr) 90px; } }
`
