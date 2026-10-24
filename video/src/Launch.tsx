// The submission film: problem, product, the fix, the learning, Mubit, three stylists, close.
import { AbsoluteFill, Html5Audio, Img, OffthreadVideo, Series, interpolate, staticFile, useCurrentFrame } from "remotion"
import { CANVAS_FRAMES, CLOSEST_FRAMES, ClosestYesScene, InboxCanvas } from "./Canvas.tsx"
import capture from "./capture.json"
import { adapters, checkedAt, inboxNoise, publicNailCard, scores, sideBySide, stylists } from "./data.ts"
import { Avatar, Bubble, Caption, Card, Count, Eyebrow, Phone, Rise, Scene, t, useRise } from "./ui.tsx"

export const SCENES = { noise: 210, title: 120, canvas: CANVAS_FRAMES, closest: CLOSEST_FRAMES, thread: 300, learn: 450, mubit: 360, stylists: 270, close: 210 }
export const REAL_FRAMES = 760
export const TOTAL = Object.values(SCENES).reduce((a, b) => a + b, 0)

export function Launch({ publicSafe = false, voice }: { publicSafe?: boolean; voice?: string }) {
  return (
    <AbsoluteFill style={{ background: t.bg }}>
      <Series>
        <Series.Sequence durationInFrames={SCENES.noise}><Noise /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.title}><Title /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.canvas}><InboxCanvas /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.closest}><ClosestYesScene /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.thread}><Thread /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.learn}><Learn /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.mubit}><Mubit /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.stylists}><Stylists publicSafe={publicSafe} /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.close}><Close /></Series.Sequence>
      </Series>
      {/* Narration: one mixed track from scripts/voiceover.mjs, so lines never click at their edges. */}
      {voice && <Html5Audio src={staticFile(`vo/${voice}/track.wav`)} />}
    </AbsoluteFill>
  )
}

// 1. The inbox, filling up.
function Noise() {
  return (
    <Scene frames={SCENES.noise}>
      <div style={{ position: "absolute", left: 220, top: 90 }}>
        <Phone title="Message requests" sub={`${inboxNoise.length} new`}>
          <div style={{ display: "flex", flexDirection: "column-reverse", gap: 4, height: "100%", justifyContent: "flex-start" }}>
            {inboxNoise.map((m, i) => <Request key={m.name} at={8 + i * 13} {...m} />)}
          </div>
        </Phone>
      </div>
      <div style={{ position: "absolute", left: 860, top: 330, width: 900 }}>
        <Caption at={40}>Every night, the same DMs.</Caption>
        <Rise at={120} style={{ marginTop: 34 }}>
          <p style={{ margin: 0, fontSize: 38, lineHeight: 1.3, color: t.muted, maxWidth: 820, textWrap: "balance" }}>
            Each one needs a back-and-forth before it’s a booking: the style, the price, the day.
          </p>
        </Rise>
      </div>
    </Scene>
  )
}

function Request({ at, name, text, photo }: { at: number; name: string; text: string; photo?: boolean }) {
  const p = useRise(at, 14)
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center", padding: "12px 6px", opacity: p, transform: `translateY(${(1 - p) * -18}px)` }}>
      <Avatar name={name} size={48} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 19 }}>{name}</div>
        <div style={{ fontSize: 18, color: t.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{photo ? "📷 " : ""}{text}</div>
      </div>
      <span style={{ width: 11, height: 11, borderRadius: 11, background: t.accent }} />
    </div>
  )
}

// 2. Name and promise.
function Title() {
  return (
    <Scene frames={SCENES.title}>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <Rise at={4}><div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 150, letterSpacing: "-0.035em", lineHeight: 1 }}>Brief Builder</div></Rise>
          <Rise at={22} style={{ marginTop: 30 }}><div style={{ fontSize: 44, color: t.muted }}>Turn “can u do these?” into a booking.</div></Rise>
        </div>
      </div>
    </Scene>
  )
}

