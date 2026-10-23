// The brief: what every DM becomes. One definition shared by the server, the screens
// and the eval runner. data/<stylist>/tags.json lists the same values for the photo reader;
// scripts/check-data.ts fails if the two drift.
import { Schema } from "effect"

const Unknown = "unknown" as const

export const StylistId = Schema.Literals(["braider", "colourist"])
export type StylistId = typeof StylistId.Type

export const NextAction = Schema.Literals(["ask", "quote", "offer_slots", "decline", "refer"])
export type NextAction = typeof NextAction.Type

export const MissingKey = Schema.Literals([
  "service", "length", "size", "shade", "date", "length_photo", "consultation",
  "confirm_length", "confirm_ends", "confirm_shade",
])

export const HairTexture = Schema.Literals(["1", "2", "3a", "3b", "3c", "4a", "4b", "4c", "relaxed", Unknown])
export const HairCurrent = Schema.Literals(["short", "medium", "long", Unknown])

export const BraiderService = Schema.Literals([
  "knotless", "box_braids", "cornrows", "french_curls", "locs_retwist", "loc_install",
  "twists", "silk_press", "sew_in", "wig_install", "other", Unknown,
])
export const BraiderLook = Schema.Struct({
  length: Schema.Literals(["shoulder", "bra_strap", "mid_back", "waist", "butt", Unknown]),
  size: Schema.Literals(["small", "smedium", "medium", "large", "jumbo", Unknown]),
  ends: Schema.Literals(["straight", "curly_ends", "boho_throughout", Unknown]),
  colour: Schema.Literals(["natural", "1b", "two_tone", "ginger", "blonde", "other", Unknown]),
  extras: Schema.Array(Schema.Literals(["beads", "cuffs", "heart_design", "fulani_pattern", "side_part", "triangle_parts", "edges_laid"])),
})

export const ColouristService = Schema.Literals([
  "balayage", "highlights", "babylights", "full_colour", "root_touch_up", "toner", "colour_correction", "other", Unknown,
])
export const ColouristLook = Schema.Struct({
  length: Schema.Literals(["shoulder", "bra_strap", "mid_back", "waist", Unknown]),
  shade: Schema.Literals(["lived_in_blonde", "ash_blonde", "honey_blonde", "caramel", "copper", "brunette", "black", "red", Unknown]),
  history: Schema.Literals(["virgin_dark", "virgin_light", "box_dye", "previously_lightened", Unknown]),
})

const common = {
  hair: Schema.Struct({ texture: HairTexture, current: HairCurrent }),
  budget_max_gbp: Schema.NullOr(Schema.Number),
  when: Schema.Struct({ dates: Schema.Array(Schema.String), window: Schema.NullOr(Schema.String) }),
  area: Schema.NullOr(Schema.String),
  people: Schema.Int,
  missing: Schema.Array(MissingKey),
  next_action: NextAction,
  reply_draft: Schema.String,
  // field path → the exact words in the DM it came from, or "[photo]" for a trusted photo tag
  evidence: Schema.Record(Schema.String, Schema.String),
}

export const BraiderBrief = Schema.Struct({
  service: BraiderService,
  look: BraiderLook,
  hair_included: Schema.Literals(["yes", "no", Unknown]),
  ...common,
})
export type BraiderBrief = typeof BraiderBrief.Type

export const ColouristBrief = Schema.Struct({
  service: ColouristService,
  look: ColouristLook,
  patch_test: Schema.Literals(["needed", "done"]),
  ...common,
})
export type ColouristBrief = typeof ColouristBrief.Type

export const briefSchemaFor = { braider: BraiderBrief, colourist: ColouristBrief } as const

// What the photo reader returns, whichever vendor sits behind it.
export const ReaderTag = Schema.Struct({ field: Schema.String, tag: Schema.String, confidence: Schema.Number })
export type ReaderTag = typeof ReaderTag.Type

const photo = Schema.NullOr(Schema.Struct({
  reader_output: Schema.Array(ReaderTag),
  truth: Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Array(Schema.String)])),
  reader_error: Schema.Boolean,
}))
const row = {
  id: Schema.String,
  received_at: Schema.String,
  text: Schema.String,
  photo,
  split: Schema.Literals(["train", "heldout", "trend"]),
  rules: Schema.Array(Schema.Int),
  tags: Schema.Array(Schema.String),
}

// One labelled DM from data/<stylist>/*.jsonl.
export const DatasetRow = Schema.Union([
  Schema.Struct({ stylist: Schema.Literal("braider"), label: BraiderBrief, ...row }),
  Schema.Struct({ stylist: Schema.Literal("colourist"), label: ColouristBrief, ...row }),
])
export type DatasetRow = typeof DatasetRow.Type
