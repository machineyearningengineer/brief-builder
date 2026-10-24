// Keeps a screen in sync with a stylist's live room: loads the state once, then applies
// every change the room pushes over its WebSocket, reconnecting if the connection drops.
// A client screen passes its phone's id; the stylist's screens pass the stylist key.
import { useEffect, useState } from 'react'
import type { RoomEvent, RoomMessage, StylistKey } from '../shared/stylists.ts'

export type RoomAuth = { client: string } | { token: string }

// A client id may go in the URL (it's only an address); the stylist key never does.
const query = (auth: RoomAuth) => ('client' in auth ? `client=${encodeURIComponent(auth.client)}` : '')
const headers = (auth: RoomAuth): Record<string, string> => ('token' in auth ? { 'x-stylist-token': auth.token } : {})
const protocols = (auth: RoomAuth) => ('token' in auth ? ['brief-builder', `key.${auth.token}`] : ['brief-builder'])

export function useRoom(stylist: StylistKey, auth: RoomAuth | null) {
  const [messages, setMessages] = useState<RoomMessage[]>([])
  const [connected, setConnected] = useState(false)
  const [denied, setDenied] = useState(false)
  const key = auth ? JSON.stringify(auth) : ''

  useEffect(() => {
    if (!auth) return
    let socket: WebSocket | null = null
    let stopped = false
    let retry: ReturnType<typeof setTimeout> | undefined

    const upsert = (m: RoomMessage) =>
      setMessages((prev) => {
        const i = prev.findIndex((p) => p.id === m.id)
        if (i < 0) return [...prev, m].sort((a, b) => a.createdAt - b.createdAt)
        const next = prev.slice()
        next[i] = m
        return next
      })

    const connect = () => {
      fetch(`/api/room/${stylist}/state?${query(auth)}`, { headers: headers(auth) })
        .then((r) => {
          if (r.status === 401) {
            stopped = true
            setDenied(true)
            return null
          }
          return r.json() as Promise<{ messages: RoomMessage[] }>
        })
        .then((s) => s && setMessages(s.messages))
        .catch(() => {})
      if (stopped) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      socket = new WebSocket(`${proto}://${location.host}/api/room/${stylist}/ws?${query(auth)}`, protocols(auth))
      socket.onopen = () => setConnected(true)
      socket.onmessage = (e) => {
        const event = JSON.parse(e.data) as RoomEvent
        if (event.type === 'message') upsert(event.message)
        if (event.type === 'reset') setMessages([])
      }
      socket.onclose = () => {
        setConnected(false)
        if (!stopped) retry = setTimeout(connect, 1500)
      }
    }
    setDenied(false)
    connect()
    return () => {
      stopped = true
      clearTimeout(retry)
      socket?.close()
    }
  }, [stylist, key])

  const add = (m: RoomMessage) => setMessages((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]))
  return { messages, connected, denied, add }
}

// Requests that are safe to send again (a DM carries its own key) retry on a dropped connection or
// a server hiccup, never on a refusal: a 4xx means the request itself needs changing.
export async function postRetrying<T>(stylist: StylistKey, action: string, body: unknown, token?: string, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await post<T>(stylist, action, body, token)
    } catch (e) {
      const status = e instanceof RequestError ? e.status : 0
      if (i >= tries || (status >= 400 && status < 500)) throw e
      await new Promise((r) => setTimeout(r, 400 * 2 ** i + Math.random() * 200))
    }
  }
}

export class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export async function post<T>(stylist: StylistKey, action: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`/api/room/${stylist}/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { 'x-stylist-token': token } : {}) },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new RequestError(data.error ?? `Request failed (${res.status})`, res.status)
  return data
}

export async function uploadImage(stylist: StylistKey, client: string, blob: Blob): Promise<string> {
  const res = await fetch(`/api/room/${stylist}/image?client=${encodeURIComponent(client)}`, { method: 'POST', body: blob, headers: { 'content-type': blob.type } })
  const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string }
  if (!res.ok || !data.id) throw new Error(data.error ?? 'That photo didn’t upload.')
  return data.id
}

// The stylist's screens fetch photos with the key in a header, so they can't be plain <img> URLs.
export async function imageUrlForStylist(stylist: StylistKey, id: string, token: string): Promise<string | null> {
  const res = await fetch(`/api/room/${stylist}/image/${id}`, { headers: { 'x-stylist-token': token } })
  return res.ok ? URL.createObjectURL(await res.blob()) : null
}

// A stable, unguessable id for this phone, so a client sees only their own thread.
export function clientId(): string {
  try {
    const existing = localStorage.getItem('brief-builder-client')
    if (existing) return existing
    const id = crypto.randomUUID()
    localStorage.setItem('brief-builder-client', id)
    return id
  } catch {
    return crypto.randomUUID()
  }
}

// The stylist key lives only in this browser, typed in once on the inbox.
export const stylistToken = {
  get: () => {
    try {
      return localStorage.getItem('brief-builder-stylist') ?? ''
    } catch {
      return ''
    }
  },
  set: (t: string) => {
    try {
      localStorage.setItem('brief-builder-stylist', t)
    } catch {
      // Private windows can refuse storage; the key then lasts for this page only.
    }
  },
}
