// Re-applies the app's code rules (src/shared/decide.ts) to a saved replay run without calling
// any model: the stored briefs are scored again, so a rule change is measured on the same answers.
// Usage: node scripts/rescore.ts <runs/....jsonl>
import { readFileSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import { canonicalWindow, decide } from "../src/shared/decide.ts"

const ROOT = join(import.meta.dirname, "..")
const runPath = process.argv[2]
const [, stylist, split] = basename(runPath).match(/Z-(braider|colourist|nails)-(train|heldout|trend)-/) ?? []
const data = new Map(readFileSync(join(ROOT, "data", stylist, `${split}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l)).map((d) => [d.id, d]))
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
  decide(stylist as any, ruled, dm)
  const got = flat(ruled)
  r.wrongRules = Object.keys(want).filter((k) => want[k] !== got[k])
}
writeFileSync(runPath, rows.map((r) => JSON.stringify(r)).join("\n") + "\n")
const ok = rows.filter((r) => r.status === 200)
console.log(`${stylist} ${split}: fully right with rules ${Math.round((100 * ok.filter((r) => !r.wrongRules?.length).length) / ok.length)}%`)
