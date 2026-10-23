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
