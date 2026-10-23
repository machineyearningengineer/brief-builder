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

export function correctionsBlock(cs: Correction[]): string {
  if (!cs.length) return ""
  const shown = cs.map((c) => {
    const { reply_draft, evidence, ...brief } = c.corrected as Record<string, unknown>
    return `- Received ${c.received_at}. DM: ${JSON.stringify(c.text)}\n  The stylist corrected ${c.changed.join(", ")}. Correct brief: ${JSON.stringify(brief)}`
  })
  return `\n\nThis stylist's corrections on similar DMs (follow how they handled them):\n${shown.join("\n")}`
}
