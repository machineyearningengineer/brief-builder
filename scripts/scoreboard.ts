// Summarises the newest scored runs of each stylist's locked test set into
// src/shared/scoreboard.json, which the stage view shows. Nothing on stage is typed in by hand.
// Usage: node scripts/scoreboard.ts [stylist]   (updates that stylist's entry)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const stylist = process.argv[2] ?? "braider"
const lines = (p: string) => readFileSync(p, "utf8").trim().split("\n").map((l) => JSON.parse(l))
const data = new Map(lines(join(ROOT, "data", stylist, "heldout.jsonl")).map((d) => [d.id, d]))
const profile = JSON.parse(readFileSync(join(ROOT, "data", stylist, "profile.json"), "utf8"))
const runs = readdirSync(join(ROOT, "runs")).filter((f) => f.includes(`-${stylist}-heldout-`)).sort()
const newest = (corrected: boolean) => runs.filter((f) => f.endsWith("-corrected.jsonl") === corrected).at(-1)

function summarise(file: string | undefined, label: string) {
  if (!file) return null
  const rows = lines(join(ROOT, "runs", file)).filter((r) => r.status === 200)
  const share = (f: (r: any) => boolean, rs = rows) => (rs.length ? Math.round((100 * rs.filter(f).length) / rs.length) : 0)
  const byRule: Record<string, number> = {}
  for (const rule of profile.house_rules.map((r: any) => r.id)) {
    const rs = rows.filter((r) => data.get(r.id)?.rules.includes(rule))
    if (rs.length) byRule[rule] = share((r) => !r.wrong.includes("next_action"), rs)
  }
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b)
  const fields = rows.reduce((a, r) => [a[0] + r.right, a[1] + r.of], [0, 0])
  return {
    label, run: file, briefs: rows.length,
    fullyRight: share((r) => r.wrong.length === 0),
    nextAction: share((r) => !r.wrong.includes("next_action")),
    fields: Math.round((100 * fields[0]) / fields[1]),
    p50ms: ms[Math.floor(ms.length / 2)],
    tokensPerBrief: Math.round(rows.reduce((a, r) => a + (r.tokens_in ?? 0) + (r.tokens_out ?? 0), 0) / rows.length),
    nextActionByRule: byRule,
  }
}

const out = {
  stylist,
  testSet: `${data.size} locked DMs, never recorded by Mubit`,
  rules: Object.fromEntries(profile.house_rules.map((r: any) => [r.id, r.rule])),
  base: summarise(newest(false), "gpt-6-luna"),
  corrected: summarise(newest(true), "gpt-6-luna + stylist fixes"),
  adapter: null as null | ReturnType<typeof summarise>,
}
const path = join(ROOT, "src", "shared", "scoreboard.json")
const all = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {}
// Older single-stylist files had no per-stylist keys.
const merged = "base" in all ? { [all.stylist]: all } : all
merged[stylist] = out
writeFileSync(path, JSON.stringify(merged, null, 2) + "\n")
console.log(`base ${out.base?.fullyRight}% fully right · with fixes ${out.corrected?.fullyRight}% (${out.base?.run} · ${out.corrected?.run})`)
