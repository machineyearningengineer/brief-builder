// The rules in code must agree with every label she has written: applied to her own answer, they
// change nothing. A rule that rewrites one of her labels is wrong, however much it helps a score.
// Usage: node scripts/check-rules.ts
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { canonicalWindow, decide } from "../src/shared/decide.ts"

const ROOT = join(import.meta.dirname, "..")
// Labels that disagree with her other labels, kept as she wrote them (labels are never edited to
// suit the code): s11 quotes with days named, s23 quotes with a field missing, s24 asks about a
// date the DM gives, s27 orders size before length (8 of 9 put length first), and n03, n08, n09,
// n11 ask with nothing left to ask.
const KNOWN = new Set(["s11", "s23", "s24", "s27", "n03", "n08", "n09", "n11"])
// Saved corrections keep the photo reader's tags as text: "length=waist (0.7), size=medium (0.5)".
const tagsOf = (r: any) => r.photo ?? (typeof r.photoTags === "string" && r.photoTags !== "none"
  ? { reader_output: [...r.photoTags.matchAll(/(\w+)=(\w+) \(([\d.]+)\)/g)].map((m) => ({ field: m[1], tag: m[2], confidence: Number(m[3]) })) }
  : null)
const strip = (b: any) => { const { reply_draft, evidence, ...rest } = b; return JSON.stringify(rest) }
let failed = 0
for (const stylist of ["braider", "colourist", "nails"] as const) {
  for (const file of ["train", "heldout", "corrections"]) {
    const path = join(ROOT, "data", stylist, `${file}.jsonl`)
    if (!existsSync(path)) continue
    const rows = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l))
    let ok = 0
    for (const r of rows) {
      const label = r.label ?? r.corrected
      const photo = tagsOf(r)
      const want = structuredClone(label)
      want.when = { ...want.when, window: canonicalWindow(want.when.window) }
      const got = structuredClone(want)
      decide(stylist, got, { text: r.text, received_at: r.received_at, photo })
      if (strip(got) === strip(want) || KNOWN.has(r.id)) ok++
      else { failed++; if (failed <= 12) console.log(`${stylist} ${r.id}: ${r.text.slice(0, 70)}\n  want ${strip(want)}\n  got  ${strip(got)}`) }
    }
    console.log(`${stylist} ${file}: ${ok}/${rows.length} labels unchanged`)
  }
}
process.exit(failed ? 1 : 0)
