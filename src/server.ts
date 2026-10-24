// Worker entry. /api/room/<stylist>/* goes to that stylist's live room (requests and
// WebSockets); everything else is the TanStack Start app.
import handler from "@tanstack/react-start/server-entry"
import { isStylist } from "./shared/stylists.ts"

export { StylistRoom } from "./server/room.ts"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    // The films, with byte ranges: static assets don't answer Range requests, and Safari won't play
    // a video without them.
    if (url.pathname.startsWith("/media/")) return media(request, env, url)
    // Private pages for the control page live in one room, behind the same stylist key.
    if (url.pathname.startsWith("/api/doc/")) {
      const name = url.pathname.split("/")[3] ?? ""
      return env.ROOMS.get(env.ROOMS.idFromName("braider")).fetch(new Request(new URL(`/api/room/braider/doc/${name}`, url), request))
    }
    if (url.pathname.startsWith("/api/room/")) {
      const stylist = url.pathname.split("/")[3] ?? ""
      if (!isStylist(stylist)) return new Response("Unknown stylist", { status: 404 })
      return env.ROOMS.get(env.ROOMS.idFromName(stylist)).fetch(request)
    }
    return handler.fetch(request)
  },
}

async function media(request: Request, env: Env, url: URL): Promise<Response> {
  const name = url.pathname.slice("/media/".length)
  if (!/^[a-z0-9-]+\.mp4$/.test(name)) return new Response("Not found", { status: 404 })
  const asset = await env.ASSETS.fetch(new Request(new URL(`/film/${name}`, url)))
  if (!asset.ok) return new Response("Not found", { status: 404 })
  const bytes = await asset.arrayBuffer()
  const total = bytes.byteLength
  // ?download saves the file instead of playing it.
  const headers = {
    "content-type": "video/mp4", "accept-ranges": "bytes", "cache-control": "public, max-age=3600",
    ...(url.searchParams.has("download") ? { "content-disposition": `attachment; filename="${name}"` } : {}),
  }
  const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/)
  if (!range) return new Response(bytes, { headers: { ...headers, "content-length": String(total) } })
  // "bytes=-500" asks for the last 500 bytes; "bytes=500-" for everything from 500.
  const start = range[1] ? Number(range[1]) : Math.max(0, total - Number(range[2]))
  const end = range[1] && range[2] ? Math.min(Number(range[2]), total - 1) : total - 1
  if (start >= total || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${total}` } })
  return new Response(bytes.slice(start, end + 1), { status: 206, headers: { ...headers, "content-length": String(end - start + 1), "content-range": `bytes ${start}-${end}/${total}` } })
}
