// The relay copies of the app in a live room talk through, in development only (PAR-1179; docs/editor.md, "A live room
// in development"). `pnpm dev` starts it on 127.0.0.1 when `PARITY_ROOM=1`, unless another copy's already has the port.
//
// A copy listens at `GET /events?room=…&peer=…`, a stream of server-sent events, and sends with
// `POST /send?room=…&peer=…`, a JSON message that goes to `to` or to every other copy in the room, with `from` added.
// The first copy into a room is its host; when the host leaves, the copy that joined next takes over. Each copy is told
// who hosts when it joins (`welcome`), and everyone when someone joins or leaves (`joined`, `left`).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { z } from "zod"

/** What a copy sends: a kind the copies agree on, for `to` or everyone, with what it carries. */
const sent = z.object({ kind: z.string(), to: z.string().optional(), data: z.json().optional() })

/** What a copy is sent: a copy's message with who sent it, or the relay's own, about who's in the room. */
type Relayed = z.infer<typeof sent> & { from?: string; host?: string | undefined; peers?: string[] }

interface Peer {
  id: string
  response: ServerResponse
}

/** Copies in each room, in the order they joined: the first is the host. */
type Rooms = Map<string, Peer[]>

/** The relay's server. */
export function roomRelay(): Server {
  const rooms: Rooms = new Map()

  return createServer((request, response) => {
    // The window's page is served from the UI dev server, another origin.
    response.setHeader("Access-Control-Allow-Origin", "*")
    response.setHeader("Access-Control-Allow-Headers", "content-type")

    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    const room = url.searchParams.get("room")
    const peer = url.searchParams.get("peer")

    if (request.method === "OPTIONS") {
      response.writeHead(204).end()

      return
    }

    if (!room || !peer) {
      response.writeHead(400).end("room and peer are needed")

      return
    }

    if (request.method === "GET" && url.pathname === "/events") {
      join(rooms, room, peer, response)

      return
    }

    if (request.method === "POST" && url.pathname === "/send") {
      // A copy that reloads while sending aborts its request, which needs no answer.
      relay(rooms, room, peer, request, response).catch(() => response.destroy())

      return
    }

    response.writeHead(404).end()
  })
}

function join(rooms: Rooms, room: string, id: string, response: ServerResponse): void {
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" })
  const peers = rooms.get(room) ?? []
  rooms.set(room, peers)
  peers.push({ id, response })
  const host = peers[0]?.id
  write(response, { kind: "welcome", host, peers: peers.map((each) => each.id) })
  broadcast(rooms, room, id, { kind: "joined", from: id, host })

  // A comment now and then keeps the stream open through anything that closes idle ones.
  const beat = setInterval(() => response.write(": beat\n\n"), 15_000)

  response.on("close", () => {
    clearInterval(beat)
    const left = (rooms.get(room) ?? []).filter((each) => each.id !== id)

    if (left.length === 0) {
      rooms.delete(room)

      return
    }

    rooms.set(room, left)
    broadcast(rooms, room, id, { kind: "left", from: id, host: left[0]?.id })
  })
}

async function relay(
  rooms: Rooms,
  room: string,
  from: string,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk))
  }

  let message: z.infer<typeof sent>

  try {
    message = sent.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")))
  } catch {
    response.writeHead(400).end("not a message")

    return
  }

  const { to } = message

  for (const peer of rooms.get(room) ?? []) {
    if (peer.id !== from && (to === undefined || peer.id === to)) {
      write(peer.response, { ...message, from })
    }
  }

  response.writeHead(204).end()
}

function broadcast(rooms: Rooms, room: string, from: string, message: Relayed): void {
  for (const peer of rooms.get(room) ?? []) {
    if (peer.id !== from) {
      write(peer.response, message)
    }
  }
}

function write(response: ServerResponse, message: Relayed): void {
  response.write(`data: ${JSON.stringify(message)}\n\n`)
}

/**
 * Starts the relay on 127.0.0.1 at `port`: `started`, or `shared` when another copy already listens there, which this
 * copy then uses.
 */
export function startRoomRelay(port: number): Promise<"started" | "shared"> {
  const server = roomRelay()

  return new Promise((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        resolve("shared")
      } else {
        reject(error)
      }
    })
    server.listen(port, "127.0.0.1", () => {
      // The relay goes with this copy's dev script and never keeps it running.
      server.unref()
      resolve("started")
    })
  })
}
