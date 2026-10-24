// The projector view, read left to right at 1920×1080: the measured result, then the live room.
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import scoreboard from '../shared/scoreboard.json'
import { imageUrlForStylist, stylistToken, useRoom } from '../client/room.ts'
import mubit from '../shared/mubit-status.json'
import type { RoomMessage } from '../shared/stylists.ts'
import { Qr } from '../client/qr.tsx'
import { Tip } from '../client/tip.tsx'
import braiderProfile from '../../data/braider/profile.json'
import colouristProfile from '../../data/colourist/profile.json'
import nailsProfile from '../../data/nails/profile.json'
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
// Her house rules in full, shown when a rule name is hovered or tapped.
const RULE_TEXT: Record<StylistKey, Record<string, string>> = Object.fromEntries(
  ([['braider', braiderProfile], ['colourist', colouristProfile], ['nails', nailsProfile]] as const).map(([k, p]) => [k, Object.fromEntries(p.house_rules.map((r) => [String(r.id), r.rule]))]),
) as Record<StylistKey, Record<string, string>>

// What each number means, in her terms.
const EXPLAIN = {
  fully: 'Every detail of the brief matches what she would have written: service, look, day, price details and what to do next.',
  next: 'It chose what she would do next: ask a question, quote a price, offer times, decline or refer.',
  details: 'Single details that match, counted one by one across every brief.',
  plain: 'gpt-6-luna on its own, with her prices and house rules in its instructions.',
  fixes: 'Her closest past fixes go into each draft as worked examples.',
  rules: 'Code decides the next step, what’s missing, dates and time windows, following her rules exactly.',
}

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
            <button key={s} className={s === stylist ? 'btn primary' : 'btn'} onClick={() => setStylist(s)} aria-pressed={s === stylist} aria-label={STYLISTS[s].name}>
              <span className="long">{STYLISTS[s].name}</span><span className="short">{STYLISTS[s].owner}</span>
            </button>
          ))}
        </div>
      </nav>

      <section className="join">
        <div className="qr"><Qr value={origin ? `${origin}/s/${stylist}` : ''} size={360} label={`QR code to message ${name}`} /></div>
        <b>Scan to DM {first}</b>
        <span className="mono muted">{url}</span>
        <span className="muted">Send a photo and a few words.</span>
      </section>

      <section className="room" aria-live="polite">
        {!token && <p className="muted">Open {first}’s inbox once on this laptop to connect.</p>}
        {latest ? (
          <>
            <Latest m={latest} photo={[...messages].reverse().find((x) => x.clientId === latest.clientId && x.images.length)?.images[0]} stylist={stylist} token={token} first={first} />
            {lastFix && <FixLine m={lastFix} first={first} />}
            <VoiceLine messages={messages} first={first} />
          </>
        ) : (
          <div className="waiting">The first DM appears here the moment it’s sent.</div>
        )}
        <Model adapter={ADAPTERS[stylist]} first={first} fixes={fixes} />
      </section>

      <section className="proof">
        <h1>Every fix makes the next draft better.</h1>
        {board?.base && board.corrected ? <Proof board={board} /> : <p className="muted">Not scored yet.</p>}
        {board?.base && <RuleMoves stylist={stylist} board={board} />}
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
  const count = board.testSet.split(' ')[0]
  return (
    <div className="numbers">
      <p className="big"><span className="num">{final.fullyRight}%</span><Tip tip={EXPLAIN.fully}>of replies fully right, on {count} DMs it never trained on</Tip></p>
      <div className="track" aria-hidden="true">
        <i className="now" style={{ width: `${final.fullyRight}%` }} />
        <i className="fixes" style={{ width: `${fixes.fullyRight}%` }} />
        <i className="plain" style={{ width: `${base.fullyRight}%` }} />
      </div>
      <dl className="steps">
        <div><dt><Tip tip={EXPLAIN.plain}>Plain model</Tip></dt><dd>{base.fullyRight}%</dd></div>
        <div><dt><Tip tip={EXPLAIN.fixes}>Her fixes</Tip></dt><dd>{fixes.fullyRight}%</dd></div>
        <div><dt><Tip tip={EXPLAIN.rules} align="end">Her rules in code</Tip></dt><dd className="accent">{final.fullyRight}%</dd></div>
      </dl>
      <dl className="pair">
        <div><dt><Tip tip={EXPLAIN.next}>Right next step</Tip></dt><dd>{base.nextAction}% → <b>{final.nextAction}%</b></dd></div>
        <div><dt><Tip tip={EXPLAIN.details} align="end">Details right</Tip></dt><dd>{base.fields}% → <b>{final.fields}%</b></dd></div>
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
    .map(([id, label]) => ({ label, rule: RULE_TEXT[stylist][id], a: base.nextActionByRule[id], b: final.nextActionByRule[id] }))
    .sort((x, y) => y.b - y.a - (x.b - x.a))
    .slice(0, 4)
  return (
    <div className="moves-wrap">
    <p className="moves-head"><Tip tip="On the test DMs where each rule applies: how often the next step was right, plain model first, then with her fixes and rules.">Right next step, by her rule</Tip></p>
    <ul className="moves" aria-label="Right next step, by house rule">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="label"><Tip tip={r.rule ?? r.label}>{r.label}</Tip></span>
          <span className="vals"><span className="muted">{r.a}% →</span> <b>{r.b}%</b></span>
          <span className="bar"><i style={{ width: `${r.b}%` }} /><s style={{ left: `${r.a}%` }} /></span>
        </li>
      ))}
    </ul>
    </div>
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

