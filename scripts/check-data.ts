// Decodes every DM in data/ with the app's own schema and checks each stylist's tags.json
// lists exactly the values the schema allows. Run after changing either.
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { Schema } from "effect"
import { BraiderLook, ColouristLook, DatasetRow } from "../src/shared/brief.ts"

const DATA = join(import.meta.dirname, "..", "data")
const decode = Schema.decodeUnknownSync(DatasetRow)
const looks = { braider: BraiderLook, colourist: ColouristLook } as const
const problems: string[] = []
let rows = 0

for (const stylist of ["braider", "colourist"] as const) {
  // seeds.jsonl is the prep source for train.jsonl's first rows, so it isn't loaded by the app.
  for (const file of readdirSync(join(DATA, stylist)).filter((f) => f.endsWith(".jsonl") && f !== "seeds.jsonl")) {
    const lines = readFileSync(join(DATA, stylist, file), "utf8").trim().split("\n")
    lines.forEach((line, i) => {
      rows++
      try {
        const r = decode(JSON.parse(line))
        if (r.stylist !== stylist) problems.push(`${stylist}/${file}:${i + 1} is labelled ${r.stylist}`)
      } catch (e) {
        problems.push(`${stylist}/${file}:${i + 1} ${String(e).split("\n").slice(0, 3).join(" ")}`)
      }
    })
  }
  const tags = JSON.parse(readFileSync(join(DATA, stylist, "tags.json"), "utf8")).fields as Record<string, string[]>
  for (const [field, schema] of Object.entries(looks[stylist].fields)) {
    const is = Schema.is(schema as Schema.Top)
    for (const v of tags[field] ?? []) {
      if (!is(v) && !is([v])) problems.push(`${stylist}/tags.json ${field}: "${v}" isn't in the schema`)
    }
  }
}

console.log(problems.length ? problems.slice(0, 20).join("\n") : `all ${rows} DMs decode with the app's schema`)
process.exit(problems.length ? 1 : 0)
