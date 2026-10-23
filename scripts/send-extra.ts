// Sends hand-written, unlabelled DMs through Mubit as training input. Mubit learns from the
// model's answers, so these need no labels; they add variety the generated set lacks.
// Usage: node scripts/send-extra.ts <stylist> [--effort medium] [--concurrency 3]
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Schema } from "effect"
import { briefSchemaFor } from "../src/shared/brief.ts"
import { callBrief } from "../src/server/brief-call.ts"

const ROOT = join(import.meta.dirname, "..")
const args = process.argv.slice(2)
const flag = (name: string, fallback: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback)
const stylist = args[0] as "braider" | "colourist"
const effort = flag("effort", "medium") as "low" | "medium"
const concurrency = Number(flag("concurrency", "3"))

const env = Object.fromEntries(readFileSync(join(ROOT, ".dev.vars"), "utf8").trim().split("\n").map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]))
const read = (f: string) => JSON.parse(readFileSync(join(ROOT, "data", stylist, f), "utf8"))
const profile = read("profile.json")
const tags = read("tags.json")
const texts = readFileSync(join(ROOT, "data", stylist, "extra-train.txt"), "utf8").split("\n").map((l) => l.trim()).filter(Boolean)
const isValid = Schema.is(briefSchemaFor[stylist] as Schema.Top)

// Received times spread over 16–23 October, 08:00–22:00 London time (BST, +01:00).
const receivedAt = (i: number) => {
  const day = 16 + (i % 8)
  const hour = 8 + ((i * 5) % 15)
  const minute = (i * 17) % 60
  return `2026-10-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+01:00`
}

let next = 0
let ok = 0
let valid = 0
async function worker() {
  while (next < texts.length) {
    const i = next++
    const r = await callBrief({ key: env.MUBIT_API_KEY, profile, tags, effort, record: "full", dm: { received_at: receivedAt(i), text: texts[i], photo: null } })
    if (r.status === 200) ok++
    if (isValid(r.brief)) valid++
    console.log(`${String(i + 1).padStart(3)} ${r.status} ${String(r.ms).padStart(6)} ms ${isValid(r.brief) ? "valid" : "INVALID"}  ${texts[i].slice(0, 60)}`)
  }
}
await Promise.all(Array.from({ length: concurrency }, worker))
console.log(`\n${stylist}: ${ok}/${texts.length} answered, ${valid} schema-valid, effort ${effort}`)