function Latest({ m, photo, stylist, token, first }: { m: RoomMessage; photo?: string; stylist: StylistKey; token: string; first: string }) {
  const brief = m.corrected ?? m.brief
  const facts = brief ? [brief.service, brief.look?.length, brief.look?.size ?? brief.look?.shade, brief.look?.shape, brief.look?.finish]
    .filter((v) => v && v !== 'unknown').map(say) : []
  return (
    <div className="latest rise" key={m.id + m.status}>
      <div className="dm">
        {photo && token && <StagePhoto stylist={stylist} id={photo} token={token} />}
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
.stage { height: 100dvh; padding: 24px 48px 36px; display: grid; grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr) minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); gap: 20px 48px; overflow: hidden; }
.top { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; }
.mark { font-family: var(--display); font-size: 20px; letter-spacing: -0.01em; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--line); }
.dot.on { background: var(--good); }
.switch { margin-left: auto; display: flex; gap: 8px; }
.switch .btn { white-space: nowrap; }
.switch .short { display: none; }
.join { display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: 10px; padding: 28px; border-radius: 28px; background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow); }
.join .qr { padding: 14px; border-radius: 20px; background: oklch(100% 0 0); line-height: 0; align-self: stretch; display: grid; place-items: center; }
.join .qr svg { width: 100%; height: auto; max-width: 460px; }
/* Dark on white in both themes: phones scan that most reliably. */
.join .qr svg > rect { fill: oklch(100% 0 0); }
.join .qr svg > g { fill: oklch(15% 0.01 330); }
.join b { font-family: var(--display); font-size: 34px; letter-spacing: -0.02em; margin-top: 8px; }
.join .mono { font-size: 17px; }
.room { display: flex; flex-direction: column; gap: 14px; min-height: 0; }
.waiting { flex: 1; max-height: 420px; display: grid; place-items: center; text-align: center; padding: 32px; border: 2px dashed var(--line); border-radius: 28px; color: var(--muted); font-size: 22px; }
.latest { display: grid; gap: 16px; padding: 22px; border-radius: 28px; background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow); }
.latest .dm { display: flex; gap: 18px; align-items: flex-start; }
.stage-photo { width: 128px; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 16px; flex: none; }
.latest .text { margin: 0 0 12px; font-size: 30px; line-height: 1.25; font-weight: 600; }
.facts { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.facts li { padding: 6px 12px; border-radius: 99px; background: var(--sunken); font-size: 16px; font-weight: 600; }
.facts .next { background: var(--accent); color: var(--on-accent); }
.versus { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
.side { border-radius: 18px; padding: 14px 16px; display: grid; gap: 6px; align-content: start; }
.side b { font-size: 14px; }
.side p { margin: 0; font-size: 18px; line-height: 1.45; }
.side.plain { background: var(--sunken); color: var(--muted); }
.side.ours { background: var(--accent-soft); outline: 1.5px solid var(--accent); }
.side.ours b { color: var(--accent); }
.fixline { margin: 0; padding: 12px 16px; border-radius: 16px; background: var(--good-soft); font-size: 18px; }
.fixline b { color: var(--good); }
.voice { margin: 0; display: flex; align-items: center; gap: 12px; color: var(--muted); font-size: 16px; }
.voice .bars { display: flex; align-items: flex-end; gap: 4px; height: 32px; width: 120px; }
.voice .bars i { flex: 1; border-radius: 3px; background: var(--accent); }
.proof { display: flex; flex-direction: column; gap: 22px; min-height: 0; }
.proof h1 { font-family: var(--display); font-size: clamp(30px, 2.4vw, 44px); font-weight: 750; letter-spacing: -0.025em; line-height: 1.02; }
.numbers { display: grid; gap: 14px; }
.big { margin: 0; display: grid; gap: 6px; font-size: 18px; color: var(--muted); }
.big .num { font-family: var(--display); font-weight: 750; font-size: clamp(88px, 7vw, 136px); line-height: 0.85; letter-spacing: -0.04em; color: var(--accent); font-variant-numeric: tabular-nums; }
.track { position: relative; height: 12px; border-radius: 12px; background: var(--sunken); overflow: hidden; }
.track i { position: absolute; inset: 0 auto 0 0; border-radius: 12px; }
.track .now { background: var(--accent); }
.track .fixes { background: color-mix(in oklch, var(--accent) 45%, var(--sunken)); }
.track .plain { background: var(--faint); }
dl { margin: 0; }
.steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
/* Numbers share one baseline even when a label wraps. */
.steps div { display: flex; flex-direction: column; justify-content: flex-end; }
.steps dt, .pair dt { font-size: 14px; color: var(--muted); }
.steps dd { margin: 2px 0 0; font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
.steps dd.accent, .pair b, .moves b { color: var(--accent); }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding-top: 12px; border-top: 1px dashed var(--line); }
.pair dd { margin: 2px 0 0; font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
.moves-wrap { display: grid; gap: 10px; }
.moves-head { margin: 0; font-size: 14px; color: var(--muted); }
.moves { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.moves li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 12px; align-items: center; font-size: 16px; }
.moves .bar { grid-column: 1 / -1; }
.moves .bar { position: relative; height: 8px; border-radius: 8px; background: var(--sunken); }
.moves .bar i { position: absolute; inset: 0 auto 0 0; border-radius: 8px; background: var(--accent); }
.moves .bar s { position: absolute; top: -4px; bottom: -4px; width: 2px; background: var(--muted); }
.moves .vals { text-align: right; font-variant-numeric: tabular-nums; }
.model { margin-top: auto; display: grid; gap: 8px; font-size: 15px; }
.model .meter { position: relative; height: 8px; border-radius: 8px; background: var(--sunken); }
.model .meter i { position: absolute; inset: 0 auto 0 0; border-radius: 8px; background: var(--accent); }
.model .meter s { position: absolute; top: -4px; bottom: -4px; width: 2px; background: var(--ink); }
@media (max-width: 700px) {
  .top { flex-wrap: wrap; }
  .switch { margin-left: 0; width: 100%; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; padding: 4px; border-radius: 99px; background: var(--sunken); }
  .switch .btn { border: 0; background: transparent; padding: 10px 0; }
  .switch .btn.primary { background: var(--accent); }
  .switch .long { display: none; }
  .switch .short { display: inline; }
}
@media (max-width: 1280px) { .stage { height: auto; overflow: visible; grid-template-columns: minmax(0, 1fr); padding: 20px 16px; } .join .qr svg { max-width: 280px; }  }
`
