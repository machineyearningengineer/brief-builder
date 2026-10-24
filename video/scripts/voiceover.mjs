// Narrates voiceover.json with ElevenLabs, one clip per line, into public/vo/<voice>/.
// The key comes from the Keychain (service "elevenlabs-api-key") and is never printed.
// Usage: node scripts/voiceover.mjs [nathaniel|lauren|jessica]   then render with --props='{"voice":"nathaniel"}'
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

// Calm voices saved in the ElevenLabs account.
const VOICES = { nathaniel: "AeRdCCKzvd23BpJoofzx", lauren: "v8DWAeuEGQSfwxqdH9t2", jessica: "S1eyUQsxwzBMtM9piGTQ" }
const name = process.argv[2] ?? "nathaniel"
const voice = VOICES[name]
if (!voice) throw new Error(`Unknown voice ${name}; one of ${Object.keys(VOICES).join(", ")}`)

const key = execFileSync("security", ["find-generic-password", "-s", "elevenlabs-api-key", "-w"], { encoding: "utf8" }).trim()
const lines = JSON.parse(readFileSync(new URL("../voiceover.json", import.meta.url), "utf8"))
const api = (path, init = {}) => fetch(`https://api.elevenlabs.io${path}`, { ...init, headers: { "xi-api-key": key, "content-type": "application/json", ...init.headers } })
const dir = new URL(`../public/vo/${name}/`, import.meta.url)
mkdirSync(dir, { recursive: true })

async function speak(i, speed) {
  const res = await api(`/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    body: JSON.stringify({
      text: lines[i].text,
      model_id: "eleven_multilingual_v2",
      // Neighbouring lines keep the read sounding like one take.
      previous_text: lines[i - 1]?.text,
      next_text: lines[i + 1]?.text,
      voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0, use_speaker_boost: true, speed },
    }),
  })
  if (!res.ok) throw new Error(`line ${i}: ${res.status} ${(await res.text()).slice(0, 200)}`)
  const file = new URL(`${String(i).padStart(2, "0")}.mp3`, dir)
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file.pathname], { encoding: "utf8" }))
}

for (const i of lines.keys()) {
  // Each clip has to finish before the next line starts; one that runs over is read a little faster.
  const room = (lines[i + 1]?.at ?? 118) - lines[i].at - 0.2
  let secs = await speak(i, 1)
  let speed = 1
  if (secs > room) {
    speed = Math.min(1.15, Math.round((secs / room) * 1.04 * 100) / 100)
    secs = await speak(i, speed)
  }
  console.log(`${String(i).padStart(2, "0")}  ${secs.toFixed(1)}s of ${room.toFixed(1)}s${speed !== 1 ? `  at ${speed}×` : ""}${secs > room ? "  ← still too long" : ""}`)
}
