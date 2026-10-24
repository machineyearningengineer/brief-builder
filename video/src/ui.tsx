// Shared look and motion for the film: the app's own tokens (dark), and three moves only —
// rise in, type out, count up.
import type { CSSProperties, ReactNode } from "react"
import { Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion"
import { loadFont as loadDisplay } from "@remotion/google-fonts/BricolageGrotesque"
import { loadFont as loadSans } from "@remotion/google-fonts/Inter"

const display = loadDisplay("normal", { weights: ["600", "700"], subsets: ["latin"] }).fontFamily
const sans = loadSans("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily

export const t = {
  bg: "oklch(13.5% 0.009 330)",
  surface: "oklch(19% 0.011 330)",
  sunken: "oklch(23% 0.012 330)",
  ink: "oklch(96% 0.006 340)",
  muted: "oklch(72% 0.014 330)",
  faint: "oklch(56% 0.014 330)",
  line: "oklch(29% 0.012 330)",
  accent: "oklch(72% 0.15 348)",
  accentSoft: "oklch(29% 0.06 348)",
  onAccent: "oklch(17% 0.03 348)",
  good: "oklch(77% 0.13 152)",
  goodSoft: "oklch(28% 0.05 152)",
  bad: "oklch(73% 0.15 26)",
  mark: "oklch(42% 0.08 95)",
  display,
  sans,
}

export const useRise = (start: number, frames = 22) => {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  return spring({ frame: f - start, fps, config: { damping: 200 }, durationInFrames: frames })
}

export function Rise({ at, children, style, y = 26 }: { at: number; children: ReactNode; style?: CSSProperties; y?: number }) {
  const p = useRise(at)
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * y}px)`, ...style }}>{children}</div>
}

export function Typed({ text, at, cps = 55 }: { text: string; at: number; cps?: number }) {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  const n = Math.max(0, Math.min(text.length, Math.floor(((f - at) / fps) * cps)))
  const done = n >= text.length
  return (
    <span>
      {text.slice(0, n)}
      {!done && n > 0 && <span style={{ opacity: Math.floor(f / 8) % 2 ? 0 : 1, color: t.accent }}>▍</span>}
    </span>
  )
}

export function Count({ from, to, at, frames = 30, prefix = "", suffix = "" }: { from: number; to: number; at: number; frames?: number; prefix?: string; suffix?: string }) {
  const f = useCurrentFrame()
  const v = interpolate(f, [at, at + frames], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) })
  return <span style={{ fontVariantNumeric: "tabular-nums" }}>{prefix}{Math.round(v)}{suffix}</span>
}

// Every scene fades in and out over a few frames so cuts never jump.
export function Scene({ frames, children }: { frames: number; children: ReactNode }) {
  const f = useCurrentFrame()
  const o = interpolate(f, [0, 10, frames - 12, frames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  return <div style={{ position: "absolute", inset: 0, background: t.bg, color: t.ink, fontFamily: t.sans, opacity: o }}>{children}</div>
}

export function Caption({ at, children, sub, style }: { at: number; children: ReactNode; sub?: ReactNode; style?: CSSProperties }) {
  return (
    <Rise at={at} style={style}>
      <h2 style={{ margin: 0, fontFamily: t.display, fontWeight: 700, fontSize: 76, lineHeight: 1.02, letterSpacing: "-0.025em", textWrap: "balance" }}>{children}</h2>
      {sub && <p style={{ margin: "22px 0 0", fontSize: 30, lineHeight: 1.35, color: t.muted, maxWidth: 640 }}>{sub}</p>}
    </Rise>
  )
}

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: size, display: "inline-grid", placeItems: "center", flex: "none", fontWeight: 600, fontSize: size * 0.42, color: t.onAccent, background: `linear-gradient(135deg, ${t.accent}, oklch(66% 0.12 20))` }}>
      {name[0].toUpperCase()}
    </span>
  )
}

export function Phone({ children, title, sub, style }: { children: ReactNode; title: string; sub?: string; style?: CSSProperties }) {
  return (
    <div style={{ width: 470, height: 900, borderRadius: 58, padding: 12, background: "oklch(9% 0.005 330)", boxShadow: `0 0 0 2px ${t.line}, 0 40px 120px oklch(0% 0 0 / 0.55)`, ...style }}>
      <div style={{ height: "100%", borderRadius: 47, background: t.bg, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "54px 24px 16px", display: "flex", alignItems: "center", gap: 14, borderBottom: `1px solid ${t.line}` }}>
          <Avatar name={title} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 21 }}>{title}</div>
            {sub && <div style={{ fontSize: 16, color: t.muted }}>{sub}</div>}
          </div>
        </div>
        <div style={{ flex: 1, padding: "20px 18px", display: "flex", flexDirection: "column", gap: 10, justifyContent: "flex-end" }}>{children}</div>
      </div>
    </div>
  )
}

export function Bubble({ side, children, at, photo }: { side: "in" | "out"; children?: ReactNode; at: number; photo?: string }) {
  const p = useRise(at, 16)
  const out = side === "out"
  return (
    <div style={{ alignSelf: out ? "flex-end" : "flex-start", maxWidth: "82%", opacity: p, transform: `scale(${0.92 + 0.08 * p})`, transformOrigin: out ? "right bottom" : "left bottom" }}>
      {photo && <Img src={staticFile(photo)} style={{ display: "block", width: 250, height: 310, objectFit: "cover", borderRadius: 22, marginBottom: children ? 6 : 0 }} />}
      {children && (
        <div style={{ padding: "13px 18px", borderRadius: 24, fontSize: 21, lineHeight: 1.38, background: out ? t.accent : t.sunken, color: out ? t.onAccent : t.ink }}>{children}</div>
      )}
    </div>
  )
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: t.surface, borderRadius: 30, border: `1px solid ${t.line}`, boxShadow: "0 30px 90px oklch(0% 0 0 / 0.45)", ...style }}>{children}</div>
}

export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: t.faint, ...style }}>{children}</div>
}

export function Source({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "accent" | "good" }) {
  const c = tone === "accent" ? t.accent : tone === "good" ? t.good : t.muted
  return <span style={{ fontSize: 16, color: c, fontWeight: 500 }}>{children}</span>
}
