// Sends labelled DMs through Mubit so its task collects kept examples, a few at a time,
// and scores each brief against our label. Results go to runs/<time>-<stylist>.jsonl.
//
// Usage: node scripts/replay.ts <stylist> <file> [--only-seeds] [--skip N] [--limit N] [--effort low] [--concurrency 4]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Schema } from "effect"
import { briefSchemaFor } from "../src/shared/brief.ts"
import { callBrief } from "../src/server/brief-call.ts"
import { closestCorrections, correctionsBlock, type Correction } from "../src/server/corrections.ts"
import { canonicalWindow, decide } from "../src/shared/decide.ts"

const ROOT = join(import.meta.dirname, "..")
const args = process.argv.slice(2)
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const stylist = args[0] as "braider" | "colourist" | "nails"
const file = args[1] ?? "train.jsonl"
const effort = flag("effort", "low") as "none" | "low"
const concurrency = Number(flag("concurrency", "4"))
const limit = Number(flag("limit", "100000"))
const skip = Number(flag("skip", "0"))
// Only training data may be recorded; scoring the locked sets must never train Mubit.
const record = file === "train.jsonl" ? "full" : "off"

const env = Object.fromEntries(readFileSync(join(ROOT, ".dev.vars"), "utf8").trim().split("\n").map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]))
const read = (f: string) => JSON.parse(readFileSync(join(ROOT, "data", stylist, f), "utf8"))
const profile = read("profile.json")
const tags = read("tags.json")
let dms = readFileSync(join(ROOT, "data", stylist, file), "utf8").trim().split("\n").map((l) => JSON.parse(l))
if (args.includes("--only-seeds")) dms = dms.filter((d) => /^(s|c)\d+$/.test(d.id))
dms = dms.slice(skip, skip + limit)
// --with-corrections adds the stylist's closest past corrections to each DM, never its own.
const withCorrections = args.includes("--with-corrections")
const pool: Correction[] = withCorrections
  ? readFileSync(join(ROOT, "data", stylist, "corrections.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l))
  : []

const flat = (o: any, p = ""): Record<string, string> =>
  Object.entries(o ?? {}).reduce((acc, [k, v]) => {
    if (k === "evidence" || k === "reply_draft") return acc
    if (v && typeof v === "object" && !Array.isArray(v)) return { ...acc, ...flat(v, `${p}${k}.`) }
    return { ...acc, [`${p}${k}`]: JSON.stringify(v) }
  }, {} as Record<string, string>)
const isValid = Schema.is(briefSchemaFor[stylist] as Schema.Top)

const results: any[] = []
let next = 0
async function worker() {
  while (next < dms.length) {
    const dm = dms[next++]
    const corrections = withCorrections ? correctionsBlock(closestCorrections(dm.text, pool.filter((c) => c.id !== dm.id))) : ""
    const r = await callBrief({ key: env.MUBIT_API_KEY, profile, tags, dm, effort, record, corrections })
    // Windows compare in one vocabulary on both sides ("any weekday after 5" is "after work").
    const label = { ...dm.label, when: { ...dm.label.when, window: canonicalWindow(dm.label.when.window) } }
    const raw = r.brief ? { ...(r.brief as any), when: { ...(r.brief as any).when, window: canonicalWindow((r.brief as any).when?.window) } } : null
    const want = flat(label)
    const got = flat(raw)
    const wrong = r.brief ? Object.keys(want).filter((k) => want[k] !== got[k]) : Object.keys(want)
    // The same brief after the app's code rules (next step, missing, day-word dates).
    const ruled = r.brief ? structuredClone(r.brief as any) : null
    if (ruled) decide(stylist, ruled, dm)
    const gotRuled = flat(ruled)
    const wrongRules = ruled ? Object.keys(want).filter((k) => want[k] !== gotRuled[k]) : Object.keys(want)
    const row = { id: dm.id, status: r.status, ms: r.ms, request_id: r.requestId, valid: isValid(r.brief), right: Object.keys(want).length - wrong.length, of: Object.keys(want).length, wrong, wrongRules, tokens_in: r.tokensIn, tokens_out: r.tokensOut, error: r.error, brief: r.brief }
    results.push(row)
    console.log(`${dm.id.padEnd(5)} ${r.status} ${String(r.ms).padStart(6)} ms  ${row.valid ? "valid  " : "INVALID"} ${row.right}/${row.of}${wrong.length ? "  wrong: " + wrong.join(", ") : ""}${r.error ? "  " + JSON.stringify(r.error).slice(0, 160) : ""}`)
  }
}
await Promise.all(Array.from({ length: concurrency }, worker))

const ok = results.filter((r) => r.status === 200)
const ms = ok.map((r) => r.ms).sort((a, b) => a - b)
const pct = (p: number) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))]
const fields = ok.reduce((a, r) => [a[0] + r.right, a[1] + r.of], [0, 0])
console.log(`\n${ok.length}/${results.length} answered · ${ok.filter((r) => r.valid).length} schema-valid · fields ${fields[0]}/${fields[1]} (${((100 * fields[0]) / Math.max(1, fields[1])).toFixed(1)}%) · p50 ${pct(0.5)} ms · p95 ${pct(0.95)} ms · tokens in ${ok.reduce((a, r) => a + (r.tokens_in ?? 0), 0)} out ${ok.reduce((a, r) => a + (r.tokens_out ?? 0), 0)}`)
mkdirSync(join(ROOT, "runs"), { recursive: true })
const out = join(ROOT, "runs", `${new Date().toISOString().replace(/[:.]/g, "-")}-${stylist}-${file.replace(".jsonl", "")}-${effort}${withCorrections ? "-corrected" : ""}.jsonl`)
writeFileSync(out, results.map((r) => JSON.stringify(r)).join("\n") + "\n")
console.log(`saved ${out}`)
