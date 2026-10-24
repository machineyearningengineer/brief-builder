// The story cut: 1080×1920, under a minute, for a phone held upright. The same beats as the
// launch film (the DMs, a photo becoming a priced reply, one fix, the result, the sign-off),
// each laid out for a tall screen, with the same narration.
import { AbsoluteFill, Html5Audio, Series, staticFile } from "remotion"
import { InboxCanvas } from "./Canvas.tsx"
import { Close } from "./Launch.tsx"
import { inboxNoise, scores } from "./data.ts"
import { Avatar, Count, Eyebrow, Phone, Rise, Scene, t } from "./ui.tsx"

export const STORY = { noise: 210, title: 120, canvas: 960, results: 315, close: 195 }
export const STORY_FRAMES = Object.values(STORY).reduce((a, b) => a + b, 0)

export function Vertical({ voice }: { voice?: string }) {
  return (
    <AbsoluteFill style={{ background: t.bg, color: t.ink, fontFamily: t.sans }}>
      <Series>
        <Series.Sequence durationInFrames={STORY.noise}><StoryNoise /></Series.Sequence>
        <Series.Sequence durationInFrames={STORY.title}><StoryTitle /></Series.Sequence>
        <Series.Sequence durationInFrames={STORY.canvas}><InboxCanvas vertical /></Series.Sequence>
        <Series.Sequence durationInFrames={STORY.results}><Results /></Series.Sequence>
        <Series.Sequence durationInFrames={STORY.close}><Close frames={STORY.close} /></Series.Sequence>
      </Series>
      {voice && <Html5Audio src={staticFile(`vo/${voice}/story.wav`)} />}
    </AbsoluteFill>
  )
}

export function StoryNoise() {
  return (
    <Scene frames={STORY.noise}>
      <div style={{ position: "absolute", left: 72, right: 72, top: 150 }}>
        <Rise at={30}><h2 style={{ margin: 0, fontFamily: t.display, fontWeight: 700, fontSize: 96, lineHeight: 1.02, letterSpacing: "-0.03em" }}>Every night, the same DMs.</h2></Rise>
      </div>
      <div style={{ position: "absolute", left: 540 - 235 * 1.5, top: 520, transform: "scale(1.5)", transformOrigin: "0 0" }}>
        <Phone title="Message requests" sub={`${inboxNoise.length} new`}>
          <div style={{ display: "flex", flexDirection: "column-reverse", gap: 4 }}>
            {inboxNoise.map((m, i) => (
              <Rise key={m.name} at={8 + i * 13} y={-18}>
                <div style={{ display: "flex", gap: 14, alignItems: "center", padding: "12px 6px" }}>
                  <Avatar name={m.name} size={48} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 19 }}>{m.name}</div>
                    <div style={{ fontSize: 18, color: t.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.photo ? "📷 " : ""}{m.text}</div>
                  </div>
                  <span style={{ width: 11, height: 11, borderRadius: 11, background: t.accent }} />
                </div>
              </Rise>
            ))}
          </div>
        </Phone>
      </div>
    </Scene>
  )
}

export function StoryTitle() {
  return (
    <Scene frames={STORY.title}>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", padding: 72 }}>
        <div>
          <Rise at={4}><div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 132, letterSpacing: "-0.035em", lineHeight: 1 }}>Brief Builder</div></Rise>
          <Rise at={22} style={{ marginTop: 34 }}><div style={{ fontSize: 50, lineHeight: 1.25, color: t.muted, textWrap: "balance" }}>Turn “can u do these?” into a booking.</div></Rise>
        </div>
      </div>
    </Scene>
  )
}

// The measured result, big enough to read on a phone: plain model, her fixes, her rules in code.
function Results() {
  const b = scores.braider
  const final = b.rules ?? b.corrected
  const steps = [
    { label: "Plain model", n: b.base.fullyRight, at: 30 },
    { label: "With her fixes", n: b.corrected.fullyRight, at: 70 },
    { label: "With her rules", n: final.fullyRight, at: 110, accent: true },
  ]
  return (
    <Scene frames={STORY.results}>
      <div style={{ position: "absolute", left: 72, right: 72, top: 230, display: "grid", gap: 40 }}>
        <Rise at={0}><Eyebrow style={{ fontSize: 30 }}>60 DMs it had never seen</Eyebrow></Rise>
        <Rise at={8}><h2 style={{ margin: 0, fontFamily: t.display, fontWeight: 700, fontSize: 88, lineHeight: 1.04, letterSpacing: "-0.03em" }}>Replies that are fully right</h2></Rise>
        <div style={{ display: "grid", gap: 34, marginTop: 30 }}>
          {steps.map((s) => (
            <Rise key={s.label} at={s.at}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 24 }}>
                <span style={{ fontSize: 44, color: s.accent ? t.ink : t.muted }}>{s.label}</span>
                <span style={{ fontFamily: t.display, fontWeight: 750, fontSize: s.accent ? 150 : 96, letterSpacing: "-0.03em", color: s.accent ? t.accent : t.muted, fontVariantNumeric: "tabular-nums" }}>
                  <Count from={0} to={s.n} at={s.at} frames={30} suffix="%" />
                </span>
              </div>
              <div style={{ height: 16, borderRadius: 16, background: t.sunken, marginTop: 10 }}><i style={{ display: "block", height: "100%", width: `${s.n}%`, borderRadius: 16, background: s.accent ? t.accent : t.faint }} /></div>
            </Rise>
          ))}
        </div>
        <Rise at={170}><div style={{ fontSize: 36, lineHeight: 1.35, color: t.muted, marginTop: 20 }}>Colourist {scores.colourist.base.fullyRight}% → {(scores.colourist.rules ?? scores.colourist.corrected).fullyRight}%. Nail tech {scores.nails.base.fullyRight}% → {(scores.nails.rules ?? scores.nails.corrected).fullyRight}%. Same model, same messages.</div></Rise>
      </div>
    </Scene>
  )
}
