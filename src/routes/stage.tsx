// The projector view: the locked-test scoreboard (from real runs) and the live room.
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import scoreboard from '../shared/scoreboard.json'
import { stylistToken, useRoom } from '../client/room.ts'
import { STYLISTS, type StylistKey } from '../shared/stylists.ts'

export const Route = createFileRoute('/stage')({
  head: () => ({ meta: [{ title: 'Stage · Brief Builder' }] }),
  component: Stage,
})

type Summary = NonNullable<typeof scoreboard.base>
const RULE_SHORT: Record<string, string> = {
  '1': 'Boho vs curly ends', '3': 'Hair not included', '4': 'Budget is a ceiling', '5': 'Offer slots, never book',
  '6': 'Smedium', '7': 'Groups and kids', '9': 'Day words', '11': 'Photo vs text',
}

function Stage() {
  const [stylist, setStylist] = useState<StylistKey>('braider')
  const [token, setToken] = useState('')
  useEffect(() => {
    setToken(stylistToken.get())
  }, [])
  const { messages, connected } = useRoom(stylist, token ? { token } : null)
  const latest = messages.at(-1)
  const fixes = messages.filter((m) => m.corrected).length
  const base = scoreboard.base as Summary
  const fixed = scoreboard.corrected as Summary

  return (
    <main className="stage">
      <header>
        <div>
          <p className="eyebrow">Brief Builder · {scoreboard.testSet}</p>
          <h1>Every fix a stylist makes becomes their own model.</h1>
        </div>
        <div className="switch" role="group" aria-label="Stylist">
          {(Object.keys(STYLISTS) as StylistKey[]).map((s) => (
            <button key={s} className={s === stylist ? 'btn primary' : 'btn'} onClick={() => setStylist(s)}>{STYLISTS[s].name}</button>
          ))}
        </div>
      </header>

      <section className="scores">
        <Score label="Briefs fully right" a={base.fullyRight} b={fixed.fullyRight} />
        <Score label="Right next step" a={base.nextAction} b={fixed.nextAction} />
        <Score label="Fields right" a={base.fields} b={fixed.fields} />
      </section>

      <section className="rules">
        <h2>Right next step, by house rule</h2>
        <div className="legend"><span><i className="a" /> {base.label}</span><span><i className="b" /> {fixed.label}</span></div>
        {Object.entries(RULE_SHORT).map(([id, name]) => {
          const a = (base.nextActionByRule as Record<string, number>)[id] ?? 0
          const b = (fixed.nextActionByRule as Record<string, number>)[id] ?? 0
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
        <h2>Live <span className={connected ? 'dot on' : 'dot'} aria-label={connected ? 'connected' : 'connecting'} /></h2>
        {!token && <p className="muted">Open the inbox once on this laptop to connect the live view.</p>}
        {latest ? (
          <div className="latest rise" key={latest.id + latest.status}>
            <p className="dm">“{latest.text}”</p>
            {latest.status === 'drafting' && <p className="muted"><span className="dots"><i /><i /><i /></span> Drafting through Mubit…</p>}
            {latest.brief && (
              <p className="facts">
                {[latest.brief.service, latest.brief.look?.length, latest.brief.look?.size ?? latest.brief.look?.shade, latest.brief.look?.ends]
                  .filter((v) => v && v !== 'unknown').map((v) => String(v).replaceAll('_', ' ')).join(' · ')}
                <span> → {String(latest.brief.next_action).replace('_', ' ')}</span>
              </p>
            )}
            {latest.brief && <p className="muted">{(latest.ms! / 1000).toFixed(1)} s · {latest.correctionsUsed} past fixes used</p>}
          </div>
        ) : token && <p className="muted">Scan the QR code and send a DM.</p>}
        <p className="count"><b>{fixes}</b> fixes this session · each one recorded by Mubit for the adapter</p>
      </section>
      <style>{STAGE_CSS}</style>
    </main>
  )
}

function Score({ label, a, b }: { label: string; a: number; b: number }) {
  return (
    <div className="score">
      <p className="eyebrow">{label}</p>
      <p className="nums"><span className="from">{a}%</span><span className="arrow">→</span><span className="to">{b}%</span></p>
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
.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--line); display: inline-block; }
.dot.on { background: var(--good); }
.latest { border: 1.5px dashed var(--accent); border-radius: var(--radius); padding: 16px 18px; display: grid; gap: 6px; }
.latest .dm { font-size: 22px; margin: 0; }
.facts { margin: 0; font-weight: 600; font-size: 18px; }
.facts span { color: var(--accent); }
.count { margin-top: auto; color: var(--muted); }
.count b { font: 750 32px var(--display); color: var(--ink); margin-right: 6px; }
@media (max-width: 900px) { .stage { grid-template-columns: minmax(0, 1fr); padding: 20px 16px; } .scores { grid-template-columns: minmax(0, 1fr); } .live { border-left: 0; padding-left: 0; } .stage header { flex-direction: column; align-items: flex-start; } .rule { grid-template-columns: 130px minmax(0, 1fr); } }
`
