// One brief call through Mubit's OpenAI route. Server-side only: Mubit answers no CORS
// preflight, and the key must never reach a browser.
import { instructionsFor, userMessage, type ReaderTag } from "./brief-prompt.ts"

export const MUBIT_OPENAI_BASE = "https://api.mubit.ai/openai/v1"
export const BRIEF_MODEL = "gpt-6-luna"

export type BriefCallResult = {
  status: number
  ms: number
  requestId: string | null
  brief: unknown
  error: unknown
  tokensIn: number | null
  tokensOut: number | null
}

export async function callBrief(opts: {
  key: string
  profile: Parameters<typeof instructionsFor>[0]
  tags: Parameters<typeof instructionsFor>[1]
  dm: { received_at: string; text: string; photo: { reader_output: ReaderTag[] } | null }
  effort?: "none" | "low" | "medium" | "high"
  // "off" keeps the call out of Mubit's record entirely, so it can never become a training
  // example. Every call that scores the locked test or trend sets must use it.
  record?: "full" | "off"
  corrections?: string
}): Promise<BriefCallResult> {
  const started = Date.now()
  const res = await fetch(`${MUBIT_OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.key}`,
      "content-type": "application/json",
      ...(opts.record === "off" ? { "x-middleware-record": "off" } : {}),
    },
    body: JSON.stringify({
      model: BRIEF_MODEL,
      response_format: { type: "json_object" },
      ...(opts.effort ? { reasoning_effort: opts.effort } : {}),
      messages: [
        { role: "system", content: instructionsFor(opts.profile, opts.tags) },
        { role: "user", content: userMessage(opts.dm, opts.corrections) },
      ],
    }),
  })
  const ms = Date.now() - started
  const body: any = await res.json().catch(() => null)
  let brief: unknown = null
  let error: unknown = res.ok ? null : body?.error ?? body
  if (res.ok) {
    try {
      brief = JSON.parse(body.choices[0].message.content)
    } catch (e) {
      error = `reply wasn't JSON: ${String(e)}`
    }
  }
  return {
    status: res.status, ms, requestId: res.headers.get("x-middleware-request-id"), brief, error,
    tokensIn: body?.usage?.prompt_tokens ?? null, tokensOut: body?.usage?.completion_tokens ?? null,
  }
}