// 5. The client asks a follow-up; the brief carries on.
function Thread() {
  return (
    <Scene frames={SCENES.thread}>
      <div style={{ position: "absolute", left: 1180, top: 90 }}>
        <Phone title="Amara Braids" sub="Peckham">
          <Bubble side="out" at={-30} photo="knotless.webp" />
          <Bubble side="out" at={-30}>{capture.hero.dm}</Bubble>
          <Bubble side="in" at={-30}>{capture.hero.fixedReply}</Bubble>
          <Bubble side="out" at={50}>{capture.followUp.dm}</Bubble>
          <Typing from={85} to={140} />
          <Bubble side="in" at={140}>{capture.followUp.reply}</Bubble>
        </Phone>
      </div>
      <div style={{ position: "absolute", left: 160, top: 380, width: 880 }}>
        <Caption at={20} sub="It still knows the photo, her fix and the price. Nothing changes unless the client asks.">The conversation keeps going.</Caption>
      </div>
    </Scene>
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

// 6. Same model, with and without her fixes, on DMs it never trained on.
function Learn() {
  const b = scores.braider
  const final = b.rules ?? b.corrected
  const bars = [
    { label: "Briefs fully right", a: b.base.fullyRight, m: b.corrected.fullyRight, z: final.fullyRight },
    { label: "Right next step", a: b.base.nextAction, m: b.corrected.nextAction, z: final.nextAction },
    { label: "Offers times instead of booking", a: b.base.nextActionByRule["5"], m: b.corrected.nextActionByRule["5"], z: final.nextActionByRule["5"] },
  ]
  const others = (["colourist", "nails"] as const).map((k) => {
    const s = scores[k]
    return `${k === "nails" ? "Nail tech" : "Colourist"} ${s.base.fullyRight}% → ${(s.rules ?? s.corrected).fullyRight}%`
  })
  return (
    <Scene frames={SCENES.learn}>
      <Rise at={0} style={{ position: "absolute", left: 120, top: 70 }}><Eyebrow>A DM it has never seen</Eyebrow></Rise>
      <Rise at={6} style={{ position: "absolute", left: 120, top: 116, width: 1680 }}>
        <div style={{ fontSize: 34, lineHeight: 1.35 }}>“{sideBySide.dm}”</div>
      </Rise>
      <div style={{ position: "absolute", left: 120, top: 250, width: 1680, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36 }}>
        <Rise at={40}><Card style={{ padding: 32 }}><Eyebrow>Plain model</Eyebrow><p style={{ fontSize: 26, lineHeight: 1.45, color: t.muted, margin: "16px 0 0" }}>{sideBySide.plain}</p></Card></Rise>
        <Rise at={80}><Card style={{ padding: 32, border: `1px solid ${t.accent}` }}><Eyebrow style={{ color: t.accent }}>With her fixes</Eyebrow><p style={{ fontSize: 26, lineHeight: 1.45, margin: "16px 0 0" }}>{sideBySide.fixed}</p></Card></Rise>
      </div>
      <div style={{ position: "absolute", left: 120, top: 630, width: 1680 }}>
        <Rise at={190}><Eyebrow>{b.testSet} · plain → her fixes → her rules in code</Eyebrow></Rise>
        {bars.map((bar, i) => <Bar key={bar.label} at={210 + i * 26} {...bar} />)}
        <Rise at={330} style={{ marginTop: 26, fontSize: 24, color: t.muted }}>
          {others.join(" · ")} fully right, each on its own locked set
        </Rise>
      </div>
    </Scene>
  )
}

function Bar({ at, label, a, m, z }: { at: number; label: string; a: number; m: number; z: number }) {
  const f = useCurrentFrame()
  const grow = interpolate(f, [at + 20, at + 45, at + 60, at + 85], [a, m, m, z], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  return (
    <Rise at={at} y={12}>
      <div style={{ display: "grid", gridTemplateColumns: "420px 1fr 360px", alignItems: "center", gap: 28, marginTop: 22 }}>
        <span style={{ fontSize: 26 }}>{label}</span>
        <span style={{ position: "relative", height: 22, borderRadius: 22, background: t.sunken }}>
          <i style={{ position: "absolute", inset: 0, width: `${grow}%`, borderRadius: 22, background: t.accent }} />
          <i style={{ position: "absolute", top: -6, bottom: -6, left: `${a}%`, width: 3, background: t.muted }} />
        </span>
        <span style={{ fontFamily: t.display, fontWeight: 700, fontSize: 40, textAlign: "right", whiteSpace: "nowrap" }}>
          <span style={{ color: t.faint, fontSize: 26 }}>{a}% → {m}% → </span><Count from={m} to={z} at={at + 60} frames={30} suffix="%" />
        </span>
      </div>
    </Rise>
  )
}

// 7. Where Mubit sits, and what her fixes become.
function Mubit() {
  const braider = adapters.braider
  const top = ["Client DM", "Brief Builder", "Mubit", "Any model"]
  const bottom = ["Her fix", "Kept example", "Her own model"]
  return (
    <Scene frames={SCENES.mubit}>
      <Rise at={0} style={{ position: "absolute", left: 120, top: 70 }}><Eyebrow>Every call goes through Mubit</Eyebrow></Rise>
      <Flow at={12} y={190} nodes={top} accentIndex={2} />
      <Flow at={90} y={430} nodes={bottom} accentIndex={2} accent />
      {braider && (
        <Rise at={170} style={{ position: "absolute", left: 120, top: 640, width: 1100 }}>
          <div style={{ fontSize: 26, color: t.muted }}><b style={{ color: t.accent }}>In progress.</b> Amara’s own model, {braider.version} on {braider.base}, trained on {braider.kept} of her kept examples</div>
          <div style={{ position: "relative", height: 22, borderRadius: 22, background: t.sunken, marginTop: 18 }}>
            <i style={{ position: "absolute", inset: 0, width: `${braider.quality ?? 0}%`, borderRadius: 22, background: t.accent }} />
            <i style={{ position: "absolute", top: -8, bottom: -8, left: `${braider.target}%`, width: 3, background: t.ink }} />
          </div>
          <div style={{ fontSize: 22, color: t.faint, marginTop: 14 }}>Matches the big model on {braider.quality}% of test cases, aiming for {braider.target}%. {braider.state}. Checked {checkedAt}.{braider.next ? ` ${braider.next}` : ""}</div>
        </Rise>
      )}
      <div style={{ position: "absolute", left: 120, top: 860, width: 1680 }}>
        <Caption at={230}>Every fix improves the next draft today, and trains her own model over time.</Caption>
      </div>
    </Scene>
  )
}

function Flow({ at, y, nodes, accentIndex, accent }: { at: number; y: number; nodes: string[]; accentIndex: number; accent?: boolean }) {
  const f = useCurrentFrame()
  const w = 360
  const gap = (1680 - nodes.length * w) / Math.max(1, nodes.length - 1)
  return (
    <div style={{ position: "absolute", left: 120, top: y, width: 1680, height: 140 }}>
      {nodes.slice(0, -1).map((_, i) => {
        const x0 = i * (w + gap) + w
        const p = (((f - at - i * 14) / 45) % 1 + 1) % 1
        return (
          <Rise key={i} at={at + i * 14 + 8} style={{ position: "absolute", left: x0, top: 68, width: gap, height: 4, background: t.line }}>
            <i style={{ position: "absolute", top: -5, left: `${p * 100}%`, width: 14, height: 14, borderRadius: 14, background: accent ? t.accent : t.muted }} />
          </Rise>
        )
      })}
      {nodes.map((n, i) => (
        <Rise key={n} at={at + i * 14} style={{ position: "absolute", left: i * (w + gap), top: 0, width: w }}>
          <div style={{ height: 140, borderRadius: 26, display: "grid", placeItems: "center", textAlign: "center", padding: "0 20px", fontSize: 28, fontWeight: 600, background: i === accentIndex ? t.accentSoft : t.surface, border: `1px solid ${i === accentIndex ? t.accent : t.line}`, color: i === accentIndex ? t.accent : t.ink }}>{n}</div>
        </Rise>
      ))}
    </div>
  )
}

// 8. Not just braids.
function Stylists({ publicSafe }: { publicSafe: boolean }) {
  return (
    <Scene frames={SCENES.stylists}>
      <div style={{ position: "absolute", left: 120, top: 70 }}><Caption at={0}>Her rules. Her prices. Her voice.</Caption></div>
      <div style={{ position: "absolute", left: 120, top: 280, width: 1680, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 36 }}>
        {(publicSafe ? [...stylists.slice(0, 2), publicNailCard] : stylists).map((s, i) => (
          <Rise key={s.name} at={30 + i * 22}>
            <Card style={{ padding: 30, height: 600, display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <Avatar name={s.name} size={52} />
                <div><div style={{ fontWeight: 600, fontSize: 24 }}>{s.name}</div><div style={{ color: t.muted, fontSize: 19 }}>{s.area} · {s.craft}</div></div>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 12 }}>
                {s.photo && <Img src={staticFile(s.photo)} style={{ width: 170, height: 200, objectFit: "cover", borderRadius: 18 }} />}
                <div style={{ alignSelf: "flex-start", padding: "13px 18px", borderRadius: 22, background: t.sunken, fontSize: 21, lineHeight: 1.38 }}>{s.dm}</div>
                <Rise at={80 + i * 22} style={{ alignSelf: "flex-end", maxWidth: "92%" }}>
                  <div style={{ padding: "13px 18px", borderRadius: 22, background: t.accent, color: t.onAccent, fontSize: 21, lineHeight: 1.38 }}>{s.reply}</div>
                </Rise>
              </div>
            </Card>
          </Rise>
        ))}
      </div>
    </Scene>
  )
}

// Real footage of the live app, recorded from the stage during an end-to-end run, at double speed.
export function RealApp() {
  return (
    <Scene frames={REAL_FRAMES}>
      <div style={{ position: "absolute", left: 120, top: 70 }}><Caption at={0}>This is the real app, live.</Caption></div>
      <Rise at={10} style={{ position: "absolute", left: 240, top: 210, width: 1440, height: 810 }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 24, overflow: "hidden", boxShadow: "0 40px 120px oklch(0% 0 0 / 0.55)", border: `1px solid ${t.line}` }}>
          <OffthreadVideo src={staticFile("stage-live.mp4")} playbackRate={2} trimBefore={60} muted style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
        </div>
      </Rise>
    </Scene>
  )
}

// 9. Close.
export function Close() {
  // Signs off in three beats, in time with the narration: the DM, the outcome, the name.
  return (
    <Scene frames={SCENES.close}>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <Rise at={18}><div style={{ fontSize: 56, color: t.muted, fontStyle: "italic" }}>“can u do these?”</div></Rise>
          <Rise at={74}><div style={{ fontFamily: t.display, fontWeight: 750, fontSize: 190, letterSpacing: "-0.04em", lineHeight: 1, color: t.accent, marginTop: 18 }}>Booked.</div></Rise>
          <Rise at={108} style={{ marginTop: 56 }}><div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 48, letterSpacing: "-0.02em" }}>Brief Builder</div></Rise>
          <Rise at={126} style={{ marginTop: 12, fontSize: 24, color: t.faint }}>brief-builder.buy-ea2.workers.dev · every model call through Mubit</Rise>
        </div>
      </div>
    </Scene>
  )
}
