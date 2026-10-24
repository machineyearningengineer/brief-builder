# Brief Builder

Turn "can u do these?" into a booking.

A stylist's DMs are vague: a photo and three words. Brief Builder turns each one into a priced
service sheet and a reply that follows her house rules, her prices and her voice. She fixes
anything with one tap, and every fix makes the next draft better. Built for Night Shift
(London, 23–25 Oct 2026); every model call goes through [Mubit](https://mubit.ai).

Live: https://brief-builder.buy-ea2.workers.dev

- `/s/braider`, `/s/colourist`, `/s/nails`: the client's DM chat, with the stylist's profile and prices
- `/inbox/<stylist>`: the stylist's inbox (needs the stylist key)
- `/stage`: the projector view: locked-test scoreboard, live room, Mubit adapter status

## How it works

1. **Photo reader.** gpt-6-luna (through Mubit) reads attached photos into tags from the
   stylist's own list (`data/<stylist>/tags.json`), each with a confidence. Tags under 0.6 are ignored.
2. **Brief.** One call through Mubit turns the DM, the photo tags and the conversation so far
   into a brief (`src/shared/brief.ts`) and a reply draft. The instructions are built only from
   the stylist's profile, so Mubit groups every call into one task per stylist.
3. **Guards.** Every field must quote the DM or a trusted photo tag, or it's cleared. Prices on
   screen come from her price list (`src/shared/pricing.ts`), never from the model.
4. **Her fixes.** A one-tap fix is stored, and the closest past fixes go into the next prompts as
   worked examples. The reply is re-drafted through Mubit, and that call is recorded, so the
   corrected answer becomes training data for her adapter.
5. **Her voice.** When she rewrites a draft before sending, the pair is kept and the closest
   rewrites shape the next drafts. The stage shows how much she rewrites each draft.
6. **Photos like this one.** A photo fix applies only to new photos whose other tags mostly match.
7. **Conversations.** Follow-ups carry the brief forward. A settled field changes only when the
   new message says so, and a fix after sending offers the client a price correction.

## Results

Locked test sets, never recorded by Mubit, scored with `scripts/replay.ts` and `scripts/score.ts`:

| Stylist | Test DMs | Fully right, plain | Fully right, with her fixes |
| --- | --- | --- | --- |
| Braider | 60 | 28% | 52% |
| Colourist | 20 | 0% | 35% |
| Nail tech | 24 | 29% | 58% |

## Stack

TanStack Start on Cloudflare Workers, one Durable Object per stylist (SQLite, WebSocket
hibernation), Effect Schema, deployed with the `cf` CLI. The launch film in `video/` is
Remotion, built from real app outputs and the scoreboard files.

## Run it

```bash
pnpm install
printf 'MUBIT_API_KEY=...\nSTYLIST_TOKEN=...\n' > .dev.vars
pnpm run dev
```

Photo credits: `public/work/CREDITS.md`.
