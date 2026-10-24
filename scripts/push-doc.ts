// Uploads a private page (the demo map) to the live app, where /control shows it behind the stylist key.
// The key comes from the Keychain and is never printed.
// Usage: node scripts/push-doc.ts <name> <file.html> [base url]
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const [name, file, base = "https://brief-builder.buy-ea2.workers.dev"] = process.argv.slice(2)
if (!name || !file) throw new Error("Usage: node scripts/push-doc.ts <name> <file.html> [base url]")
const key = execFileSync("security", ["find-generic-password", "-a", process.env.USER ?? "", "-s", "brief-builder-stylist-key", "-w"], { encoding: "utf8" }).trim()
const res = await fetch(`${base}/api/doc/${name}`, { method: "PUT", headers: { "x-stylist-token": key, "content-type": "text/html" }, body: readFileSync(file, "utf8") })
console.log(res.ok ? `${name}: uploaded to ${base}/control` : `${name}: ${res.status} ${await res.text()}`)
if (!res.ok) process.exit(1)
