// Checks a model brief before anyone sees it. A field whose evidence isn't really in the DM
// (or isn't a trusted photo tag) becomes "unknown": nothing invented reaches the screen.

const scalarPaths = ["service", "look.length", "look.size", "look.ends", "look.colour", "look.shade", "look.history", "hair.texture", "hair.current", "hair_included", "look.shape", "look.finish", "removal"]

const getPath = (o: any, path: string) => path.split(".").reduce((v, k) => v?.[k], o)
const setPath = (o: any, path: string, value: unknown) => {
  const keys = path.split(".")
  const last = keys.pop()!
  const parent = keys.reduce((v, k) => v?.[k], o)
  if (parent && last in parent) parent[last] = value
}

// House rule 11, applied in code: a trusted photo tag fills any field the DM left unknown,
// citing "[photo]". A field the DM did state is never overwritten by the photo.
export function applyTrustedPhotoTags(brief: Record<string, any>, tags: { field: string; tag: string; confidence: number }[], threshold: number): string[] {
  const filled: string[] = []
  brief.evidence ??= {}
  for (const t of tags) {
    if (t.confidence < threshold) continue
    if (t.field === "service") {
      if (brief.service === "unknown") {
        brief.service = t.tag
        brief.evidence.service = "[photo]"
        filled.push("service")
      }
      continue
    }
    const look = brief.look
    if (!look || !(t.field in look)) continue
    if (Array.isArray(look[t.field])) {
      if (!look[t.field].includes(t.tag)) {
        look[t.field].push(t.tag)
        brief.evidence[`look.${t.field}`] = "[photo]"
        filled.push(`look.${t.field}`)
      }
    } else if (look[t.field] === "unknown") {
      look[t.field] = t.tag
      brief.evidence[`look.${t.field}`] = "[photo]"
      filled.push(`look.${t.field}`)
    }
  }
  return filled
}

export function guardEvidence(brief: Record<string, any>, text: string, trustedPhotoFields: Set<string>): string[] {
  const cleared: string[] = []
  // Model output: a quote must be a string. A list of quotes keeps its first; anything else goes.
  const raw = brief.evidence && typeof brief.evidence === "object" ? brief.evidence : {}
  const evidence: Record<string, string> = Object.fromEntries(Object.entries(raw).flatMap(([k, v]) => {
    const q = Array.isArray(v) ? v.find((x) => typeof x === "string") : v
    return typeof q === "string" ? [[k, q]] : []
  }))
  brief.evidence = evidence
  const haystack = text.toLowerCase()
  for (const path of scalarPaths) {
    const value = getPath(brief, path)
    if (value === undefined || value === "unknown") continue
    const quote = evidence[path]
    const ok = quote === "[photo]" ? trustedPhotoFields.has(path.split(".").pop()!) : quote === "[earlier]" || (!!quote && haystack.includes(quote.toLowerCase()))
    if (!ok) {
      setPath(brief, path, "unknown")
      delete evidence[path]
      cleared.push(path)
    }
  }
  return cleared
}

// A follow-up continues the brief: anything the conversation already settled (by the client,
// the photo or the stylist's fix) stays settled unless the new message itself changes it,
// shown by a quote from the new message.
export function carryForward(brief: Record<string, any>, before: Record<string, any> | null, newText: string): string[] {
  if (!before) return []
  const carried: string[] = []
  brief.evidence ??= {}
  const said = newText.toLowerCase()
  for (const path of scalarPaths) {
    const was = getPath(before, path)
    const now = getPath(brief, path)
    if (was === undefined || was === "unknown" || now === was) continue
    const quote = brief.evidence[path]
    if (now !== "unknown" && typeof quote === "string" && quote !== "[photo]" && said.includes(quote.toLowerCase())) continue
    setPath(brief, path, was)
    // Settled earlier in the conversation: by the client's words, a photo or the stylist's fix.
    brief.evidence[path] = "[earlier]"
    carried.push(path)
  }
  return carried
}

// What the conversation has settled so far, said plainly to the model so a follow-up builds on
// it instead of asking again. The stylist's fixes count even though the client never typed them.
export function settledBlock(before: Record<string, any> | null): string {
  if (!before) return ""
  const known = scalarPaths.flatMap((path) => {
    const v = getPath(before, path)
    return v === undefined || v === "unknown" ? [] : [`${path}=${v}`]
  })
  if (Array.isArray(before.look?.extras) && before.look.extras.length) known.push(`look.extras=${before.look.extras.join("+")}`)
  if (Array.isArray(before.look?.art) && before.look.art.length) known.push(`look.art=${before.look.art.join("+")}`)
  if (before.service && before.service !== "unknown") known.unshift(`service=${before.service}`)
  return known.length ? `\n\nAlready settled in this conversation (by the client, the photo or the stylist). Use these and don't ask for them again unless the new DM changes them: ${[...new Set(known)].join(", ")}` : ""
}
