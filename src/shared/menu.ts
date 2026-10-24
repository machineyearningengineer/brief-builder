// What a client sees on the stylist's profile: services with prices from the profile, and the
// house rules that affect them, written the way a stylist would say them.
import braiderProfile from '../../data/braider/profile.json'
import colouristProfile from '../../data/colourist/profile.json'
import nailsProfile from '../../data/nails/profile.json'
import type { StylistKey } from './stylists.ts'

export type MenuSection = { title: string; items: { name: string; price: string; note?: string }[] }

const from = (n: number) => `from £${n}`
const b = braiderProfile.prices
const c = colouristProfile.prices
const n = nailsProfile.prices

export const MENU: Record<StylistKey, MenuSection[]> = {
  braider: [
    {
      title: 'Braids and twists',
      items: [
        { name: 'Knotless', price: from(b.base.knotless + b.length.shoulder + b.size.jumbo), note: 'Medium, mid-back £140' },
        { name: 'Box braids', price: from(b.base.box_braids + b.length.shoulder + b.size.jumbo), note: 'Medium, mid-back £120' },
        { name: 'French curls', price: from(b.base.french_curls + b.length.shoulder + b.size.jumbo), note: 'Medium, mid-back £150' },
        { name: 'Twists', price: from(b.base.twists + b.length.shoulder + b.size.jumbo), note: 'Passion, Senegalese' },
        { name: 'Cornrows', price: from(b.fixed.cornrows_straight_back), note: `Designs £${b.fixed.cornrows_designs}` },
      ],
    },
    {
      title: 'Locs and finishing',
      items: [
        { name: 'Retwist', price: `£${b.fixed.locs_retwist}` },
        { name: 'Starter locs', price: `£${b.fixed.loc_install}` },
        { name: 'Silk press', price: `£${b.fixed.silk_press}` },
        { name: 'Sew-in', price: `£${b.fixed.sew_in}` },
      ],
    },
    {
      title: 'Add-ons',
      items: [
        { name: 'Boho curls throughout', price: `+£${b.ends.boho_throughout}` },
        { name: 'Curly ends', price: `+£${b.ends.curly_ends}` },
        { name: 'Hair provided by me', price: `+£${b.hair_provided_by_stylist}` },
      ],
    },
  ],
  colourist: [
    {
      title: 'Colour',
      items: [
        { name: 'Balayage', price: from(c.base.balayage), note: 'Toner included' },
        { name: 'Highlights', price: from(c.base.highlights), note: 'Toner included' },
        { name: 'Babylights', price: from(c.base.babylights) },
        { name: 'Full colour', price: from(c.base.full_colour) },
      ],
    },
    {
      title: 'Upkeep',
      items: [
        { name: 'Root touch-up', price: `£${c.fixed.root_touch_up}` },
        { name: 'Toner refresh', price: `£${c.fixed.toner}` },
        { name: 'Colour correction', price: 'after a free consult' },
      ],
    },
  ],
  nails: [
    {
      title: 'Hands',
      items: [
        { name: 'BIAB', price: `£${n.base.biab}`, note: 'On your natural nails' },
        { name: 'Gel manicure', price: `£${n.base.gel_manicure}` },
        { name: 'Classic manicure', price: `£${n.fixed.classic_manicure}` },
      ],
    },
    {
      title: 'Extensions',
      items: [
        { name: 'Acrylic full set', price: from(n.base.acrylic_full_set), note: `Long +£${n.length.long}` },
        { name: 'Gel extensions', price: from(n.base.gel_extensions) },
        { name: 'Acrylic infill', price: from(n.base.acrylic_infill), note: 'Within 3 weeks of your set' },
      ],
    },
    {
      title: 'Feet and finishes',
      items: [
        { name: 'Gel pedicure', price: `£${n.fixed.gel_pedicure}` },
        { name: 'French tip', price: `+£${n.finish.french}` },
        { name: 'Chrome', price: `+£${n.finish.chrome}` },
        { name: 'Nail art', price: `from +£${n.art.accent_nails}`, note: `Every nail +£${n.art.full_art}` },
        { name: "Soak-off of another salon's work", price: `+£${n.soak_off_other_salon}` },
      ],
    },
  ],
}

// Photos of the stylist's own work, served from /public/work.
export const WORK: Record<StylistKey, { src: string; alt: string }[]> = {
  braider: [
    { src: '/work/knotless.webp', alt: 'Waist-length knotless braids with triangle parts' },
    { src: '/work/cornrows.webp', alt: 'Cornrows' },
    { src: '/work/soft-locs.webp', alt: 'Soft locs' },
  ],
  colourist: [{ src: '/work/curls.webp', alt: 'Copper colour on 3c curls' }],
  nails: [],
}

export const POLICIES: Record<StylistKey, string[]> = {
  braider: [
    "Prices don't include hair. I can bring it for £15.",
    'Short 4c hair going waist length or longer? Send me a photo of your hair first.',
    "I'll offer you a slot by message. Nothing is booked until we agree a time.",
    "I don't do wig installs or children's hair.",
  ],
  colourist: [
    'New clients need a patch test at least 48 hours before.',
    'Box-dyed or bleached hair starts with a free 15-minute consultation.',
    'Going from dark to blonde can take two sessions.',
    "I don't colour under-16s.",
  ],
  nails: [
    "Got gel or acrylic on from somewhere else? Soak-off is £10. Taking off my own work is free.",
    "Infills are within 3 weeks of your set. After that it's a new full set.",
    'Bitten nails? Send me a photo of them first.',
    "I don't do under-12s.",
  ],
}
