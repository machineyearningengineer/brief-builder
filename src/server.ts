// Worker entry. /api/room/<stylist>/* goes to that stylist's live room (requests and
// WebSockets); everything else is the TanStack Start app.
import handler from "@tanstack/react-start/server-entry"
import { isStylist } from "./shared/stylists.ts"

export { StylistRoom } from "./server/room.ts"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
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
