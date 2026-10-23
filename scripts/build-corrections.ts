// Turns the train briefs the model got wrong into stylist corrections, playing the stylist
// with our labels. Writes data/<stylist>/corrections.jsonl from every train run in runs/.
// Usage: node scripts/build-corrections.ts <stylist>
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Correction } from "../src/server/corrections.ts"

const ROOT = join(import.meta.dirname, "..")
const stylist = process.argv[2] ?? "braider"
const lines = (p: string) => readFileSync(p, "utf8").trim().split("\n").map((l) => JSON.parse(l))
const train = new Map(lines(join(ROOT, "data", stylist, "train.jsonl")).map((d) => [d.id, d]))

const latest = new Map<string, any>()
for (const f of readdirSync(join(ROOT, "runs")).filter((f) => f.includes(`-${stylist}-train-`)).sort()) {
  for (const r of lines(join(ROOT, "runs", f))) latest.set(r.id, r)
}
const corrections: Correction[] = [...latest.values()]
  .filter((r) => r.status === 200 && r.wrong.length > 0 && train.has(r.id))
  .map((r) => {
    const d = train.get(r.id)
    return {
      id: d.id,
      received_at: d.received_at,
      text: d.text,
      photoTags: d.photo?.reader_output.map((t: any) => `${t.field}=${t.tag} (${t.confidence})`).join(", ") ?? "none",
      corrected: d.label,
      changed: r.wrong,
    }
  })
writeFileSync(join(ROOT, "data", stylist, "corrections.jsonl"), corrections.map((c) => JSON.stringify(c)).join("\n") + "\n")
console.log(`${corrections.length} corrections from ${latest.size} scored train briefs`)
