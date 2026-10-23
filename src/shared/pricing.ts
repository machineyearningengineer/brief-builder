// Prices from each stylist's own list. The service sheet shows these, so a price on screen
// always comes from the list, never from the model.
import braiderProfile from '../../data/braider/profile.json'
import colouristProfile from '../../data/colourist/profile.json'
import type { StylistKey } from './stylists.ts'

type Look = Record<string, unknown>
const BRAID_PRICED = new Set(['knotless', 'box_braids', 'french_curls', 'twists'])
const COLOUR_PRICED = new Set(['balayage', 'highlights', 'babylights', 'full_colour'])

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
  const p = colouristProfile.prices as any
  const s = brief.service
  if (COLOUR_PRICED.has(s)) {
    const length = look.length !== 'unknown' ? (look.length as string) : 'shoulder'
    return { amount: (p.base[s] + p.length[length]) * (brief.people || 1), from: look.length === 'unknown', note: s === 'balayage' || s === 'highlights' ? 'toner included' : '' }
  }
  if (s in p.fixed) return { amount: p.fixed[s], from: false, note: '' }
  return null
}
