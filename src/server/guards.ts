// Checks a model brief before anyone sees it. A field whose evidence isn't really in the DM
// (or isn't a trusted photo tag) becomes "unknown": nothing invented reaches the screen.

const scalarPaths = ["service", "look.length", "look.size", "look.ends", "look.colour", "look.shade", "look.history", "hair.texture", "hair.current", "hair_included"]

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
  const evidence: Record<string, string> = brief.evidence ?? {}
  const haystack = text.toLowerCase()
  for (const path of scalarPaths) {
    const value = getPath(brief, path)
    if (value === undefined || value === "unknown") continue
    const quote = evidence[path]
    const ok = quote === "[photo]" ? trustedPhotoFields.has(path.split(".").pop()!) : !!quote && haystack.includes(quote.toLowerCase())
    if (!ok) {
      setPath(brief, path, "unknown")
      delete evidence[path]
      cleared.push(path)
    }
  }
  return cleared
}
