// Reads a client's screenshots into tags from the stylist's fixed list, each with a confidence.
// It runs through Mubit like every other model call, under its own fixed instructions, so it
// forms its own Mubit task. Anything outside the tag list is dropped.
import { Effect } from "effect"
import { BRIEF_MODEL } from "./brief-call.ts"
import { contentJson, postChat } from "./mubit.ts"

type Tags = { trust_threshold: number; reader_fields: string[]; fields: Record<string, string[]> }
export type ReaderTag = { field: string; tag: string; confidence: number }
// The stylist overruled the reader: it said `said` for `field`, and the photo showed `now`.
export type ReaderFix = { field: string; said: string; now: string }

// The stylist's photo corrections go in the user message, not the instructions, so the
// reader's Mubit task keeps one fingerprint and its corrected answers become training data.
function fixesNote(fixes: ReaderFix[]): string {
  if (!fixes.length) return ""
  const lines = fixes.slice(0, 12).map((f) => (f.now === "none" ? `- ${f.field}: you said "${f.said}", but it wasn't there` : `- ${f.field}: you said "${f.said}", the photo showed "${f.now}"`))
  return `\n\nThis stylist corrected earlier photo reads. Don't repeat these mistakes:\n${lines.join("\n")}`
}

function instructions(tags: Tags): string {
  const lines = tags.reader_fields.map((f) => `- ${f}: ${tags.fields[f].join(", ")}`).join("\n")
  return `You look at hair inspiration photos a client sent a stylist and say what they show, as JSON only.

For each question below, pick the one value that best matches what the photos show, with your confidence from 0 to 1. Leave a question out if the photos don't show it. "extras" may list several values.

Questions and the only allowed values:
${lines}

Return exactly: {"tags": [{"field": "...", "tag": "...", "confidence": 0.0}]}`
}

function base64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes)
  let s = ""
  for (let i = 0; i < view.length; i += 0x8000) s += String.fromCharCode(...view.subarray(i, i + 0x8000))
  return btoa(s)
}

export async function readPhotos(opts: { key: string; tags: Tags; photos: { mime: string; bytes: ArrayBuffer }[]; fixes?: ReaderFix[] }): Promise<ReaderTag[] | null> {
  if (!opts.photos.length) return null
  const parsed: any = await Effect.runPromise(
    postChat({
      key: opts.key,
      attemptMs: 40_000,
      body: {
        model: BRIEF_MODEL,
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: instructions(opts.tags) },
          {
            role: "user",
            content: [
              { type: "text", text: `What do these photos show?${fixesNote(opts.fixes ?? [])}` },
              ...opts.photos.map((p) => ({ type: "image_url", image_url: { url: `data:${p.mime};base64,${base64(p.bytes)}` } })),
            ],
          },
        ],
      },
    }).pipe(
      Effect.flatMap(contentJson),
      // No photo tags is a safe answer: the brief is still drafted from the words.
      Effect.orElseSucceed(() => null),
    ),
  )
  const seen = new Set<string>()
  const out: ReaderTag[] = []
  for (const t of Array.isArray(parsed?.tags) ? parsed.tags : []) {
    const { field, tag, confidence } = t ?? {}
    if (!opts.tags.reader_fields.includes(field) || !opts.tags.fields[field]?.includes(tag)) continue
    if (typeof confidence !== "number" || confidence < 0 || confidence > 1) continue
    const key = field === "extras" ? `${field}:${tag}` : field
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ field, tag, confidence: Math.round(confidence * 100) / 100 })
  }
  return out.length ? out : null
}
