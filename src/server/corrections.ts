// A stylist's corrections, and how the most relevant ones reach the next brief.
//
// A correction is a DM plus the brief the stylist wanted. Before each new brief, the closest
// past corrections go into the user message as worked examples. The instructions never
// change, so Mubit keeps one task, and every corrected answer it records becomes a training
// example for that task's adapter.

export type Correction = {
  id: string
  received_at: string
  text: string
  photoTags: string
  // The brief as the stylist corrected it, without evidence (the model re-derives that).
  corrected: Record<string, unknown>
  // Fields the stylist changed, so the example says what mattered.
  changed: string[]
}

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9£ ]+/g, " ").split(/\s+/).filter((w) => w.length > 1))

// Word-overlap similarity is enough for short DMs and needs no embedding call.
export function closestCorrections(text: string, pool: Correction[], k = 3): Correction[] {
  const q = words(text)
  return pool
    .map((c) => {
      const w = words(c.text)
      let shared = 0
      for (const x of q) if (w.has(x)) shared++
      return { c, score: shared / Math.sqrt(q.size * w.size || 1) }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.c)
}

// One time she rewrote a draft before sending it: the clearest record of how she talks.
export type VoiceEdit = { dm: string; draft: string; sent: string }

export function closestVoice(text: string, pool: VoiceEdit[], k = 2): VoiceEdit[] {
  const q = words(text)
  const scored = pool.map((v, i) => {
    const w = words(v.dm)
    let shared = 0
    for (const x of q) if (w.has(x)) shared++
    // Newer edits win ties: her voice now matters more than her voice last month.
    return { v, score: shared / Math.sqrt(q.size * w.size || 1) + i * 1e-6 }
  })
  return scored.sort((a, b) => b.score - a.score).slice(0, k).map((s) => s.v)
}

export function voiceBlock(vs: VoiceEdit[]): string {
  if (!vs.length) return ""
  const shown = vs.map((v) => `- DM: ${JSON.stringify(v.dm)}\n  Draft: ${JSON.stringify(v.draft)}\n  She sent: ${JSON.stringify(v.sent)}`)
  return `\n\nHow this stylist rewrites drafts before sending. Write reply_draft the way she does (greeting, tone, emoji, sign-off), keeping the prices and facts from the brief:\n${shown.join("\n")}`
}

// Word-level share of a draft the stylist changed: 0 when sent as drafted, 1 when rewritten.
export function editShare(draft: string, sent: string): number {
  const a = draft.toLowerCase().split(/\s+/).filter(Boolean)
  const b = sent.toLowerCase().split(/\s+/).filter(Boolean)
  if (!a.length && !b.length) return 0
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
  return Math.round((1 - (2 * dp[a.length][b.length]) / (a.length + b.length)) * 100) / 100
}

export function correctionsBlock(cs: Correction[]): string {
  if (!cs.length) return ""
  const shown = cs.map((c) => {
    const { reply_draft, evidence, ...brief } = c.corrected as Record<string, unknown>
    return `- Received ${c.received_at}. DM: ${JSON.stringify(c.text)}\n  The stylist corrected ${c.changed.join(", ")}. Correct brief: ${JSON.stringify(brief)}`
  })
  return `\n\nThis stylist's corrections on similar DMs (follow how they handled them):\n${shown.join("\n")}`
}
