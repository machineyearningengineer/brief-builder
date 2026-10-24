// Everything the film shows. Messages and replies are real outputs from the app (local room
// runs on 24 Oct and the locked-test runs in runs/); numbers come from the same files the
// stage view reads, so the film can't claim more than the scoreboard does.
import scoreboard from "../../src/shared/scoreboard.json"
import mubit from "../../src/shared/mubit-status.json"

export const inboxNoise = [
  { name: "tolu.x", text: "can u do these? 😍", photo: true },
  { name: "ama_k", text: "how much for knotless" },
  { name: "jess", text: "sat??" },
  { name: "rach.b", text: "hiii do u have anything this week" },
  { name: "ife", text: "me and my sister want braids" },
  { name: "danielle", text: "does that include hair" },
  { name: "kemi", text: "how much is it with curls" },
  { name: "zara", text: "[voice note] hi um so I wanted to ask about…" },
  { name: "bisi", text: "can u do these? saturday", photo: true },
]

// Room run 2: the photo reader said small, the stylist fixed it to smedium.
export const hero = {
  dm: "can u do these? saturday",
  tags: [
    { label: "Knotless", conf: 96 },
    { label: "Bum length", conf: 84 },
    { label: "Small", conf: 82 },
  ],
  firstReply: "Yes, I can do these. Small knotless braids at butt length are £240, excluding hair. I have slots available today, what time would suit you?",
  fixedReply: "Yes, I can do these for £220, hair not included. I have Saturday at 10am or 2pm available, would either suit?",
  followUp: "does that include the hair?",
  followUpReply: "No, the £220 doesn’t include the hair. I can provide it for an extra £15, making £235 altogether.",
}

// Locked braider test, DM h022: same model, with and without her fixes.
export const sideBySide = {
  dm: "hiya can u do knotless medium to my waist curls at the ends like this next week anytime how much?",
  plain: "Hiya! Waist-length medium knotless with curly ends would be £180, hair not included. What day next week suits you? I can then offer you specific slots.",
  fixed: "Hiya! Knotless to waist length with curly ends is £180, hair not included. I can offer Monday 9th at 10am or Wednesday 11th at 2pm, would either suit?",
}

export const stylists = [
  {
    name: "Amara Braids", area: "Peckham", craft: "Knotless, box braids, locs",
    dm: "can u do these? saturday", photo: "knotless.webp",
    reply: hero.fixedReply,
  },
  {
    name: "Lived-in Colour", area: "Dalston", craft: "Balayage and colour",
    dm: "full colour 🙏 I've used box dye 17th Nov 🤍 price?",
    reply: "Thanks 🤍 As you’ve used box dye, I’d need to see your hair at a free 15-minute consultation before I can give you a price. Would you be available for a consultation on 17 November?",
  },
  {
    name: "Gloss by Jade", area: "Hackney", craft: "BIAB, gel, acrylics",
    // A screenshot of someone else's story, the way clients really send references.
    dm: "can u do these 😍 how much", photo: "story-stiletto-cat-eye.webp",
    reply: "Yes 😍 An XL acrylic set with stiletto shape and cat-eye finish would be £61. Do you have any product on your nails at the moment?",
  },
]

type Summary = { fullyRight: number; nextAction: number; nextActionByRule: Record<string, number> }
const board = scoreboard as unknown as Record<string, { testSet: string; base: Summary; corrected: Summary }>
export const scores = {
  braider: board.braider,
  colourist: board.colourist,
  nails: board.nails,
}

type Adapter = { version: string; base: string; quality: number; target: number; kept: number; state: string }
export const adapters = mubit.adapters as Record<string, Adapter | undefined>
export const checkedAt = mubit.checkedAt
