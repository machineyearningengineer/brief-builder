// The one way this app calls Mubit: every model call goes through here.
//
// Each attempt has its own time limit, and only failures worth retrying are retried (rate limits,
// server errors, timeouts, dropped connections), with jittered exponential backoff. A bad request
// or a malformed answer fails at once with a typed error, so callers can tell them apart.
import { Data, Effect, Schedule } from "effect"

export const MUBIT_OPENAI_BASE = "https://api.mubit.ai/openai/v1"

export class MubitError extends Data.TaggedError("MubitError")<{
  reason: "timeout" | "rate_limited" | "upstream" | "network" | "rejected" | "bad_output"
  status: number | null
  detail: string
}> {}

export type MubitReply = { json: any; status: number; requestId: string | null; ms: number }

const worthRetrying = (e: MubitError) => e.reason === "timeout" || e.reason === "rate_limited" || e.reason === "upstream" || e.reason === "network"

export function postChat(opts: {
  key: string
  body: unknown
  // "off" keeps the call out of Mubit's record entirely, so it can never become a training example.
  record?: "full" | "off"
  attemptMs?: number
  totalMs?: number
  retries?: number
  // Tests point this at a stand-in server.
  base?: string
}): Effect.Effect<MubitReply, MubitError> {
  const started = Date.now()
  const attempt = Effect.tryPromise({
    try: (signal) =>
      fetch(`${opts.base ?? MUBIT_OPENAI_BASE}/chat/completions`, {
        method: "POST",
        signal,
        headers: {
          authorization: `Bearer ${opts.key}`,
          "content-type": "application/json",
          ...(opts.record === "off" ? { "x-middleware-record": "off" } : {}),
        },
        body: JSON.stringify(opts.body),
      }),
    catch: (e) => new MubitError({ reason: "network", status: null, detail: String(e) }),
  }).pipe(
    Effect.flatMap((res) =>
      res.ok
        ? Effect.tryPromise({
            try: () => res.json(),
            catch: (e) => new MubitError({ reason: "bad_output", status: res.status, detail: `reply wasn't JSON: ${String(e)}` }),
          }).pipe(Effect.map((json) => ({ json, status: res.status, requestId: res.headers.get("x-middleware-request-id"), ms: Date.now() - started })))
        : Effect.tryPromise({ try: () => res.text(), catch: () => new MubitError({ reason: "upstream", status: res.status, detail: "" }) }).pipe(
            Effect.flatMap((text) =>
              Effect.fail(new MubitError({
                reason: res.status === 429 ? "rate_limited" : res.status >= 500 || res.status === 408 ? "upstream" : "rejected",
                status: res.status,
                detail: text.slice(0, 300),
              })),
            ),
          ),
    ),
    Effect.timeout(opts.attemptMs ?? 45_000),
    Effect.mapError((e) => (e instanceof MubitError ? e : new MubitError({ reason: "timeout", status: null, detail: `no answer in ${opts.attemptMs ?? 45_000} ms` }))),
  )
  const budget = opts.totalMs ?? 90_000
  return attempt.pipe(
    Effect.retry({ while: worthRetrying, times: opts.retries ?? 2, schedule: Schedule.exponential("500 millis").pipe(Schedule.jittered) }),
    // However many attempts, the whole call has one budget, so nothing waits on it for ever.
    Effect.timeout(budget),
    Effect.mapError((e) => (e instanceof MubitError ? e : new MubitError({ reason: "timeout", status: null, detail: `no answer in ${budget} ms` }))),
  )
}

// The model's JSON answer from a chat completion, or a typed bad_output error.
export const contentJson = (reply: MubitReply): Effect.Effect<unknown, MubitError> =>
  Effect.try({
    try: () => JSON.parse(reply.json?.choices?.[0]?.message?.content ?? ""),
    catch: (e) => new MubitError({ reason: "bad_output", status: reply.status, detail: `answer wasn't JSON: ${String(e)}` }),
  })
