// Checks the Mubit client against a stand-in server that misbehaves on purpose: rate limits,
// server errors, a hang, a refusal and a non-JSON answer. No real Mubit calls are made.
// Usage: node scripts/check-mubit-client.ts
import { createServer } from "node:http"
import { Effect, Exit } from "effect"
import { contentJson, postChat } from "../src/server/mubit.ts"

const ok = (res: any, content: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] })) }
const hits = new Map<string, number>()
const server = createServer((req, res) => {
  const scenario = req.headers["x-scenario"] as string
  const n = (hits.get(scenario) ?? 0) + 1
  hits.set(scenario, n)
  if (scenario === "429-then-ok") return n < 2 ? (res.writeHead(429), res.end("slow down")) : ok(res, { fine: true })
  if (scenario === "always-500") return res.writeHead(500), res.end("boom")
  if (scenario === "hang") return // never answers
  if (scenario === "401") return res.writeHead(401), res.end("bad key")
  if (scenario === "not-json") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ choices: [{ message: { content: "not json at all" } }] })) }
})
await new Promise<void>((r) => server.listen(0, r))
const base = `http://127.0.0.1:${(server.address() as any).port}`

// The client sends x-scenario through a fetch wrapper so each case is isolated.
const realFetch = globalThis.fetch
const run = async (scenario: string, extra: object = {}) => {
  globalThis.fetch = ((url: any, init: any) => realFetch(url, { ...init, headers: { ...init.headers, "x-scenario": scenario } })) as typeof fetch
  const started = Date.now()
  const exit = await Effect.runPromiseExit(postChat({ key: "test", base, body: {}, attemptMs: 400, totalMs: 3000, ...extra }).pipe(Effect.flatMap(contentJson)))
  return { exit, ms: Date.now() - started, attempts: hits.get(scenario) ?? 0 }
}
const reason = (exit: Exit.Exit<unknown, any>) => (Exit.isFailure(exit) ? JSON.stringify(exit.cause).match(/"reason":"(\w+)"/)?.[1] : "ok")
const results = [
  ["rate limited once, then fine: retried and succeeds", await run("429-then-ok"), (r: any) => reason(r.exit) === "ok" && r.attempts === 2],
  ["server error every time: 3 attempts, then upstream", await run("always-500"), (r: any) => reason(r.exit) === "upstream" && r.attempts === 3],
  ["hangs: each attempt times out, whole call gives up", await run("hang"), (r: any) => reason(r.exit) === "timeout" && r.ms < 3500],
  ["bad key: refused at once, never retried", await run("401"), (r: any) => reason(r.exit) === "rejected" && r.attempts === 1],
  ["answer isn't JSON: bad_output, never retried", await run("not-json"), (r: any) => reason(r.exit) === "bad_output" && r.attempts === 1],
] as const
let failed = 0
for (const [name, r, pass] of results) {
  const good = pass(r)
  if (!good) failed++
  console.log(`${good ? "✓" : "✗"} ${name}  (${reason(r.exit)}, ${r.attempts} attempt${r.attempts === 1 ? "" : "s"}, ${r.ms} ms)`)
}
server.close()
process.exit(failed ? 1 : 0)
