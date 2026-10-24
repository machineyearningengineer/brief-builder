// One brief call through Mubit's OpenAI route. Server-side only: Mubit answers no CORS
// preflight, and the key must never reach a browser.
import { Effect } from "effect"
import { instructionsFor, userMessage, type ReaderTag } from "./brief-prompt.ts"
import { contentJson, postChat } from "./mubit.ts"

export { MUBIT_OPENAI_BASE } from "./mubit.ts"
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
  // Earlier turns of this client's conversation, oldest first: what they sent, and the brief
  // as it stood after that turn (with the stylist's fixes and the reply they actually sent).
  // The model then returns the brief for the whole conversation, not just the new message.
  history?: { dm: { received_at: string; text: string; photo: { reader_output: ReaderTag[] } | null }; brief: Record<string, unknown> }[]
}): Promise<BriefCallResult> {
  const call = postChat({
    key: opts.key,
    record: opts.record,
    body: {
      model: BRIEF_MODEL,
      response_format: { type: "json_object" },
      ...(opts.effort ? { reasoning_effort: opts.effort } : {}),
      messages: [
        { role: "system", content: instructionsFor(opts.profile, opts.tags) },
        ...(opts.history ?? []).flatMap((turn) => [
          { role: "user", content: userMessage(turn.dm) },
          { role: "assistant", content: JSON.stringify(turn.brief) },
        ]),
        { role: "user", content: userMessage(opts.dm, opts.corrections) },
      ],
    },
  }).pipe(
    Effect.flatMap((reply) => contentJson(reply).pipe(Effect.map((brief) => ({ reply, brief })))),
    Effect.match({
      onSuccess: ({ reply, brief }): BriefCallResult => ({
        status: reply.status, ms: reply.ms, requestId: reply.requestId, brief, error: null,
        tokensIn: reply.json?.usage?.prompt_tokens ?? null, tokensOut: reply.json?.usage?.completion_tokens ?? null,
      }),
      onFailure: (e): BriefCallResult => ({ status: e.status ?? 0, ms: 0, requestId: null, brief: null, error: `${e.reason}: ${e.detail}`, tokensIn: null, tokensOut: null }),
    }),
  )
  return Effect.runPromise(call)
}
