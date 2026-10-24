// What code can decide exactly, it decides: what's still missing, the next step, dates from day
// words, time windows in one vocabulary, whether the photo clashes with the text, and for the
// braider whether her current hair needs a photo and whether hair is included. The model keeps the other judgement calls (a
// consultation, declining or referring).
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
  if (/\bnext\s+(sun|mon|tue|wed|thu|fri|sat)/.test(t)) return null
  const today = new Date(`${receivedAt.slice(0, 10)}T12:00:00Z`)
  const add = (n: number) => { const d = new Date(today); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
  // "This weekend" is the coming Saturday and Sunday, or this one if it's already the weekend;
  // "next weekend" is the one after.
  if (/\bweekend\b/.test(t)) {
    const day = today.getUTCDay()
    const sat = (day === 6 ? 0 : day === 0 ? -1 : 6 - day) + (/\bnext\s+weekend\b/.test(t) ? 7 : 0)
    return [add(sat), add(sat + 1)]
  }
  const found: { at: number; date: string }[] = []
  const words = /\b(today|tonight|tomorrow|tmrw|tmr)\b/g
  for (const m of t.matchAll(words)) found.push({ at: m.index!, date: add(m[1] === 'today' || m[1] === 'tonight' ? 0 : 1) })
  for (const m of t.matchAll(/\b(sun|mon|tue|wed|thu|fri|sat)(?:day|s|sday|nesday|rs|rsday|urs|ursday|urday|ur)?\b/g)) {
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
  // A weekend is two dates, not a window.
  if (/^(this |next |the )?weekend$/.test(s)) return null
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

type PhotoTag = { field: string; tag: string; confidence: number }
const TRUST = 0.6
const TIGHT_TEXTURES = ['4a', '4b', '4c']
const LONG = ['waist', 'butt']

// Fields where a clash between photo and text becomes a question (rule 11 for every stylist).
const CLASH: Record<StylistKey, string[]> = { braider: ['length', 'ends'], colourist: ['length', 'shade'], nails: ['length'] }
const CODE_QUESTIONS = ['length_photo', 'confirm_length', 'confirm_ends', 'confirm_shade', 'consultation', 'design_photo', 'nail_photo']

// Rule 11, exactly: a trusted photo tag that disagrees with what the client wrote becomes a
// question (text still wins on the sheet). And the braider's rule 2: short 4a-4c hair going waist
// length or longer needs a photo of her current hair before a quote.
function photoQuestions(stylist: StylistKey, brief: Record<string, any>, photo: PhotoTag[]): string[] {
  const look = brief.look ?? {}
  const evidence = brief.evidence ?? {}
  const out: string[] = []
  if (stylist === 'braider' && TIGHT_TEXTURES.includes(brief.hair?.texture) && brief.hair?.current === 'short' && LONG.includes(look.length)) out.push('length_photo')
  for (const f of CLASH[stylist]) {
    const said = evidence[`look.${f}`]
    if (typeof said !== 'string' || !said || said === '[photo]' || !look[f] || look[f] === 'unknown') continue
    const seen = photo.filter((t) => t.field === f && t.confidence >= TRUST).sort((a, b) => b.confidence - a.confidence)[0]
    if (seen && seen.tag !== look[f]) out.push(`confirm_${f}`)
  }
  return out
}

// Rule 3: whether hair is included follows the client's own words. Clear wording decides it; anything
// else keeps what the brief already says (an earlier message in the thread may have said it).
const HAIR_YES = /hair (is )?incl|incl(uding|\.)? (the )?hair|(can|could|will|do) (u|you) (provide|bring|supply|get) (the )?hair|you provide (the )?hair|with hair included/i
const HAIR_NO = /(my|me) own hair|got (my )?(own )?hair|(i'?ll|i will|i can|i'm) (bring|buy)(ing)? (the |my )?hair|bringing (the |my )?hair|have (the |my )?hair already|hair not included|without hair/i
export function hairIncluded(text: string): 'yes' | 'no' | null {
  const yes = HAIR_YES.test(text)
  const no = HAIR_NO.test(text)
  return yes === no ? null : yes ? 'yes' : 'no'
}

// Her other rules that follow from the words alone. Each was checked against every label she has
// written (training sets and saved corrections) before it was trusted here.
const CHILD = /\b(my|for (my|her|his)) (son|daughter|kid|kids|child|little one|niece|nephew)\b|\b(son|daughter|niece|nephew)('s| is)? (is )?\d{1,2}\b|\b(he|she)('s| is) (only )?\d{1,2}\b|\bdo (u|you) do kids\b/i
const OTHER_SALON = /(from|at|by) (another|a different|other|somewhere|some other) (place|salon|shop)|somewhere else|another salon/i
const OWN_WORK = /(they'?re|they are|it'?s|it was|were|was) (done )?(from|by|with) you|(you|u) did (them|it|my)|did them with you|done (by|with) you/i
const DESIGN = /pinterest|tiktok|instagram|insta\b|this design|saw (it|this) on/i
const BITTEN = /\bbite\b|\bbitten\b|\bbiting\b|very short nails|really short nails/i
const UNWELL = /\b(green|yellow)\b.*\bnail|\bnail.*\b(green|yellow)\b|infect|lifting.*discolou?r|discolou?r.*lifting/i
const EXTENSIONS = ['acrylic_full_set', 'gel_extensions']

function wordRules(stylist: StylistKey, brief: Record<string, any>, text: string): string[] {
  const asks: string[] = []
  if (stylist === 'braider') {
    // Rule 8: wig installs are declined. Rule 7: a child's hair is referred elsewhere.
    if (brief.service === 'wig_install') brief.next_action = 'decline'
    else if (CHILD.test(text)) brief.next_action = 'refer'
    // Those are her only reasons to turn a braiding DM away; settle() works out the real next step.
    else if (brief.next_action === 'decline' || brief.next_action === 'refer') brief.next_action = 'ask'
  }
  if (stylist === 'colourist') {
    // Rule 15: box-dyed or lightened hair needs a consultation first, roots and toners excepted.
    const history = brief.look?.history
    if ((history === 'box_dye' || history === 'previously_lightened') && brief.service !== 'root_touch_up' && brief.service !== 'toner') asks.push('consultation')
  }
  if (stylist === 'nails') {
    const look = (brief.look ??= {})
    // Rule 20: ballerina means coffin.
    if (/ballerina/i.test(text)) look.shape = 'coffin'
    // Rule 17: who did the product decides the soak-off.
    if (OWN_WORK.test(text)) brief.removal = 'own_work'
    else if (OTHER_SALON.test(text)) brief.removal = 'other_salon'
    // Rule 21: an infill more than three weeks after the set is a new full set.
    const weeks = text.match(/(\d+)\s*(weeks?|wks?)\s*ago/i)
    if (brief.service === 'acrylic_infill' && weeks && Number(weeks[1]) > 3) brief.service = 'acrylic_full_set'
    // Rules 22 and 18: a design from social needs its photo; bitten nails need a photo before extensions.
    if (DESIGN.test(text)) asks.push('design_photo')
    if (BITTEN.test(text) && EXTENSIONS.includes(brief.service)) asks.push('nail_photo')
    // Rule 19: possible infection is never booked; she refers them kindly.
    if (UNWELL.test(text)) brief.next_action = 'refer'
  }
  return asks
}

// Everything code decides for a fresh draft: dates, window, then missing and next step.
// thread is the whole conversation so far: her word rules hold for anything said in it ("it's for my
// son" still applies to "how much?"), while dates come from the newest message alone.
export function decide(stylist: StylistKey, brief: Record<string, any>, dm: { text: string; received_at: string; thread?: string; photo?: { reader_output?: PhotoTag[] } | null }): void {
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
  if (stylist === 'braider') {
    const said = hairIncluded(dm.text)
    if (said) brief.hair_included = said
  }
  const asks = wordRules(stylist, brief, dm.thread ?? dm.text)
  if (brief.next_action !== 'decline' && brief.next_action !== 'refer') {
    const asked = (Array.isArray(brief.missing) ? brief.missing : []).filter((k: string) => !CODE_QUESTIONS.includes(k))
    brief.missing = [...asked, ...asks, ...photoQuestions(stylist, brief, dm.photo?.reader_output ?? [])]
  }
  settle(stylist, brief)
}
