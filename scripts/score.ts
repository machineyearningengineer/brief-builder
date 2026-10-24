// Breaks a replay run down by field and by house rule, for the scoreboard.
// Usage: node scripts/score.ts <runs/....jsonl> [<stylist> <dataset file>]
import { readFileSync } from "node:fs"
import { basename, join } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const runPath = process.argv[2]
const [, stylist, split] = basename(runPath).match(/Z-(braider|colourist|nails)-(train|heldout|trend)-/) ?? []
const lines = (p: string) => readFileSync(p, "utf8").trim().split("\n").map((l) => JSON.parse(l))
const run = lines(runPath)
const data = new Map(lines(join(ROOT, "data", stylist, `${split}.jsonl`)).map((d) => [d.id, d]))
const profile = JSON.parse(readFileSync(join(ROOT, "data", stylist, "profile.json"), "utf8"))
const ruleText = new Map<number, string>(profile.house_rules.map((r: any) => [r.id, r.rule]))

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : "—").padStart(5)
const answered = run.filter((r) => r.status === 200)

const fieldWrong = new Map<string, number>()
for (const r of answered) for (const f of r.wrong) fieldWrong.set(f, (fieldWrong.get(f) ?? 0) + 1)
console.log(`${stylist} ${split}: ${answered.length} briefs`)
console.log(`fully right: ${pct(answered.filter((r) => r.wrong.length === 0).length, answered.length)}   next action right: ${pct(answered.filter((r) => !r.wrong.includes("next_action")).length, answered.length)}`)
console.log("\nfield accuracy (worst first)")
for (const [f, n] of [...fieldWrong].sort((a, b) => b[1] - a[1])) console.log(`  ${pct(answered.length - n, answered.length)}  ${f}`)

console.log("\nby house rule: briefs fully right / next action right")
const byRule = new Map<number, any[]>()
for (const r of answered) for (const rule of data.get(r.id)?.rules ?? []) byRule.set(rule, [...(byRule.get(rule) ?? []), r])
for (const [rule, rs] of [...byRule].sort((a, b) => a[0] - b[0])) {
  console.log(`  ${String(rule).padStart(2)}  ${pct(rs.filter((r) => r.wrong.length === 0).length, rs.length)}  ${pct(rs.filter((r) => !r.wrong.includes("next_action")).length, rs.length)}  (${String(rs.length).padStart(2)})  ${ruleText.get(rule)?.slice(0, 70)}`)
}
const ms = answered.map((r) => r.ms).sort((a, b) => a - b)
const tin = answered.reduce((a, r) => a + (r.tokens_in ?? 0), 0)
const tout = answered.reduce((a, r) => a + (r.tokens_out ?? 0), 0)
console.log(`\nlatency p50 ${ms[Math.floor(ms.length / 2)]} ms · p95 ${ms[Math.floor(ms.length * 0.95)]} ms · tokens per brief in ${Math.round(tin / answered.length)} out ${Math.round(tout / answered.length)}`)
