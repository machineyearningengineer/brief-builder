// The whole launch film upright (1080×1920) for phones: every scene, same timing and narration,
// laid out for a tall screen. The story cut (Vertical.tsx) is the 60-second version of this.
import { AbsoluteFill, Html5Audio, Img, Series, staticFile, useCurrentFrame } from "remotion"
import { ClosestYesScene, InboxCanvas } from "./Canvas.tsx"
import capture from "./capture.json"
import { Close, SCENES } from "./Launch.tsx"
import { StoryNoise, StoryTitle } from "./Vertical.tsx"
import { adapters, checkedAt, publicNailCard, scores, sideBySide, stylists } from "./data.ts"
import { Avatar, Bubble, Card, Count, Eyebrow, Phone, Rise, Scene, t } from "./ui.tsx"

const L = 72
const W = 936

export function Mobile({ voice, publicSafe = true }: { voice?: string; publicSafe?: boolean }) {
  return (
    <AbsoluteFill style={{ background: t.bg, color: t.ink, fontFamily: t.sans }}>
      <Series>
        <Series.Sequence durationInFrames={SCENES.noise}><StoryNoise /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.title}><StoryTitle /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.canvas}><InboxCanvas vertical /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.closest}><ClosestYesScene vertical /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.thread}><Thread /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.learn}><Learn /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.mubit}><Mubit /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.stylists}><Stylists publicSafe={publicSafe} /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.close}><Close /></Series.Sequence>
      </Series>
      {voice && <Html5Audio src={staticFile(`vo/${voice}/track.wav`)} />}
    </AbsoluteFill>
  )
}

function Heading({ at, children, sub }: { at: number; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Rise at={at} style={{ position: "absolute", left: L, top: 130, width: W }}>
      <h2 style={{ margin: 0, fontFamily: t.display, fontWeight: 700, fontSize: 84, lineHeight: 1.02, letterSpacing: "-0.03em", textWrap: "balance" }}>{children}</h2>
      {sub && <p style={{ margin: "22px 0 0", fontSize: 36, lineHeight: 1.35, color: t.muted, textWrap: "pretty" }}>{sub}</p>}
    </Rise>
  )
}

function Typing({ from, to }: { from: number; to: number }) {
  const f = useCurrentFrame()
  if (f < from || f >= to) return null
  return (
    <div style={{ alignSelf: "flex-start", padding: "16px 20px", borderRadius: 24, background: t.sunken, display: "flex", gap: 7 }}>
      {[0, 1, 2].map((i) => <i key={i} style={{ width: 10, height: 10, borderRadius: 10, background: t.muted, opacity: 0.35 + 0.65 * (Math.sin((f - from) / 4 - i) > 0 ? 1 : 0) }} />)}
    </div>
  )
}

function Thread() {
  return (
    <Scene frames={SCENES.thread}>
      <Heading at={20} sub="It still knows the photo, her fix and the price. Nothing changes unless the client asks.">The conversation keeps going.</Heading>
      <div style={{ position: "absolute", left: 540 - 235 * 1.45, top: 560, transform: "scale(1.45)", transformOrigin: "0 0" }}>
        <Phone title="Amara Braids" sub="Peckham" style={{ height: 880 }}>
          <Bubble side="out" at={-30} photo="knotless.webp" />
          <Bubble side="out" at={-30}>{capture.hero.dm}</Bubble>
          <Bubble side="in" at={-30}>{capture.hero.fixedReply}</Bubble>
          <Bubble side="out" at={50}>{capture.followUp.dm}</Bubble>
          <Typing from={85} to={140} />
          <Bubble side="in" at={140}>{capture.followUp.reply}</Bubble>
        </Phone>
      </div>
    </Scene>
  )
}

