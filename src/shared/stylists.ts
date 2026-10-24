// Who the demo stylists are, as clients see them. Prices and rules live in data/<id>/profile.json.
export const STYLISTS = {
  braider: { id: "braider", owner: "Amara", name: "Amara Braids", area: "Peckham", craft: "Knotless, box braids, locs, twists and silk presses" },
  colourist: { id: "colourist", owner: "Lou", name: "Lived-in Colour", area: "Dalston", craft: "Balayage, highlights, full colour and toners" },
  nails: { id: "nails", owner: "Jade", name: "Gloss by Jade", area: "Hackney", craft: "BIAB, gel, acrylics and nail art" },
} as const
export type StylistKey = keyof typeof STYLISTS
export const isStylist = (s: string): s is StylistKey => s in STYLISTS

// One DM thread item as every screen sees it.
export type RoomMessage = {
  id: string
  clientId: string
  createdAt: number
  receivedAt: string
  text: string
  // via "fix": the stylist corrected this on a photo that looked like this one.
  photoTags: { field: string; tag: string; confidence: number; via?: "fix" }[] | null
  // Ids of photos the client attached, served by /api/room/<stylist>/image/<id>.
  images: string[]
  status: "drafting" | "drafted" | "failed" | "replied"
  brief: Record<string, any> | null
  corrected: Record<string, any> | null
  changed: string[]
  reply: string | null
  requestId: string | null
  ms: number | null
  correctionsUsed: number
  guarded: string[]
  // The same DM answered by the plain model without this stylist's fixes, for comparison.
  // Never recorded by Mubit, so it can't train anything.
  baseline: { reply: string; nextAction: string; ms: number } | null
  // True while the reply is being re-drafted from the stylist's corrected brief.
  redrafting: boolean
  // How much of the draft she rewrote before sending, 0 (sent as drafted) to 1, and the price
  // the sent reply was based on, so a later fix can offer the client a correction.
  editShare: number | null
  sentPrice: number | null
  // Messages she sent after the reply, such as a price correction.
  extra: string[]
}

export type RoomEvent = { type: "message"; message: RoomMessage } | { type: "reset" }
