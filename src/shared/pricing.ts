// Prices from each stylist's own list. The service sheet shows these, so a price on screen
// always comes from the list, never from the model.
import braiderProfile from '../../data/braider/profile.json'
import colouristProfile from '../../data/colourist/profile.json'
import nailsProfile from '../../data/nails/profile.json'
import type { StylistKey } from './stylists.ts'

type Look = Record<string, unknown>
const BRAID_PRICED = new Set(['knotless', 'box_braids', 'french_curls', 'twists'])
const COLOUR_PRICED = new Set(['balayage', 'highlights', 'babylights', 'full_colour'])
const NAIL_EXTENSIONS = new Set(['acrylic_full_set', 'gel_extensions', 'acrylic_infill'])

export type Estimate = { amount: number; from: boolean; note: string } | null

export function estimate(stylist: StylistKey, brief: Record<string, any> | null): Estimate {
  if (!brief) return null
  const look: Look = brief.look ?? {}
  if (stylist === 'braider') {
    const p = braiderProfile.prices as any
    const s = brief.service
    if (BRAID_PRICED.has(s)) {
      const length = look.length !== 'unknown' ? (look.length as string) : 'mid_back'
      const size = look.size !== 'unknown' ? (look.size as string) : 'medium'
      const ends = s !== 'french_curls' && typeof look.ends === 'string' ? (p.ends[look.ends] ?? 0) : 0
      const amount = (p.base[s] + p.length[length] + p.size[size] + ends) * (brief.people || 1)
      const hair = brief.hair_included === 'yes' ? ` plus £${p.hair_provided_by_stylist * (brief.people || 1)} for hair` : ', hair not included'
      return { amount, from: look.length === 'unknown' || look.size === 'unknown', note: `${brief.people > 1 ? `for ${brief.people}` : ''}${hair}`.replace(/^, /, '') }
    }
    if (s === 'cornrows') return { amount: p.fixed.cornrows_straight_back, from: true, note: `designs £${p.fixed.cornrows_designs}` }
    if (s in p.fixed) return { amount: p.fixed[s], from: false, note: '' }
    return null
  }
  if (stylist === 'nails') {
    const p = nailsProfile.prices as any
    const s = brief.service
    const finish = typeof look.finish === 'string' ? (p.finish[look.finish] ?? 0) : 0
    const art = Array.isArray(look.art) ? look.art.reduce((t: number, a: string) => t + (p.art[a] ?? 0), 0) : 0
    const soak = brief.removal === 'other_salon' ? p.soak_off_other_salon : 0
    const note = brief.removal === 'other_salon' ? `includes £${p.soak_off_other_salon} soak-off` : ''
    const people = brief.people || 1
    if (s in p.base) {
      const length = NAIL_EXTENSIONS.has(s) && look.length !== 'unknown' ? (p.length[look.length as string] ?? 0) : 0
      return { amount: (p.base[s] + length + finish + art + soak) * people, from: NAIL_EXTENSIONS.has(s) && look.length === 'unknown', note }
    }
    if (s in p.fixed) return { amount: (p.fixed[s] + finish + art + soak) * people, from: false, note }
    return null
  }
  const p = colouristProfile.prices as any
  const s = brief.service
  if (COLOUR_PRICED.has(s)) {
    const length = look.length !== 'unknown' ? (look.length as string) : 'shoulder'
    return { amount: (p.base[s] + p.length[length]) * (brief.people || 1), from: look.length === 'unknown', note: s === 'balayage' || s === 'highlights' ? 'toner included' : '' }
  }
  if (s in p.fixed) return { amount: p.fixed[s], from: false, note: '' }
  return null
}

// When the answer is no, the nearest thing she can say yes to, from her own price list.
// Over budget: the fewest, smallest changes that fit. A service she doesn't do: the one she
// offers instead. Health and age referrals have no closest yes on purpose.
export type ClosestYes = { label: string; amount: number | null; change: Record<string, unknown> }

const set = (o: any, path: string, v: unknown) => {
  const keys = path.split('.')
  const last = keys.pop()!
  keys.reduce((x, k) => (x[k] ??= {}), o)[last] = v
}
const apply = (brief: Record<string, any>, change: Record<string, unknown>) => {
  const b = structuredClone(brief)
  for (const [p, v] of Object.entries(change)) set(b, p, v)
  return b
}
const words = (v: string) => v.replaceAll('_', ' ')

const INSTEAD: Partial<Record<StylistKey, Record<string, { service: string; why: string }>>> = {
  braider: { wig_install: { service: 'sew_in', why: 'A sew-in instead of a wig install' } },
  colourist: { colour_correction: { service: 'colour_correction', why: 'Free 15-minute consultation first' } },
}