function Learn() {
  const b = scores.braider
  const final = b.rules ?? b.corrected
  const bars = [
    { label: "Briefs fully right", a: b.base.fullyRight, m: b.corrected.fullyRight, z: final.fullyRight },
    { label: "Right next step", a: b.base.nextAction, m: b.corrected.nextAction, z: final.nextAction },
    { label: "Offers times, never books", a: b.base.nextActionByRule["5"], m: b.corrected.nextActionByRule["5"], z: final.nextActionByRule["5"] },
  ]
  const others = (["colourist", "nails"] as const).map((k) => `${k === "nails" ? "Nail tech" : "Colourist"} ${scores[k].base.fullyRight}% → ${(scores[k].rules ?? scores[k].corrected).fullyRight}%`)
  return (
    <Scene frames={SCENES.learn}>
      <Rise at={0} style={{ position: "absolute", left: L, top: 110 }}><Eyebrow style={{ fontSize: 26 }}>A DM it has never seen</Eyebrow></Rise>
      <Rise at={6} style={{ position: "absolute", left: L, top: 160, width: W }}><div style={{ fontSize: 38, lineHeight: 1.3 }}>“{sideBySide.dm}”</div></Rise>
      <div style={{ position: "absolute", left: L, top: 400, width: W, display: "grid", gap: 24 }}>
        <Rise at={40}><Card style={{ padding: 30 }}><Eyebrow>Plain model</Eyebrow><p style={{ fontSize: 30, lineHeight: 1.4, color: t.muted, margin: "12px 0 0" }}>{sideBySide.plain}</p></Card></Rise>
        <Rise at={80}><Card style={{ padding: 30, border: `1px solid ${t.accent}` }}><Eyebrow style={{ color: t.accent }}>With her fixes</Eyebrow><p style={{ fontSize: 30, lineHeight: 1.4, margin: "12px 0 0" }}>{sideBySide.fixed}</p></Card></Rise>
      </div>
      <div style={{ position: "absolute", left: L, top: 1170, width: W, display: "grid", gap: 34 }}>
        <Rise at={190}><Eyebrow style={{ fontSize: 24 }}>{b.testSet} · plain → her fixes → her rules</Eyebrow></Rise>
        {bars.map((bar, i) => <Bar key={bar.label} at={210 + i * 26} {...bar} />)}
        <Rise at={330} style={{ fontSize: 30, color: t.muted }}>{others.join(" · ")} fully right</Rise>
      </div>
    </Scene>
  )
}

function Bar({ at, label, a, m, z }: { at: number; label: string; a: number; m: number; z: number }) {
  const f = useCurrentFrame()
  const grow = a + (m - a) * Math.min(1, Math.max(0, (f - at - 20) / 25)) + (z - m) * Math.min(1, Math.max(0, (f - at - 60) / 25))
  return (
    <Rise at={at} y={12}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 34 }}>{label}</span>
        <span style={{ fontFamily: t.display, fontWeight: 700, fontSize: 56 }}><span style={{ color: t.faint, fontSize: 30 }}>{a}% → {m}% → </span><Count from={m} to={z} at={at + 60} frames={30} suffix="%" /></span>
      </div>
      <div style={{ position: "relative", height: 20, borderRadius: 20, background: t.sunken, marginTop: 10 }}>
        <i style={{ position: "absolute", inset: 0, width: `${grow}%`, borderRadius: 20, background: t.accent }} />
        <i style={{ position: "absolute", top: -6, bottom: -6, left: `${a}%`, width: 3, background: t.muted }} />
      </div>
    </Rise>
  )
}

