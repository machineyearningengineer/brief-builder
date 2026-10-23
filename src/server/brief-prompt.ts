// Builds the instructions and the user message for one brief call.
//
// Mubit groups calls into one task when their instructions, model and output format match
// exactly, so the instructions depend only on the stylist's profile and tag list. Everything
// that changes per DM (its text, received time, photo tags) goes in the user message.

type Profile = { id: string; persona: string; currency: string; prices: unknown; house_rules: { id: number; rule: string }[] }
type Tags = { trust_threshold: number; fields: Record<string, string[]> }
export type ReaderTag = { field: string; tag: string; confidence: number }

const SHAPES: Record<string, string> = {
  braider: `{"service", "look": {"length", "size", "ends", "colour", "extras": []}, "hair": {"texture", "current"}, "hair_included", "budget_max_gbp", "when": {"dates": [], "window"}, "area", "people", "missing": [], "next_action", "reply_draft", "evidence": {}}`,
  colourist: `{"service", "look": {"length", "shade", "history"}, "hair": {"texture", "current"}, "patch_test", "budget_max_gbp", "when": {"dates": [], "window"}, "area", "people", "missing": [], "next_action", "reply_draft", "evidence": {}}`,
}

export function instructionsFor(profile: Profile, tags: Tags): string {
  const allowed = Object.entries(tags.fields).map(([f, vs]) => `- ${f}: ${vs.join(", ")}, or "unknown"`).join("\n")
  const rules = profile.house_rules.map((r) => `${r.id}. ${r.rule}`).join("\n")
  return `You turn a client's DM to a stylist into a booking brief, as JSON only.

The stylist: ${profile.persona}

House rules:
${rules}

Price list (${profile.currency}):
${JSON.stringify(profile.prices)}

Allowed values:
${allowed}
- hair.texture: 1, 2, 3a, 3b, 3c, 4a, 4b, 4c, relaxed, or "unknown"
- hair.current: short, medium, long, or "unknown"
- hair_included (braider only): yes, no, or "unknown"
- patch_test (colourist only): needed, or done if the client says they've had one
- next_action: ask, quote, offer_slots, decline, refer
- missing, in this order of importance: service, length_photo, consultation, confirm_length, confirm_ends, confirm_shade, length, size, shade

Return exactly this shape:
${SHAPES[profile.id]}

How to fill it:
- Use only what the DM says or a trusted photo tag (confidence at least ${tags.trust_threshold}). Anything else is "unknown"; never guess.
- evidence maps each field you filled (for example "look.length") to the exact words from the DM it came from, copied character for character, or "[photo]" for a trusted photo tag.
- when.dates are ISO dates resolved from the received time; when.window is any time-of-day or vague timing, or null when there is none.
- budget_max_gbp is a number or null. area is the place name or null. people defaults to 1.
- reply_draft is the stylist's reply: warm, short, British English, prices from the price list only, at most two questions, and never a confirmed booking.`
}

export function userMessage(dm: { received_at: string; text: string; photo: { reader_output: ReaderTag[] } | null }): string {
  const tags = dm.photo?.reader_output.map((t) => `${t.field}=${t.tag} (${t.confidence})`).join(", ") ?? "none"
  return `Received: ${dm.received_at}\nPhoto tags: ${tags}\nDM:\n${dm.text}`
}
