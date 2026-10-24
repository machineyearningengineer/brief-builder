// Runs a saved replay run's model answers through exactly what the app does after a draft
// (finishBrief: photo tags, evidence guards, her rules in code) without calling any model, so a
// change is measured on the same answers and the score is the app's, not the raw model's.
// Usage: node scripts/rescore.ts <runs/....jsonl>
import { readFileSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import { canonicalWindow } from "../src/shared/decide.ts"
import { finishBrief } from "../src/server/guards.ts"

const ROOT = join(import.meta.dirname, "..")
const runPath = process.argv[2]
const [, stylist, split] = basename(runPath).match(/Z-(braider|colourist|nails)-(train|heldout|trend)-/) ?? []
const data = new Map(readFileSync(join(ROOT, "data", stylist, `${split}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l)).map((d) => [d.id, d]))
const threshold = JSON.parse(readFileSync(join(ROOT, "data", stylist, "tags.json"), "utf8")).trust_threshold
const flat = (o: any, p = ""): Record<string, string> =>
  Object.entries(o ?? {}).reduce((acc, [k, v]) => {
    if (k === "evidence" || k === "reply_draft") return acc
    if (v && typeof v === "object" && !Array.isArray(v)) return { ...acc, ...flat(v, `${p}${k}.`) }
    return { ...acc, [`${p}${k}`]: JSON.stringify(v) }
  }, {} as Record<string, string>)
const rows = readFileSync(runPath, "utf8").trim().split("\n").map((l) => JSON.parse(l))
for (const r of rows) {
  const dm = data.get(r.id)
  if (!dm || !r.brief) continue
  const want = flat({ ...dm.label, when: { ...dm.label.when, window: canonicalWindow(dm.label.when.window) } })
  const ruled = structuredClone(r.brief)
  finishBrief(stylist as any, ruled, { text: dm.text, received_at: dm.received_at, photoTags: dm.photo?.reader_output ?? null }, [], threshold)
  const got = flat(ruled)
  r.wrongRules = Object.keys(want).filter((k) => want[k] !== got[k])
}
writeFileSync(runPath, rows.map((r) => JSON.stringify(r)).join("\n") + "\n")
const ok = rows.filter((r) => r.status === 200)
console.log(`${stylist} ${split}: fully right with rules ${Math.round((100 * ok.filter((r) => !r.wrongRules?.length).length) / ok.length)}%`)