// Where Mubit sits, as two short columns that read top to bottom.
function Mubit() {
  const braider = adapters.braider
  return (
    <Scene frames={SCENES.mubit}>
      <Rise at={0} style={{ position: "absolute", left: L, top: 110 }}><Eyebrow style={{ fontSize: 26 }}>Every call goes through Mubit</Eyebrow></Rise>
      <div style={{ position: "absolute", left: L, top: 180, width: W, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
        <Column at={12} nodes={["Client DM", "Brief Builder", "Mubit", "Any model"]} accentIndex={2} />
        <Column at={90} nodes={["Her fix", "Kept example", "Her own model"]} accentIndex={2} accent />
      </div>
      {braider && (
        <Rise at={170} style={{ position: "absolute", left: L, top: 1060, width: W }}>
          <div style={{ fontSize: 32, lineHeight: 1.35, color: t.muted }}><b style={{ color: t.accent }}>In progress.</b> Amara’s own model, {braider.version} on {braider.base}, trained on {braider.kept} of her kept examples</div>
          <div style={{ position: "relative", height: 22, borderRadius: 22, background: t.sunken, marginTop: 22 }}>
            <i style={{ position: "absolute", inset: 0, width: `${braider.quality ?? 0}%`, borderRadius: 22, background: t.accent }} />
            <i style={{ position: "absolute", top: -8, bottom: -8, left: `${braider.target}%`, width: 3, background: t.ink }} />
          </div>
          <div style={{ fontSize: 28, lineHeight: 1.35, color: t.faint, marginTop: 16 }}>Matches the big model on {braider.quality}% of test cases, aiming for {braider.target}%. Checked {checkedAt}.</div>
        </Rise>
      )}
      <Rise at={230} style={{ position: "absolute", left: L, top: 1500, width: W }}>
        <h2 style={{ margin: 0, fontFamily: t.display, fontWeight: 700, fontSize: 66, lineHeight: 1.06, letterSpacing: "-0.025em", textWrap: "balance" }}>Every fix improves the next draft today, and trains her own model over time.</h2>
      </Rise>
    </Scene>
  )
}

function Column({ at, nodes, accentIndex, accent }: { at: number; nodes: string[]; accentIndex: number; accent?: boolean }) {
  const f = useCurrentFrame()
  return (
    <div style={{ display: "grid", gap: 0 }}>
      {nodes.map((n, i) => (
        <div key={n}>
          {i > 0 && (
            <Rise at={at + i * 14 - 6} style={{ position: "relative", height: 70, width: 4, margin: "0 auto", background: t.line }}>
              <i style={{ position: "absolute", left: -5, top: `${((((f - at - i * 14) / 45) % 1) + 1) % 1 * 100}%`, width: 14, height: 14, borderRadius: 14, background: accent ? t.accent : t.muted }} />
            </Rise>
          )}
          <Rise at={at + i * 14}>
            <div style={{ height: 120, borderRadius: 24, display: "grid", placeItems: "center", textAlign: "center", padding: "0 16px", fontSize: 32, fontWeight: 600, background: i === accentIndex ? t.accentSoft : t.surface, border: `1px solid ${i === accentIndex ? t.accent : t.line}`, color: i === accentIndex ? t.accent : t.ink }}>{n}</div>
          </Rise>
        </div>
      ))}
    </div>
  )
}

function Stylists({ publicSafe }: { publicSafe: boolean }) {
  return (
    <Scene frames={SCENES.stylists}>
      <Heading at={0}>Her rules. Her prices. Her voice.</Heading>
      <div style={{ position: "absolute", left: L, top: 420, width: W, display: "grid", gap: 26 }}>
        {(publicSafe ? [...stylists.slice(0, 2), publicNailCard] : stylists).map((s, i) => (
          <Rise key={s.name} at={30 + i * 22}>
            <Card style={{ padding: 26, display: "grid", gridTemplateColumns: s.photo ? "150px 1fr" : "1fr", gap: 22 }}>
              {s.photo && <Img src={staticFile(s.photo)} style={{ width: 150, height: 190, objectFit: "cover", borderRadius: 18 }} />}
              <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <Avatar name={s.name} size={46} />
                  <div><div style={{ fontWeight: 600, fontSize: 28 }}>{s.name}</div><div style={{ color: t.muted, fontSize: 22 }}>{s.area}</div></div>
                </div>
                <div style={{ justifySelf: "start", padding: "11px 16px", borderRadius: 20, background: t.sunken, fontSize: 24, lineHeight: 1.35 }}>{s.dm}</div>
                <Rise at={80 + i * 22} style={{ justifySelf: "end", maxWidth: "94%" }}>
                  <div style={{ padding: "11px 16px", borderRadius: 20, background: t.accent, color: t.onAccent, fontSize: 24, lineHeight: 1.35 }}>{s.reply}</div>
                </Rise>
              </div>
            </Card>
          </Rise>
        ))}
      </div>
    </Scene>
  )
}