function candidates(stylist: StylistKey, brief: Record<string, any>): Record<string, unknown>[] {
  const look = brief.look ?? {}
  const out: Record<string, unknown>[] = []
  if (stylist === 'braider') {
    const p = braiderProfile.prices as any
    const lengths = Object.keys(p.length)
    const sizes = Object.keys(p.size)
    const L = lengths.indexOf(look.length)
    const S = sizes.indexOf(look.size)
    for (const [i, l] of lengths.entries()) for (const [j, s] of sizes.entries()) {
      if (l === look.length && s === look.size) continue
      // Shorter or chunkier only: never suggest more work for less money.
      if ((L >= 0 && i > L) || (S >= 0 && j > S)) continue
      const change: Record<string, unknown> = {}
      if (l !== look.length) change['look.length'] = l
      if (s !== look.size) change['look.size'] = s
      out.push(change)
    }
    if (look.ends && look.ends !== 'straight' && look.ends !== 'unknown') out.push({ 'look.ends': 'straight' })
  } else if (stylist === 'colourist') {
    const swap: Record<string, string[]> = { babylights: ['highlights', 'balayage'], balayage: ['highlights'], highlights: [], full_colour: ['root_touch_up'] }
    for (const s of swap[brief.service] ?? []) out.push({ service: s })
  } else {
    const p = nailsProfile.prices as any
    const lengths = Object.keys(p.length)
    const L = lengths.indexOf(look.length)
    const art: string[] = Array.isArray(look.art) ? look.art : []
    const finishes = look.finish && look.finish !== 'plain' && look.finish !== 'unknown' ? [look.finish, 'plain'] : [look.finish]
    const arts = art.length ? [art, []] : [art]
    const lens = NAIL_EXTENSIONS.has(brief.service) && L > 0 ? lengths.slice(0, L + 1).reverse() : [look.length]
    for (const f of finishes) for (const a of arts) for (const l of lens) {
      const change: Record<string, unknown> = {}
      if (f !== look.finish) change['look.finish'] = f
      if (a !== art) change['look.art'] = a
      if (l !== look.length) change['look.length'] = l
      if (Object.keys(change).length) out.push(change)
    }
    if (brief.service === 'gel_extensions') out.push({ service: 'acrylic_full_set' })
    if (brief.service === 'acrylic_full_set' || brief.service === 'gel_extensions') out.push({ service: 'biab', 'look.length': 'unknown' })
  }
  return out
}

function describe(change: Record<string, unknown>, brief: Record<string, any>): string {
  return Object.entries(change).map(([path, v]) => {
    const was = path.split('.').reduce((o: any, k) => o?.[k], brief)
    if (path === 'look.art') return (v as string[]).length ? (v as string[]).map(words).join(', ') : 'no art'
    if (path === 'look.finish' && v === 'plain') return 'plain finish'
    return was && was !== 'unknown' ? `${words(String(v))} instead of ${words(String(was))}` : words(String(v))
  }).join(', ')
}

// How much each kind of change costs the client. Length is the look they asked for, so it moves
// last; a finish or a bit of art is the easiest thing to drop.
const WEIGHT: Record<string, number> = { 'look.art': 0.5, 'look.finish': 0.5, 'look.ends': 0.5, 'look.size': 1, 'look.length': 1.6, service: 2 }
const cost = (change: Record<string, unknown>) => Object.keys(change).reduce((t, k) => t + (WEIGHT[k] ?? 1), 0)

export function closestYes(stylist: StylistKey, brief: Record<string, any> | null): ClosestYes | null {
  if (!brief) return null
  const instead = INSTEAD[stylist]?.[brief.service]
  if (instead && (brief.next_action === 'decline' || brief.next_action === 'refer' || instead.service !== brief.service)) {
    const change = { service: instead.service, next_action: instead.service === brief.service ? 'ask' : 'quote' }
    return { label: instead.why, amount: estimate(stylist, apply(brief, change))?.amount ?? null, change }
  }
  const budget = brief.budget_max_gbp
  const now = estimate(stylist, brief)
  if (typeof budget !== 'number' || !now || now.amount <= budget) return null
  // The cheapest change for the client first, then the dearest option that still fits.
  const fits = candidates(stylist, brief)
    .map((change) => ({ change, amount: estimate(stylist, apply(brief, change))?.amount }))
    .filter((c): c is { change: Record<string, unknown>; amount: number } => typeof c.amount === 'number' && c.amount <= budget)
    .sort((a, b) => cost(a.change) - cost(b.change) || b.amount - a.amount)
  const best = fits[0]
  if (!best) return null
  return { label: `Within £${budget}: ${describe(best.change, brief)}`, amount: best.amount, change: best.change }
}
