// The submission film: problem, product, the fix, the learning, Mubit, three stylists, close.
import { AbsoluteFill, Img, Series, interpolate, staticFile, useCurrentFrame } from "remotion"
import { adapters, checkedAt, hero, inboxNoise, scores, sideBySide, stylists } from "./data.ts"
import { Avatar, Bubble, Caption, Card, Count, Eyebrow, Phone, Rise, Scene, Source, Typed, t, useRise } from "./ui.tsx"

export const SCENES = { noise: 240, title: 120, brief: 540, fix: 390, thread: 330, learn: 480, mubit: 390, stylists: 300, close: 210 }
export const TOTAL = Object.values(SCENES).reduce((a, b) => a + b, 0)

export function Launch() {
  return (
    <AbsoluteFill style={{ background: t.bg }}>
      <Series>
        <Series.Sequence durationInFrames={SCENES.noise}><Noise /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.title}><Title /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.brief}><BriefScene /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.fix}><FixScene /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.thread}><Thread /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.learn}><Learn /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.mubit}><Mubit /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.stylists}><Stylists /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.close}><Close /></Series.Sequence>
      </Series>
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
          <p style={{ margin: 0, fontSize: 38, lineHeight: 1.3, color: t.muted, maxWidth: 820 }}>
            A photo and three words. Before anything gets booked, she has to ask what they want, explain the price and find a time.
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

const SHEET_ROWS = [
  { k: "Service", v: "Knotless", src: `From photo · ${hero.tags[0].conf}%` },
  { k: "Length", v: "Bum length", src: `From photo · ${hero.tags[1].conf}%` },
  { k: "Size", v: "Small", src: `From photo · ${hero.tags[2].conf}%` },
  { k: "Hair", v: "Not included", src: "House rule 3" },
  { k: "Day", v: "Saturday", src: "“saturday”" },
]

// 3. One DM becomes a brief and a reply.
function BriefScene() {
  return (
    <Scene frames={SCENES.brief}>
      <Rise at={0} style={{ position: "absolute", left: 120, top: 70 }}><Eyebrow>The stylist’s inbox</Eyebrow></Rise>
      <div style={{ position: "absolute", left: 120, top: 120 }}>
        <Phone title="bisi" sub="Message request">
          <Bubble side="in" at={10} photo="knotless.webp" />
          <Bubble side="in" at={26}>{hero.dm}</Bubble>
          <PhotoTags at={70} />
        </Phone>
      </div>
      <Sheet at={130} price={240} />
      <Composer at={300} label="Draft reply" text={hero.firstReply} typeAt={318} />
      <div style={{ position: "absolute", left: 640, top: 900 }}>
        <Caption at={420}>Vague message in. Specific reply out.</Caption>
      </div>
    </Scene>
  )
}

function PhotoTags({ at }: { at: number }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
      {hero.tags.map((tag, i) => (
        <Rise key={tag.label} at={at + i * 12} y={10}>
          <span style={{ display: "inline-block", padding: "7px 13px", borderRadius: 99, fontSize: 16, background: t.accentSoft, color: t.accent, fontWeight: 600 }}>{tag.label} · {tag.conf}%</span>
        </Rise>
      ))}
    </div>
  )
}

function Row({ at, k, v, src, highlight = 0 }: { at: number; k: string; v: React.ReactNode; src: React.ReactNode; highlight?: number }) {
  return (
    <Rise at={at} y={14}>
      <div style={{ display: "grid", gridTemplateColumns: "170px 1fr auto", alignItems: "center", padding: "17px 0", borderBottom: `1px dashed ${t.line}`, background: `oklch(29% 0.06 348 / ${highlight * 0.6})`, margin: "0 -16px", paddingInline: 16, borderRadius: 12 }}>
        <span style={{ color: t.muted, fontSize: 21 }}>{k}</span>
        <span style={{ fontSize: 24, fontWeight: 600 }}>{v}</span>
        {src}
      </div>
    </Rise>
  )
}

