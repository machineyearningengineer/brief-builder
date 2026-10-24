// The inbox as one continuous canvas: the camera glides from the DM to the sheet to the reply,
// pushes in for the fix, then pulls back as the fix travels: size, price, reply, next client.
// Every message and reply is real app output (capture.json).
import { Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion"
import capture from "./capture.json"
import { Card, Count, Eyebrow, Rise, Source, Typed, t, useRise } from "./ui.tsx"

export const CANVAS_FRAMES = 1290
export const CLOSEST_FRAMES = 360

const SPOKEN: Record<string, string> = { knotless: "Knotless", butt: "Bum length", medium: "Medium", smedium: "Smedium", small: "Small", large: "Large", waist: "Waist length" }
const say = (v: string) => SPOKEN[v] ?? v
const tag = (field: string) => capture.hero.tags.find((x) => x.field === field)!

// Camera keyframes: frame → world point at the centre of the screen, and zoom.
const CAM: [number, number, number, number][] = [
  [0, 235, 450, 1.12], [100, 235, 450, 1.12], [150, 880, 470, 1.16], [230, 880, 470, 1.16],
  [270, 1520, 300, 1.45], [340, 1520, 300, 1.45], [385, 880, 330, 2.0], [450, 880, 330, 2.0],
  [525, 875, 420, 0.95], [690, 875, 420, 0.95], [760, 1100, 960, 0.6], [800, 1100, 960, 0.6],
  [850, 880, 1380, 1.0], [940, 880, 1380, 1.0], [990, 2100, 1360, 1.3], [1100, 2100, 1360, 1.3], [1150, 1825, 1380, 0.98], [1290, 1825, 1380, 0.98],
]
// The same beats framed for a phone screen (1080×1920): one card at a time, closer in.
const CAM_V: [number, number, number, number][] = [
  [0, 235, 450, 1.75], [100, 235, 450, 1.75], [150, 880, 420, 1.55], [230, 880, 420, 1.55],
  [270, 1518, 300, 1.55], [340, 1518, 300, 1.55], [385, 880, 320, 1.6], [450, 880, 330, 1.6],
  [500, 1518, 300, 1.45], [560, 1518, 300, 1.45], [610, 1153, 420, 0.87], [700, 1153, 420, 0.87],
  [760, 1153, 900, 0.6], [800, 1153, 900, 0.6], [850, 1153, 1380, 0.87], [940, 1153, 1380, 0.87],
]
const ease = Easing.bezier(0.65, 0, 0.35, 1)
function camera(f: number, keys = CAM) {
  const frames = keys.map((k) => k[0])
  const at = (i: number) => interpolate(f, frames, keys.map((k) => k[i]), { easing: ease, extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  return { x: at(1), y: at(2), s: at(3) }
}

const ROW = 70
const SHEET = { x: 560, y: 60, w: 640 }
const rowY = (i: number) => SHEET.y + 96 + i * ROW
const TAP = 410

function Overlay({ from, to, children, vertical }: { from: number; to: number; children: React.ReactNode; vertical?: boolean }) {
  const f = useCurrentFrame()
  const o = interpolate(f, [from, from + 14, to - 12, to], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const place: React.CSSProperties = vertical ? { left: 64, right: 64, bottom: 190, textAlign: "center" } : { left: 96, bottom: 84 }
  return (
    <div style={{ position: "absolute", ...place, opacity: o, transform: `translateY(${(1 - o) * 18}px)` }}>
      <div style={{ display: "inline-block", padding: "18px 28px", borderRadius: 22, background: "oklch(13.5% 0.009 330 / 0.82)", backdropFilter: "blur(14px)", fontFamily: t.display, fontWeight: 700, fontSize: vertical ? 60 : 54, lineHeight: 1.12, letterSpacing: "-0.02em", textWrap: "balance" }}>{children}</div>
    </div>
  )
}

// vertical frames the same canvas for a phone screen, for stories.
export function InboxCanvas({ vertical = false }: { vertical?: boolean }) {
  const f = useCurrentFrame()
  const cam = camera(f, vertical ? CAM_V : CAM)
  const centre = vertical ? "540px, 900px" : "960px, 540px"
  return (
    <div style={{ position: "absolute", inset: 0, background: t.bg, color: t.ink, fontFamily: t.sans, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `translate(${centre}) scale(${cam.s}) translate(${-cam.x}px, ${-cam.y}px)` }}>
        <ClientPhone />
        <HeroSheet />
        <ReplyCard x={1290} y={60} label="Draft reply" first={capture.hero.firstReply} second={capture.hero.fixedReply} typeAt={282} redraftFrom={TAP + 70} redraftTo={TAP + 130} />
        <Ripple />
        <NextClient />
        <VoiceCard />
      </div>
      <Overlay vertical={vertical} from={8} to={140}>A photo and a few words.</Overlay>
      <Overlay vertical={vertical} from={150} to={262}>The sheet fills itself, from her price list.</Overlay>
      <Overlay vertical={vertical} from={270} to={372}>The reply drafts itself.</Overlay>
      <Overlay vertical={vertical} from={380} to={515}>The reader said {say(capture.hero.firstSize).toLowerCase()}. She can see it’s {say(capture.hero.fixedSize).toLowerCase()}.</Overlay>
      <Overlay vertical={vertical} from={525} to={700}>One tap. The price and the reply follow.</Overlay>
      <Overlay vertical={vertical} from={770} to={950}>The next client gets it right first time.</Overlay>
      <Overlay vertical={vertical} from={975} to={1105}>She rewrote one draft last week.</Overlay>
      <Overlay vertical={vertical} from={1150} to={1290}>Now every draft sounds like her.</Overlay>
    </div>
  )
}

function ClientPhone() {
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 470, height: 900, borderRadius: 58, padding: 12, background: "oklch(9% 0.005 330)", boxShadow: `0 0 0 2px ${t.line}, 0 40px 120px oklch(0% 0 0 / 0.55)` }}>
      <div style={{ height: "100%", borderRadius: 47, background: t.bg, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 20, gap: 10, position: "relative" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, padding: "50px 24px 16px", display: "flex", gap: 14, alignItems: "center", borderBottom: `1px solid ${t.line}` }}>
          <span style={{ width: 46, height: 46, borderRadius: 46, display: "grid", placeItems: "center", fontWeight: 600, color: t.onAccent, background: `linear-gradient(135deg, ${t.accent}, oklch(66% 0.12 20))` }}>B</span>
          <div><div style={{ fontWeight: 600, fontSize: 21 }}>bisi</div><div style={{ fontSize: 16, color: t.muted }}>Message request · now</div></div>
        </div>
        <Rise at={10}><Img src={staticFile("knotless.webp")} style={{ width: 280, height: 360, objectFit: "cover", borderRadius: 22 }} /></Rise>
        <Rise at={28}><div style={{ display: "inline-block", padding: "13px 18px", borderRadius: 24, background: t.sunken, fontSize: 22 }}>{capture.hero.dm}</div></Rise>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          {capture.hero.tags.map((x, i) => (
            <Rise key={x.field} at={60 + i * 10} y={10}>
              <span style={{ display: "inline-block", padding: "7px 13px", borderRadius: 99, fontSize: 16, background: t.accentSoft, color: t.accent, fontWeight: 600 }}>{say(x.tag)} · {x.conf}%</span>
            </Rise>
          ))}
        </div>
      </div>
    </div>
  )
}

function SheetRow({ i, k, v, src, at, glow = 0, srcTone }: { i: number; k: string; v: React.ReactNode; src: React.ReactNode; at: number; glow?: number; srcTone?: "accent" }) {
  return (
    <Rise at={at} y={12} style={{ position: "absolute", left: 32, right: 32, top: rowY(i) - SHEET.y, height: ROW }}>
      <div style={{ height: "100%", display: "grid", gridTemplateColumns: "150px 1fr auto", alignItems: "center", borderBottom: `1px dashed ${t.line}`, margin: "0 -14px", padding: "0 14px", borderRadius: 12, background: `oklch(29% 0.06 348 / ${glow * 0.7})` }}>
        <span style={{ color: t.muted, fontSize: 20 }}>{k}</span>
        <span style={{ fontSize: 24, fontWeight: 600 }}>{v}</span>
        <Source tone={srcTone}>{src}</Source>
      </div>
    </Rise>
  )
}

function HeroSheet() {
  const f = useCurrentFrame()
  const fixed = f >= TAP
  const glow = interpolate(f, [TAP, TAP + 8, TAP + 90], [0, 1, 0.3], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const options = ["Small", "Smedium", "Medium", "Large"]
  const seg = useRise(392, 14)
  const finger = interpolate(f, [392, TAP - 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) })
  const pulse = interpolate(f, [TAP, TAP + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const target = options.indexOf(say(capture.hero.fixedSize))
  const start = options.indexOf(say(capture.hero.firstSize))
  return (
    <Card style={{ position: "absolute", left: SHEET.x, top: SHEET.y, width: SHEET.w, height: 640, opacity: useRise(112, 18) }}>
      <Rise at={120} style={{ position: "absolute", left: 32, top: 30 }}><Eyebrow>Service sheet</Eyebrow></Rise>
      <SheetRow i={0} at={130} k="Service" v={say(tag("service").tag)} src={`From photo · ${tag("service").conf}%`} />
      <SheetRow i={1} at={148} k="Length" v={say(tag("length").tag)} src={`From photo · ${tag("length").conf}%`} />
      <SheetRow i={2} at={166} k="Size" v={fixed ? say(capture.hero.fixedSize) : say(capture.hero.firstSize)} src={fixed ? `Your fix · was ${capture.hero.firstSize}` : `From photo · ${tag("size").conf}%`} glow={glow} srcTone={fixed ? "accent" : undefined} />
      <SheetRow i={3} at={184} k="Hair" v="Not included" src="House rule 3" />
      <SheetRow i={4} at={202} k="Day" v="Saturday" src="“saturday”" />
      <Rise at={220} y={12} style={{ position: "absolute", left: 32, right: 32, top: rowY(5) - SHEET.y + 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ color: t.muted, fontSize: 20 }}>Price</span>
          <span style={{ fontFamily: t.display, fontWeight: 700, fontSize: 68, letterSpacing: "-0.02em" }}><Count from={200} to={220} at={TAP + 34} frames={26} prefix="£" /></span>
          <Source>Her price list</Source>
        </div>
      </Rise>
      {/* The one tap: a segmented control slides over the size row. */}
      <div style={{ position: "absolute", left: 182, right: 24, top: rowY(2) - SHEET.y + 6, height: ROW - 12, opacity: seg * interpolate(f, [TAP + 30, TAP + 50], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, padding: 4, borderRadius: 16, background: t.sunken }}>
        {options.map((o, i) => (
          <span key={o} style={{ display: "grid", placeItems: "center", borderRadius: 12, fontSize: 17, fontWeight: 600, background: i === (fixed ? target : start) ? t.accent : "transparent", color: i === (fixed ? target : start) ? t.onAccent : t.muted }}>{o}</span>
        ))}
        <span style={{ position: "absolute", left: interpolate(finger, [0, 1], [330, 4 + target * 104 + 30]), top: interpolate(finger, [0, 1], [80, 8]), width: 40, height: 40, borderRadius: 40, background: "oklch(100% 0 0 / 0.88)", boxShadow: `0 0 0 ${pulse * 24}px oklch(100% 0 0 / ${0.35 * (1 - pulse)})`, opacity: f > TAP + 26 ? 0 : 1 }} />
      </div>
    </Card>
  )
}

function ReplyCard({ x, y, label, first, second, typeAt, redraftFrom, redraftTo, mark }: { x: number; y: number; label: string; first: string; second?: string; typeAt: number; redraftFrom?: number; redraftTo?: number; mark?: number }) {
  const f = useCurrentFrame()
  const busy = redraftFrom != null && f >= redraftFrom && f < redraftTo!
  const showSecond = second && redraftTo != null && f >= redraftTo
  const text = showSecond ? second! : first
  const at = showSecond ? redraftTo! : typeAt
  return (
    <Card style={{ position: "absolute", left: x, top: y, width: 460, padding: "28px 30px", minHeight: 360, opacity: interpolate(f, [typeAt - 16, typeAt - 2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
      <Eyebrow style={busy ? { color: t.accent } : undefined}>{busy ? "Re-drafting with her fix" : label}</Eyebrow>
      <div style={{ marginTop: 16, fontSize: 24, lineHeight: 1.45, opacity: busy ? 0.3 : 1 }}>
        {f >= at ? (mark && f >= mark ? <Voiced text={text} /> : <Typed text={text} at={at} />) : null}
      </div>
    </Card>
  )
}

// Her phrases, picked out once the voice beat starts.
function Voiced({ text }: { text: string }) {
  const parts = text.split(/(Hiya lovely|Hiya hun|💕|hun|Amara x)/g)
  return <span>{parts.map((p, i) => (/^(Hiya lovely|Hiya hun|💕|hun|Amara x)$/.test(p) ? <mark key={i} style={{ background: t.mark, color: t.ink, borderRadius: 6, padding: "0 4px" }}>{p}</mark> : <span key={i}>{p}</span>))}</span>
}

function Ripple() {
  const f = useCurrentFrame()
  const draw = (from: number, to: number) => interpolate(f, [from, to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) })
  // One clean route, no crossings: a rounded bracket from the size row down to the price, and one
  // straight line from the size row into the reply card that the bracket curves off. Dots mark where it lands.
  const edge = SHEET.x + SHEET.w
  const rail = edge + 34
  const r = 14
  const sizeY = rowY(2) + ROW / 2
  const priceY = rowY(5) + 52
  const segs = [
    { d: `M ${edge} ${sizeY} H ${rail - r} Q ${rail} ${sizeY} ${rail} ${sizeY + r} V ${priceY - r} Q ${rail} ${priceY} ${rail - r} ${priceY} H ${edge}`, p: draw(TAP + 8, TAP + 40) },
    { d: `M ${edge} ${sizeY} H 1290`, p: draw(TAP + 30, TAP + 62) },
    { d: `M ${SHEET.x + SHEET.w / 2} ${SHEET.y + 640} V 1170`, p: draw(745, 800) },
  ]
  const dots = [
    { x: edge, y: priceY, at: TAP + 40 },
    { x: 1290, y: sizeY, at: TAP + 62 },
    { x: SHEET.x + SHEET.w / 2, y: 1170, at: 800 },
  ]
  return (
    <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible", filter: `drop-shadow(0 0 8px ${t.accent})` }} width={2400} height={1800}>
      {segs.map((s, i) => (
        <path key={i} d={s.d} pathLength={1} fill="none" stroke={t.accent} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 1" strokeDashoffset={1 - s.p} opacity={s.p > 0 ? 1 : 0} />
      ))}
      {dots.map((d, i) => {
        const p = interpolate(f, [d.at, d.at + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(2)) })
        return <circle key={i} cx={d.x} cy={d.y} r={7 * p} fill={t.accent} />
      })}
    </svg>
  )
}

function NextClient() {
  const top = 1170
  return (
    <>
      <Rise at={770} style={{ position: "absolute", left: 0, top, width: 470 }}>
        <Card style={{ padding: 22, display: "grid", gap: 12 }}>
          <Eyebrow>Next client</Eyebrow>
          <Img src={staticFile("knotless.webp")} style={{ width: 200, height: 240, objectFit: "cover", borderRadius: 18 }} />
          <div style={{ alignSelf: "flex-start", padding: "12px 16px", borderRadius: 22, background: t.sunken, fontSize: 21 }}>{capture.nextClient.dm}</div>
        </Card>
      </Rise>
      <Rise at={790} style={{ position: "absolute", left: SHEET.x, top, width: SHEET.w }}>
        <Card style={{ padding: "26px 32px", display: "grid", gap: 14 }}>
          <Eyebrow>Service sheet</Eyebrow>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24 }}><span style={{ color: t.muted }}>Size</span><b>{say(capture.nextClient.size)}</b></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ color: t.muted, fontSize: 24 }}>Price</span><b style={{ fontFamily: t.display, fontSize: 56 }}>£220</b></div>
        </Card>
      </Rise>
      <Rise at={810} style={{ position: "absolute", left: 1290, top }}>
        <ReplyCard x={0} y={0} label="Draft reply" first={capture.nextClient.reply} typeAt={815} mark={1140} />
      </Rise>
    </>
  )
}

function VoiceCard() {
  const f = useCurrentFrame()
  const strike = interpolate(f, [1005, 1030], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  return (
    <Rise at={955} style={{ position: "absolute", left: 1840, top: 1170, width: 520 }}>
      <Card style={{ padding: "28px 30px", display: "grid", gap: 14 }}>
        <Eyebrow>A draft she rewrote last week</Eyebrow>
        <p style={{ margin: 0, fontSize: 21, lineHeight: 1.45, color: f > 1005 ? t.faint : t.muted, textDecoration: strike > 50 ? "line-through" : "none", transition: "none" }}>Hi! Medium knotless braids at mid-back length are £140, with hair not included.</p>
        <Rise at={1035}>
          <Eyebrow style={{ color: t.accent }}>What she sent</Eyebrow>
          <p style={{ margin: "8px 0 0", fontSize: 21, lineHeight: 1.45 }}><Voiced text="Hiya lovely 💕 medium knotless to mid-back is £140, hair not included hun. Amara x" /></p>
        </Rise>
      </Card>
    </Rise>
  )
}

// Over budget: the sheet offers the closest yes from her price list; one tap and the reply follows.
export function ClosestYesScene() {
  const f = useCurrentFrame()
  const tap = 150
  const fixed = f >= tap
  const o = interpolate(f, [0, 10, CLOSEST_FRAMES - 12, CLOSEST_FRAMES], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const press = interpolate(f, [tap - 6, tap, tap + 8], [1, 0.94, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const card = useRise(70)
  return (
    <div style={{ position: "absolute", inset: 0, background: t.bg, color: t.ink, fontFamily: t.sans, opacity: o }}>
      <Rise at={0} style={{ position: "absolute", left: 120, top: 80 }}><Eyebrow>Over budget</Eyebrow></Rise>
      <Rise at={6} style={{ position: "absolute", left: 120, top: 130, width: 520 }}>
        <div style={{ padding: "18px 22px", borderRadius: 26, background: t.sunken, fontSize: 30, lineHeight: 1.35 }}>{capture.budget.dm}</div>
      </Rise>
      <Card style={{ position: "absolute", left: 700, top: 120, width: 560, padding: "28px 34px" }}>
        <Eyebrow>Service sheet</Eyebrow>
        {[["Service", "Knotless"], ["Length", "Waist length"], ["Size", fixed ? "Large" : "Small"]].map(([k, v]) => (
          <div key={k} style={{ display: "grid", gridTemplateColumns: "150px 1fr", padding: "16px 0", borderBottom: `1px dashed ${t.line}`, fontSize: 24 }}>
            <span style={{ color: t.muted }}>{k}</span><b style={{ color: k === "Size" && fixed ? t.accent : t.ink }}>{v}</b>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 18 }}>
          <span style={{ color: t.muted, fontSize: 24 }}>Price</span>
          <span style={{ fontFamily: t.display, fontWeight: 700, fontSize: 64, color: fixed ? t.ink : t.bad }}>{fixed ? <Count from={210} to={150} at={tap + 4} frames={24} prefix="£" /> : "£210"}</span>
        </div>
        <div style={{ marginTop: 18, padding: "16px 18px", borderRadius: 18, border: `2px dashed ${t.accent}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, opacity: card * (fixed ? interpolate(f, [tap + 10, tap + 30], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1), transform: `translateY(${(1 - card) * 16}px)` }}>
          <span style={{ display: "grid", gap: 4 }}>
            <Eyebrow style={{ color: t.accent }}>Closest yes</Eyebrow>
            <span style={{ fontSize: 24 }}>Within £150: large instead of small</span>
            <b style={{ fontSize: 24 }}>£150</b>
          </span>
          <span style={{ padding: "14px 24px", borderRadius: 99, background: t.accent, color: t.onAccent, fontWeight: 600, fontSize: 21, transform: `scale(${press})`, whiteSpace: "nowrap" }}>Use this</span>
        </div>
      </Card>
      <div style={{ position: "absolute", left: 1320, top: 120 }}>
        <ReplyCard x={0} y={0} label="Draft reply" first={capture.budget.reply} second={capture.budget.fixedReply} typeAt={24} redraftFrom={tap + 6} redraftTo={tap + 60} />
      </div>
      <div style={{ position: "absolute", left: 120, top: 820, width: 1600 }}>
        <Rise at={210}>
          <h2 style={{ margin: 0, fontFamily: t.display, fontWeight: 700, fontSize: 76, letterSpacing: "-0.025em" }}>Every no comes with the closest yes.</h2>
          <p style={{ margin: "18px 0 0", fontSize: 30, color: t.muted }}>Worked out from her price list. One tap, and the reply follows.</p>
        </Rise>
      </div>
    </div>
  )
}
