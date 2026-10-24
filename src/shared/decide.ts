// What code can decide exactly, it decides: what's still missing, the next step, dates from day
// words, and time windows in one vocabulary. The model keeps the judgement calls (a photo of
// current hair, a consultation, a clash between photo and text, declining or referring).
import type { StylistKey } from './stylists.ts'

// Missing keys only the model can judge, from her rules and the photo.
const JUDGEMENT = ['length_photo', 'consultation', 'confirm_length', 'confirm_ends', 'confirm_shade', 'nail_photo', 'design_photo']
// Order of importance, as her instructions list it.
const ORDER = ['service', 'length_photo', 'consultation', 'confirm_length', 'confirm_ends', 'confirm_shade', 'nail_photo', 'design_photo', 'length', 'size', 'shade', 'shape']

// Services priced by look, and the look fields their price needs.
const NEEDS: Record<StylistKey, { priced: string[]; fields: string[] }> = {
  braider: { priced: ['knotless', 'box_braids', 'french_curls', 'twists'], fields: ['length', 'size'] },
  colourist: { priced: ['balayage', 'highlights', 'babylights', 'full_colour'], fields: ['length', 'shade'] },
  nails: { priced: [], fields: [] },
}

// Missing and next step from the brief alone. Used on every draft and whenever she edits a field.
export function settle(stylist: StylistKey, brief: Record<string, any>): void {
  if (brief.next_action === 'decline' || brief.next_action === 'refer') {
    brief.missing = []
    return
  }
  const look = brief.look ?? {}
  const keep: string[] = (Array.isArray(brief.missing) ? brief.missing : []).filter((k: string) => JUDGEMENT.includes(k))
  const missing = new Set(keep)
  if (brief.service === 'unknown' && !missing.has('consultation')) missing.add('service')
  const need = NEEDS[stylist]
  // A consultation comes before any detail; otherwise a priced service needs its look fields.
  if (!missing.has('consultation') && (brief.service === 'unknown' || need.priced.includes(brief.service))) {
    for (const f of need.fields) if (look[f] === 'unknown' && !missing.has(`confirm_${f}`)) missing.add(f)
  }
  brief.missing = ORDER.filter((k) => missing.has(k))
  const when = brief.when ?? {}
  brief.next_action = brief.missing.length ? 'ask' : (when.dates?.length || when.window) ? 'offer_slots' : 'quote'
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const iso = (d: Date) => d.toISOString().slice(0, 10)

// Dates the message names, in the order it names them, resolved against when it arrived.
// A day name means the next one to come (sent on a Saturday, "sat" is next Saturday).
// Returns null when it names none, or says something only a person should read ("next fri").
export function resolveDates(text: string, receivedAt: string): string[] | null {
  const t = text.toLowerCase()
  if (/\bnext\s+(sun|mon|tue|wed|thu|fri|sat)|\bweekend\b/.test(t)) return null
  const today = new Date(`${receivedAt.slice(0, 10)}T12:00:00Z`)
  const add = (n: number) => { const d = new Date(today); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
  const found: { at: number; date: string }[] = []
  const words = /\b(today|tonight|tomorrow|tmrw|tmr)\b/g
  for (const m of t.matchAll(words)) found.push({ at: m.index!, date: add(m[1] === 'today' || m[1] === 'tonight' ? 0 : 1) })
  for (const m of t.matchAll(/\b(sun|mon|tue|wed|thu|fri|sat)(?:day|s|nesday|urs|ursday|urday|ur)?\b/g)) {
    const gap = (DAYS.indexOf(m[1]) - today.getUTCDay() + 7) % 7
    found.push({ at: m.index!, date: add(gap === 0 ? 7 : gap) })
  }
  for (const m of t.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/g)) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), MONTHS.indexOf(m[2]), Number(m[1]), 12))
    if (d < today) d.setUTCFullYear(d.getUTCFullYear() + 1)
    found.push({ at: m.index!, date: iso(d) })
  }
  // "sunday the 1st nov" is one day: a weekday right before an explicit date belongs to it.
  const explicit = found.filter((f) => /\d/.test(t.slice(f.at, f.at + 3)))
  for (const e of explicit) for (let i = found.length - 1; i >= 0; i--) if (found[i].at < e.at && e.at - found[i].at <= 14 && !/\d/.test(t.slice(found[i].at, found[i].at + 3))) found.splice(i, 1)
  if (!found.length) return null
  return [...new Set(found.sort((a, b) => a.at - b.at).map((f) => f.date))]
}

// Said to the model before it drafts, so the reply names the same days the sheet will show.
export function datesNote(text: string, receivedAt: string): string {
  const dates = resolveDates(text, receivedAt)
  if (!dates) return ""
  const named = dates.map((d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }))
  return `\n\nThe days this DM names are ${named.join(" and ")}. Use these dates in the brief and the reply.`
}

// Time windows in one vocabulary, so "after work" and "any weekday after 5" mean the same thing.
export function canonicalWindow(w: unknown): string | null {
  if (typeof w !== 'string' || !w.trim()) return null
  const s = w.toLowerCase().trim()
  if (/asap|soon as|soonest|earliest|urgent/.test(s)) return 'asap'
  const week = s.match(/week of (\d{4}-\d{2}-\d{2})/)
  if (week) return `week of ${week[1]}`
  if (/after (work|5|5pm|17:00|17)\b|after 5|weekdays? after/.test(s)) return 'weekdays after 17:00'
  const clock = s.match(/^(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/)
  if (clock) {
    let h = Number(clock[1]) % 12
    if (clock[3] === 'pm' || (!clock[3] && h > 0 && h < 8)) h += 12
    if (clock[3] === 'am' || clock[3] === 'pm' || clock[2] || Number(clock[1]) > 12) return `${String(h).padStart(2, '0')}:${clock[2] ?? '00'}`
  }
  if (/morning|\bam\b/.test(s)) return 'morning'
  if (/afternoon|lunch/.test(s)) return 'afternoon'
  if (/evening|night|\bpm\b/.test(s)) return 'evening'
  return s
}

// Everything code decides for a fresh draft: dates, window, then missing and next step.
export function decide(stylist: StylistKey, brief: Record<string, any>, dm: { text: string; received_at: string }): void {
  brief.when ??= { dates: [], window: null }
  const dates = resolveDates(dm.text, dm.received_at)
  if (dates) brief.when.dates = dates
  brief.when.window = canonicalWindow(brief.when.window)
  // "next week anytime" is a week, not seven dates: the week starting next Monday.
  if (!dates && /\bnext week\b/i.test(dm.text)) {
    const d = new Date(`${dm.received_at.slice(0, 10)}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7))
    brief.when = { dates: [], window: `week of ${iso(d)}` }
  }
  settle(stylist, brief)
}
