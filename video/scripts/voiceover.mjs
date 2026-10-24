// The film's narration: Jessa (ElevenLabs eleven_v3) reads voiceover.json in one take, which is cut
// into lines at ElevenLabs' own character timings, then mixed into public/vo/jessa/track.wav (the
// films) and story.wav (the 60-second cut), each line at its time and faded so no edit clicks.
// The approved take's line 11 has its number ("eighty-five") spliced in from a short second read; recording a new
// take replaces the whole read, so only do it to change the script.
// The key comes from the Keychain (service "elevenlabs-api-key") and is never printed.
// Usage: node scripts/voiceover.mjs [--take]   (without --take, re-mixes the recorded lines)
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

const VOICE = "yj30vwTGJxSHezdAGsv9" // Jessa: easygoing and effortless
const MODEL = "eleven_v3"
const lines = JSON.parse(readFileSync(new URL("../voiceover.json", import.meta.url), "utf8"))
const story = JSON.parse(readFileSync(new URL("../voiceover-vertical.json", import.meta.url), "utf8"))
const dir = new URL("../public/vo/jessa/", import.meta.url)
mkdirSync(dir, { recursive: true })
const clip = (i) => new URL(`${String(i).padStart(2, "0")}.wav`, dir).pathname

if (process.argv.includes("--take")) {
  const key = execFileSync("security", ["find-generic-password", "-s", "elevenlabs-api-key", "-w"], { encoding: "utf8" }).trim()
  const text = lines.map((l) => l.text).join("\n\n")
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  })
  if (!res.ok) throw new Error(`take: ${res.status} ${(await res.text()).slice(0, 200)}`)
  const { audio_base64, alignment } = await res.json()
  if (alignment.characters.length !== text.length) throw new Error("The timings don't line up with the script")
  const take = new URL("take.mp3", dir).pathname
  writeFileSync(take, Buffer.from(audio_base64, "base64"))
  let offset = 0
  for (const [i, line] of lines.entries()) {
    const start = alignment.character_start_times_seconds[offset]
    const end = alignment.character_end_times_seconds[offset + line.text.length - 1]
    const next = alignment.character_start_times_seconds[offset + line.text.length + 2] ?? end + 1
    offset += line.text.length + 2
    // A breath of room either side, never into the next line.
    const from = Math.max(0, start - 0.06)
    const to = Math.min(end + 0.3, next - 0.05)
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", take, "-ss", from.toFixed(3), "-to", to.toFixed(3), clip(i)])
    const room = (lines[i + 1]?.at ?? 119) - line.at
    console.log(`${String(i).padStart(2, "0")}  ${(to - from).toFixed(1)}s of ${room.toFixed(1)}s${to - from > room ? "  ← runs into the next line" : ""}`)
  }
}

// Each clip faded at both ends (and cut short if asked), placed at its time, mixed into one track.
function mix(entries, seconds, out) {
  const filters = entries.map((e, i) => `[${i}:a]aresample=44100,${e.until ? `atrim=end=${e.until},` : ""}afade=t=in:d=0.02,areverse,afade=t=in:d=0.06,areverse,adelay=${Math.round(e.at * 1000)}:all=1[a${i}]`)
  const all = `${entries.map((_, i) => `[a${i}]`).join("")}amix=inputs=${entries.length}:normalize=0:duration=longest,apad=whole_dur=${seconds}[out]`
  execFileSync("ffmpeg", ["-y", "-v", "error", ...entries.flatMap((e) => ["-i", clip(e.line)]), "-filter_complex", [...filters, all].join(";"), "-map", "[out]", "-ac", "1", new URL(out, dir).pathname])
  console.log(`mixed public/vo/jessa/${out}`)
}
mix(lines.map((l, i) => ({ ...l, line: i })), 119, "track.wav")
mix(story, 60, "story.wav")
