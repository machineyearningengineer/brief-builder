// Narrates voiceover.json with ElevenLabs, then mixes the lines into one track,
// public/vo/<voice>/track.wav, each line placed at its time and faded in and out so no edit clicks.
// --take reads the whole script in one go and cuts it into lines, so the voice never drifts between
// separately recorded lines; without it each line is its own recording.
// The key comes from the Keychain (service "elevenlabs-api-key") and is never printed.
// Usage: node scripts/voiceover.mjs [voice] [model]   then render with --props='{"voice":"nathaniel"}'
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"

// Calm voices: saved in the account, or from the shared library.
const VOICES = {
  nathaniel: "AeRdCCKzvd23BpJoofzx", lauren: "v8DWAeuEGQSfwxqdH9t2", jessica: "S1eyUQsxwzBMtM9piGTQ",
  jessa: "yj30vwTGJxSHezdAGsv9", lily: "qBDvhofpxp92JgXJxDjB", samantha: "uIZsnBL0YK1S5j69bAih",
}
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"))
const name = args[0] ?? "nathaniel"
const voice = VOICES[name]
if (!voice) throw new Error(`Unknown voice ${name}; one of ${Object.keys(VOICES).join(", ")}`)
// eleven_v3 sounds more natural but reads each line on its own, without its neighbours.
const model = args[1] ?? "eleven_multilingual_v2"

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
      model_id: model,
      // Neighbouring lines keep the read sounding like one take.
      ...(model === "eleven_v3" ? {} : { previous_text: lines[i - 1]?.text, next_text: lines[i + 1]?.text }),
      voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0, use_speaker_boost: true, speed },
    }),
  })
  if (!res.ok) throw new Error(`line ${i}: ${res.status} ${(await res.text()).slice(0, 200)}`)
  const file = new URL(`${String(i).padStart(2, "0")}.mp3`, dir)
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  rmSync(new URL(`${String(i).padStart(2, "0")}.wav`, dir), { force: true })
  return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file.pathname], { encoding: "utf8" }))
}

const clip = (i, ext) => new URL(`${String(i).padStart(2, "0")}.${ext}`, dir).pathname

if (process.argv.includes("--take")) {
  const text = lines.map((l) => l.text).join("\n\n")
  const res = await api(`/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
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
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", take, "-ss", from.toFixed(3), "-to", to.toFixed(3), clip(i, "wav")])
    rmSync(clip(i, "mp3"), { force: true })
    const room = (lines[i + 1]?.at ?? 119) - line.at
    console.log(`${String(i).padStart(2, "0")}  ${(to - from).toFixed(1)}s of ${room.toFixed(1)}s${to - from > room ? "  ← runs into the next line" : ""}`)
  }
}

// --mix re-places the clips already recorded, after a timing change, without recording again.
// --only=11,13 records just those lines again.
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",").map(Number)
if (!process.argv.includes("--mix") && !process.argv.includes("--take")) for (const i of lines.keys()) {
  if (only && !only.includes(i)) continue
  // Each clip has to finish before the next line starts; one that runs over is read a little faster.
  const room = (lines[i + 1]?.at ?? 119) - lines[i].at - 0.2
  let secs = await speak(i, 1)
  let speed = 1
  if (secs > room) {
    speed = Math.min(1.15, Math.round((secs / room) * 1.04 * 100) / 100)
    secs = await speak(i, speed)
  }
  console.log(`${String(i).padStart(2, "0")}  ${secs.toFixed(1)}s of ${room.toFixed(1)}s${speed !== 1 ? `  at ${speed}×` : ""}${secs > room ? "  ← still too long" : ""}`)
}

// One continuous track: each clip faded at both ends and placed at its time.
const clips = [...lines.keys()].map((i) => (existsSync(clip(i, "wav")) ? clip(i, "wav") : clip(i, "mp3")))
const filters = lines.map((l, i) => `[${i}:a]aresample=44100,afade=t=in:d=0.02,areverse,afade=t=in:d=0.06,areverse,adelay=${Math.round(l.at * 1000)}:all=1[a${i}]`)
const mix = `${lines.map((_, i) => `[a${i}]`).join("")}amix=inputs=${lines.length}:normalize=0:duration=longest,apad=whole_dur=119[out]`
execFileSync("ffmpeg", ["-y", "-v", "error", ...clips.flatMap((c) => ["-i", c]), "-filter_complex", [...filters, mix].join(";"), "-map", "[out]", "-ac", "1", new URL("track.wav", dir).pathname])
console.log(`track: public/vo/${name}/track.wav`)

// The story cut reuses the same clips, fewer of them, at its own times (voiceover-vertical.json).
const story = JSON.parse(readFileSync(new URL("../voiceover-vertical.json", import.meta.url), "utf8"))
const storyFilters = story.map((s, i) => `[${i}:a]aresample=44100,${s.until ? `atrim=end=${s.until},` : ""}afade=t=in:d=0.02,areverse,afade=t=in:d=0.06,areverse,adelay=${Math.round(s.at * 1000)}:all=1[a${i}]`)
const storyMix = `${story.map((_, i) => `[a${i}]`).join("")}amix=inputs=${story.length}:normalize=0:duration=longest,apad=whole_dur=59[out]`
execFileSync("ffmpeg", ["-y", "-v", "error", ...story.flatMap((s) => ["-i", clips[s.line]]), "-filter_complex", [...storyFilters, storyMix].join(";"), "-map", "[out]", "-ac", "1", new URL("story.wav", dir).pathname])
console.log(`story: public/vo/${name}/story.wav`)
