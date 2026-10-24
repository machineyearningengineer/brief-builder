// Narrates voiceover.json with ElevenLabs, one clip per line, into public/vo/.
// The key comes from the Keychain (service "elevenlabs-api-key") and is never printed.
// Usage: node scripts/voiceover.mjs [voice id]   then render with --props='{"voice":true}'
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

const key = execFileSync("security", ["find-generic-password", "-s", "elevenlabs-api-key", "-w"], { encoding: "utf8" }).trim()
const lines = JSON.parse(readFileSync(new URL("../voiceover.json", import.meta.url), "utf8"))
const api = (path, init = {}) => fetch(`https://api.elevenlabs.io${path}`, { ...init, headers: { "xi-api-key": key, "content-type": "application/json", ...init.headers } })

// A warm British voice unless one is named.
let voice = process.argv[2]
if (!voice) {
  const { voices } = await (await api("/v1/voices")).json()
  const pick = voices.find((v) => /brit/i.test(v.labels?.accent ?? "") && /female/i.test(v.labels?.gender ?? "")) ?? voices[0]
  voice = pick.voice_id
  console.log(`voice: ${pick.name}`)
}

mkdirSync(new URL("../public/vo/", import.meta.url), { recursive: true })
for (const [i, line] of lines.entries()) {
  const res = await api(`/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    body: JSON.stringify({
      text: line.text,
      model_id: "eleven_multilingual_v2",
      // Neighbouring lines keep the read sounding like one take.
      previous_text: lines[i - 1]?.text,
      next_text: lines[i + 1]?.text,
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
    }),
  })
  if (!res.ok) throw new Error(`line ${i}: ${res.status} ${(await res.text()).slice(0, 200)}`)
  const file = new URL(`../public/vo/${String(i).padStart(2, "0")}.mp3`, import.meta.url)
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  // Each clip has to finish before the next line starts.
  const secs = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file.pathname], { encoding: "utf8" }))
  const room = (lines[i + 1]?.at ?? 118) - line.at
  console.log(`${String(i).padStart(2, "0")}  ${secs.toFixed(1)}s of ${room.toFixed(1)}s${secs > room ? "  ← too long" : ""}`)
}