function Sheet({ at, price, fix }: { at: number; price: number; fix?: { at: number } }) {
  const f = useCurrentFrame()
  const fixed = fix ? f >= fix.at : false
  const glow = fix ? interpolate(f, [fix.at, fix.at + 8, fix.at + 50], [0, 1, 0.35], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0
  return (
    <Card style={{ position: "absolute", left: 660, top: 120, width: 640, padding: "30px 40px 26px" }}>
      <Rise at={at - 10}><Eyebrow>Service sheet</Eyebrow></Rise>
      {SHEET_ROWS.map((r, i) => {
        if (fix && r.k === "Size") {
          return <Row key={r.k} at={at + i * 20} k="Size" v={fixed ? "Smedium" : "Small"} src={fixed ? <Source tone="accent">Your fix · was small</Source> : <Source>{r.src}</Source>} highlight={glow} />
        }
        return <Row key={r.k} at={at + i * 20} k={r.k} v={r.v} src={<Source>{r.src}</Source>} />
      })}
      <Rise at={at + SHEET_ROWS.length * 20 + 10} y={14}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", paddingTop: 22 }}>
          <span style={{ color: t.muted, fontSize: 21 }}>Price</span>
          <span style={{ fontFamily: t.display, fontWeight: 700, fontSize: 64, letterSpacing: "-0.02em" }}>
            {fix ? <Count from={240} to={220} at={fix.at + 6} frames={24} prefix="£" /> : `£${price}`}
          </span>
          <Source>Her price list</Source>
        </div>
      </Rise>
    </Card>
  )
}

function Composer({ at, label, text, typeAt, busy }: { at: number; label: string; text: string; typeAt: number; busy?: { from: number; to: number } }) {
  const f = useCurrentFrame()
  const working = busy && f >= busy.from && f < busy.to
  return (
    <Rise at={at} style={{ position: "absolute", left: 1340, top: 120, width: 460 }}>
      <Card style={{ padding: "28px 30px" }}>
        <Eyebrow>{working ? "Re-drafting with your fix" : label}</Eyebrow>
        <div style={{ marginTop: 16, fontSize: 25, lineHeight: 1.45, minHeight: 290, opacity: working ? 0.35 : 1 }}>
          {f >= typeAt ? <Typed text={text} at={typeAt} /> : null}
        </div>
        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
          <span style={{ padding: "12px 26px", borderRadius: 99, background: t.accent, color: t.onAccent, fontWeight: 600, fontSize: 20 }}>Send</span>
        </div>
      </Card>
    </Rise>
  )
}

// 4. One tap fixes the photo reader, the price and the reply.
function FixScene() {
  const f = useCurrentFrame()
  const tap = 58
  const options = ["Small", "Smedium", "Medium", "Large"]
  const chosen = f >= tap ? 1 : 0
  const finger = interpolate(f, [18, tap - 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const pulse = interpolate(f, [tap, tap + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const undo = interpolate(f, [tap + 10, tap + 160], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  return (
    <Scene frames={SCENES.fix}>
      <Rise at={0} style={{ position: "absolute", left: 120, top: 70 }}><Eyebrow>She can see they’re smedium</Eyebrow></Rise>
      <div style={{ position: "absolute", left: 120, top: 120, width: 470 }}>
        <Card style={{ padding: 26 }}>
          <Img src={staticFile("knotless.webp")} style={{ width: "100%", height: 420, objectFit: "cover", borderRadius: 20 }} />
          <div style={{ marginTop: 18, fontSize: 22, color: t.muted }}>Photo reader said <b style={{ color: t.ink }}>small · {hero.tags[2].conf}%</b></div>
        </Card>
        <Rise at={8} style={{ marginTop: 24 }}>
          <Card style={{ padding: 10, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, position: "relative" }}>
            {options.map((o, i) => (
              <span key={o} style={{ textAlign: "center", padding: "16px 0", borderRadius: 18, fontSize: 20, fontWeight: 600, background: i === chosen ? t.accent : "transparent", color: i === chosen ? t.onAccent : t.muted }}>{o}</span>
            ))}
            <span style={{ position: "absolute", left: interpolate(finger, [0, 1], [380, 168]), top: interpolate(finger, [0, 1], [110, 30]), width: 46, height: 46, borderRadius: 46, background: "oklch(100% 0 0 / 0.85)", boxShadow: `0 0 0 ${pulse * 26}px oklch(100% 0 0 / ${0.35 * (1 - pulse)})`, opacity: f < 16 || f > tap + 40 ? 0 : 1 }} />
          </Card>
        </Rise>
      </div>
      <Sheet at={-200} price={240} fix={{ at: tap }} />
      <Composer at={-200} label="Draft reply" text={hero.fixedReply} typeAt={tap + 70} busy={{ from: tap + 4, to: tap + 70 }} />
      <Rise at={tap + 6} style={{ position: "absolute", left: 660, top: 760 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px 22px", borderRadius: 18, background: t.sunken, width: 640, opacity: undo > 0 ? 1 : 0.5 }}>
          <span style={{ flex: 1, fontSize: 21 }}>Size changed to smedium</span>
          <span style={{ fontWeight: 600, color: t.accent, fontSize: 21 }}>Undo</span>
          <span style={{ width: 120, height: 6, borderRadius: 6, background: t.line, overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: `${undo * 100}%`, background: t.accent }} /></span>
        </div>
      </Rise>
      <div style={{ position: "absolute", left: 660, top: 880, width: 1150 }}>
        <Caption at={250}>One tap. Every fix is kept.</Caption>
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
          <Bubble side="out" at={-30}>{hero.dm}</Bubble>
          <Bubble side="in" at={-30}>{hero.fixedReply}</Bubble>
          <Bubble side="out" at={40}>{hero.followUp}</Bubble>
          <Typing from={70} to={120} />
          <Bubble side="in" at={120}>{hero.followUpReply}</Bubble>
        </Phone>
      </div>
      <div style={{ position: "absolute", left: 160, top: 380, width: 880 }}>
        <Caption at={20} sub="The size she fixed, the price and the photo carry through every follow-up. A change needs the client to say so.">The conversation keeps going.</Caption>
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
  const bars = [
    { label: "Briefs fully right", a: b.base.fullyRight, z: b.corrected.fullyRight },
    { label: "Right next step", a: b.base.nextAction, z: b.corrected.nextAction },
    { label: "Offers times instead of booking", a: b.base.nextActionByRule["5"], z: b.corrected.nextActionByRule["5"] },
  ]
  return (
    <Scene frames={SCENES.learn}>
      <Rise at={0} style={{ position: "absolute", left: 120, top: 70 }}><Eyebrow>A DM it has never seen</Eyebrow></Rise>
      <Rise at={6} style={{ position: "absolute", left: 120, top: 116, width: 1680 }}>
        <div style={{ fontSize: 34, lineHeight: 1.35 }}>“{sideBySide.dm}”</div>
      </Rise>
      <div style={{ position: "absolute", left: 120, top: 250, width: 1680, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36 }}>
        <Rise at={40}><Card style={{ padding: 32 }}><Eyebrow>Without her fixes</Eyebrow><p style={{ fontSize: 26, lineHeight: 1.45, color: t.muted, margin: "16px 0 0" }}>{sideBySide.plain}</p></Card></Rise>
        <Rise at={80}><Card style={{ padding: 32, border: `1px solid ${t.accent}` }}><Eyebrow style={{ color: t.accent }}>With her fixes</Eyebrow><p style={{ fontSize: 26, lineHeight: 1.45, margin: "16px 0 0" }}>{sideBySide.fixed}</p></Card></Rise>
      </div>
      <div style={{ position: "absolute", left: 120, top: 640, width: 1680 }}>
        <Rise at={190}><Eyebrow>{b.testSet}</Eyebrow></Rise>
        {bars.map((bar, i) => <Bar key={bar.label} at={210 + i * 26} {...bar} />)}
        <Rise at={330} style={{ marginTop: 26, fontSize: 24, color: t.muted }}>
          Colourist {scores.colourist.base.fullyRight}% → {scores.colourist.corrected.fullyRight}% · Nail tech {scores.nails.base.fullyRight}% → {scores.nails.corrected.fullyRight}% fully right, each on its own locked set
        </Rise>
      </div>
    </Scene>
  )
}

function Bar({ at, label, a, z }: { at: number; label: string; a: number; z: number }) {
  const f = useCurrentFrame()
  const grow = interpolate(f, [at + 20, at + 60], [a, z], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  return (
    <Rise at={at} y={12}>
      <div style={{ display: "grid", gridTemplateColumns: "420px 1fr 280px", alignItems: "center", gap: 28, marginTop: 22 }}>
        <span style={{ fontSize: 26 }}>{label}</span>
        <span style={{ position: "relative", height: 22, borderRadius: 22, background: t.sunken }}>
          <i style={{ position: "absolute", inset: 0, width: `${grow}%`, borderRadius: 22, background: t.accent }} />
          <i style={{ position: "absolute", top: -6, bottom: -6, left: `${a}%`, width: 3, background: t.muted }} />
        </span>
        <span style={{ fontFamily: t.display, fontWeight: 700, fontSize: 40, textAlign: "right" }}>
          <span style={{ color: t.faint, fontSize: 28 }}>{a}% → </span><Count from={a} to={z} at={at + 20} frames={40} suffix="%" />
        </span>
      </div>
    </Rise>
  )
}

// 7. Where Mubit sits, and what her fixes become.
function Mubit() {
  const braider = adapters.braider
  const top = ["Client DM", "Brief Builder", "Mubit", "gpt-6-luna"]
  const bottom = ["Her fix", "Kept example", "Her own model"]
  return (
    <Scene frames={SCENES.mubit}>
      <Rise at={0} style={{ position: "absolute", left: 120, top: 70 }}><Eyebrow>Every call goes through Mubit</Eyebrow></Rise>
      <Flow at={12} y={190} nodes={top} accentIndex={2} />
      <Flow at={90} y={430} nodes={bottom} accentIndex={2} accent />
      {braider && (
        <Rise at={170} style={{ position: "absolute", left: 120, top: 640, width: 1100 }}>
          <div style={{ fontSize: 26, color: t.muted }}>Amara’s adapter {braider.version} on {braider.base}, trained on {braider.kept} kept examples</div>
          <div style={{ position: "relative", height: 22, borderRadius: 22, background: t.sunken, marginTop: 18 }}>
            <i style={{ position: "absolute", inset: 0, width: `${braider.quality}%`, borderRadius: 22, background: t.accent }} />
            <i style={{ position: "absolute", top: -8, bottom: -8, left: `${braider.target}%`, width: 3, background: t.ink }} />
          </div>
          <div style={{ fontSize: 22, color: t.faint, marginTop: 14 }}>Matches the big model on {braider.quality}% of test cases, aiming for {braider.target}%. {braider.state}. Checked {checkedAt}.</div>
        </Rise>
      )}
      <div style={{ position: "absolute", left: 120, top: 860, width: 1680 }}>
        <Caption at={230}>Every fix she makes trains her own model.</Caption>
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
function Stylists() {
  return (
    <Scene frames={SCENES.stylists}>
      <div style={{ position: "absolute", left: 120, top: 70 }}><Caption at={0}>Her rules. Her prices. Her voice.</Caption></div>
      <div style={{ position: "absolute", left: 120, top: 280, width: 1680, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 36 }}>
        {stylists.map((s, i) => (
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

// 9. Close.
function Close() {
  return (
    <Scene frames={SCENES.close}>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <Rise at={4}><div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 110, letterSpacing: "-0.03em", lineHeight: 1.04 }}>Turn “can u do these?”<br />into a booking.</div></Rise>
          <Rise at={30} style={{ marginTop: 44, fontSize: 34, color: t.muted }}>Brief Builder · brief-builder.buy-ea2.workers.dev</Rise>
          <Rise at={44} style={{ marginTop: 16, fontSize: 26, color: t.faint }}>Every model call through Mubit</Rise>
        </div>
      </div>
    </Scene>
  )
}
