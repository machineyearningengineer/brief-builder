// Sends one DM through Mubit and compares the brief with our label.
// Usage: node scripts/first-call.ts [stylist] [id]   (defaults: braider s01)
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Schema } from "effect"
import { briefSchemaFor } from "../src/shared/brief.ts"
import { instructionsFor, userMessage } from "../src/server/brief-prompt.ts"

const ROOT = join(import.meta.dirname, "..")
const [stylist = "braider", id = "s01"] = process.argv.slice(2) as ["braider" | "colourist", string]
const env = Object.fromEntries(readFileSync(join(ROOT, ".dev.vars"), "utf8").trim().split("\n").map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]))
const MODEL = process.env.BRIEF_MODEL ?? "gpt-6-luna"

const read = (f: string) => JSON.parse(readFileSync(join(ROOT, "data", stylist, f), "utf8"))
const rows = readFileSync(join(ROOT, "data", stylist, "train.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l))
const dm = rows.find((r) => r.id === id)
if (!dm) throw new Error(`no DM ${id} in data/${stylist}/train.jsonl`)

const started = Date.now()
const res = await fetch("https://api.mubit.ai/openai/v1/chat/completions", {
  method: "POST",
  headers: { authorization: `Bearer ${env.MUBIT_API_KEY}`, "content-type": "application/json" },
  body: JSON.stringify({
    model: MODEL,
    response_format: { type: "json_object" },
    ...(process.env.BRIEF_EFFORT ? { reasoning_effort: process.env.BRIEF_EFFORT } : {}),
    messages: [
      { role: "system", content: instructionsFor(read("profile.json"), read("tags.json")) },
      { role: "user", content: userMessage(dm) },
    ],
  }),
})
const ms = Date.now() - started
const body: any = await res.json()
console.log(`status ${res.status} · ${ms} ms · request ${res.headers.get("x-middleware-request-id")}`)
if (!res.ok) {
  console.log(JSON.stringify(body.error ?? body, null, 2))
  process.exit(1)
}
console.log(`model ${body.model} · tokens in ${body.usage?.prompt_tokens} out ${body.usage?.completion_tokens}`)

const raw = JSON.parse(body.choices[0].message.content)
const decoded = Schema.decodeUnknownExit(briefSchemaFor[stylist])(raw)
console.log(decoded._tag === "Success" ? "schema: valid" : `schema: INVALID ${String(decoded.cause).slice(0, 300)}`)

const flat = (o: any, p = ""): Record<string, string> =>
  Object.entries(o ?? {}).reduce((acc, [k, v]) => {
    if (k === "evidence" || k === "reply_draft") return acc
    if (v && typeof v === "object" && !Array.isArray(v)) return { ...acc, ...flat(v, `${p}${k}.`) }
    return { ...acc, [`${p}${k}`]: JSON.stringify(v) }
  }, {} as Record<string, string>)
const want = flat(dm.label)
const got = flat(raw)
const wrong = Object.keys(want).filter((k) => want[k] !== got[k])
console.log(`fields right: ${Object.keys(want).length - wrong.length}/${Object.keys(want).length}`)
for (const k of wrong) console.log(`  ${k}: model ${got[k] ?? "(missing)"} · label ${want[k]}`)
console.log(`\nDM: ${dm.text}\nreply: ${raw.reply_draft}`)
