// Who the demo stylists are, as clients see them. Prices and rules live in data/<id>/profile.json.
export const STYLISTS = {
  braider: { id: "braider", name: "Amara Braids", area: "Peckham", craft: "Knotless, box braids, locs, twists and silk presses" },
  colourist: { id: "colourist", name: "Lived-in Colour", area: "Dalston", craft: "Balayage, highlights, full colour and toners" },
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
  photoTags: { field: string; tag: string; confidence: number }[] | null
  status: "drafting" | "drafted" | "failed" | "replied"
  brief: Record<string, any> | null
  corrected: Record<string, any> | null
  changed: string[]
  reply: string | null
  requestId: string | null
  ms: number | null
  correctionsUsed: number
  guarded: string[]
}

export type RoomEvent = { type: "message"; message: RoomMessage } | { type: "reset" }
