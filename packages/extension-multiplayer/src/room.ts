import {
  type Batch,
  type Outgoing,
  type PersonPresence,
  type Relayed,
  relayedSchema,
  type RoomEvent
} from "./protocol.ts"

/*
 * This copy in a project's room, through the relay (relay.ts). It keeps who's here in the order they joined, which copy
 * hosts, and sends what this copy does: ordered events on one channel, one batch on its way at a time, with only the
 * latest presence kept meanwhile. It knows nothing of the document or the canvas; window.tsx wires those.
 */

/** How the room reaches the relay: a stream of what it's sent, and a way to send. */
export interface Transport {
  /** Starts listening. `down` is told when the connection drops; the transport reconnects by itself. */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the wire, which carries anything; `joinRoom` parses it
  listen(heard: (message: unknown) => void, down: () => void): () => void
  post(message: Outgoing): Promise<void>
}

/** The relay over server-sent events and `fetch`, for the project's room. */
export function relayTransport(url: string, room: string, peer: string): Transport {
  const query = `room=${encodeURIComponent(room)}&peer=${encodeURIComponent(peer)}`

  return {
    listen(heard, down) {
      const events = new EventSource(`${url}/events?${query}`)
      events.onmessage = (event: MessageEvent<string>) => heard(JSON.parse(event.data))
      events.onerror = () => down()

      return () => events.close()
    },
    post: (message) =>
      fetch(`${url}/send?${query}`, { method: "POST", body: JSON.stringify(message) }).then(() => undefined)
  }
}

/** What a room tells its listeners. */
export interface RoomListeners {
  /** Who's here or who hosts changed. */
  members(): void
  /** Another copy's ordered event. */
  event(event: RoomEvent, from: string): void
  /** Another copy's presence. */
  presence(presence: PersonPresence, from: string): void
  /** A copy that's joining asks for the document. */
  hello(from: string): void
  /** Another copy is missing changes since `version`, and with `back`, wants to be asked for what this one is missing. */
  missing(version: string, from: string, back: boolean): void
  /** The connection to the relay dropped, or failed again while down: the relay may have stopped with its copy. */
  down(): void
  /** The connection came back after `downMs`: this copy may have missed changes. */
  reconnected(downMs: number): void
  /** Someone left. */
  left(peer: string): void
}

export interface Room {
  /** This copy, as the relay knows it. */
  readonly peer: string
  /** Who hosts: the first copy in, then whoever joined next. */
  readonly host: string
  /** Everyone here, this copy included, in the order they joined. */
  readonly peers: readonly string[]
  /** Waits for the relay to say who's here. */
  welcomed(): Promise<void>
  /** Asks the other copies for the document, resolving with the first snapshot, or rejecting after `ms`. */
  askSnapshot(ms: number): Promise<{ snapshot: string; lineage: string }>
  /** Sends an ordered event to everyone. */
  send(event: RoomEvent): void
  /** Sends events to one copy, as changes another copy asked for. */
  sendTo(to: string, events: RoomEvent[]): void
  answerSnapshot(to: string, snapshot: string, lineage: string): void
  /**
   * Asks `of` (the host, unless given) for the changes since `version`. With `back`, it asks this copy in turn for
   * what it's missing, so changes made on both sides while the relay was down reach both.
   */
  askMissing(version: string, options?: { of?: string; back?: boolean }): void
  /** Sets what this person is doing; sent with the next batch. */
  presence(presence: PersonPresence): void
  on(listeners: Partial<RoomListeners>): () => void
  /** For `room.latency`: round trips since the last call, and the most waiting at once. */
  takeStats(): RoomStats
  leave(): void
}

export interface RoomStats {
  rtts: number[]
  presenceSent: number
  presenceReceived: number
  queueMax: number
  batchesInFlightMax: number
}

/** Joins the project's room as `peer` through `transport`. */
export function joinRoom(transport: Transport, peer: string, now: () => number = () => performance.now()): Room {
  let host = ""
  let peers: string[] = []
  let welcomed = false
  let downSince: number | undefined
  const listeners = new Set<Partial<RoomListeners>>()
  const welcomes = new Set<() => void>()
  const snapshots = new Set<(snapshot: { snapshot: string; lineage: string }) => void>()
  let stats = blankStats()

  const tell = <Name extends keyof RoomListeners>(name: Name, ...args: Parameters<RoomListeners[Name]>) => {
    for (const each of listeners) {
      // SAFETY: `args` are `name`'s own parameters.
      const listener = each[name] as ((...given: Parameters<RoomListeners[Name]>) => void) | undefined
      listener?.(...args)
    }
  }

  // One batch on its way at a time, so they arrive in order, holding what comes meanwhile for the next.
  let outbox: Batch = { events: [] }
  let sending = false

  const flush = () => {
    if (sending || (outbox.events.length === 0 && !outbox.presence)) {
      return
    }

    const batch = outbox
    outbox = { events: [] }
    sending = true
    stats.batchesInFlightMax = Math.max(stats.batchesInFlightMax, 1)

    if (batch.presence) {
      stats.presenceSent += 1
    }

    const began = now()

    void transport
      .post({ kind: "batch", data: batch })
      .then(
        () => stats.rtts.push(now() - began),
        () => undefined
      )
      .finally(() => {
        sending = false
        flush()
      })
  }

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the wire, parsed here
  const heard = (raw: unknown) => {
    const parsed = relayedSchema.safeParse(raw)

    if (!parsed.success) {
      return
    }

    const message: Relayed = parsed.data

    switch (message.kind) {
      case "welcome": {
        host = message.host
        peers = [...message.peers]
        const wasDown = downSince
        downSince = undefined

        // A welcome comes again when the connection comes back, as after the relay restarted.
        if (welcomed && wasDown !== undefined) {
          tell("reconnected", now() - wasDown)
        }

        welcomed = true

        for (const resolve of welcomes) {
          resolve()
        }

        welcomes.clear()
        tell("members")
        break
      }

      case "joined":
        host = message.host
        peers = [...peers.filter((each) => each !== message.from), message.from]
        tell("members")
        break
      case "left":
        peers = peers.filter((each) => each !== message.from)
        host = message.host ?? peer
        tell("left", message.from)
        tell("members")
        break
      case "hello":
        tell("hello", message.from)
        break
      case "snapshot":
        for (const resolve of snapshots) {
          resolve(message.data)
        }

        snapshots.clear()
        break
      case "missing":
        tell("missing", message.data.version, message.from, message.data.back === true)
        break
      case "batch":
        for (const event of message.data.events) {
          tell("event", event, message.from)
        }

        if (message.data.presence) {
          stats.presenceReceived += 1
          tell("presence", message.data.presence, message.from)
        }

        break
      default:
        break
    }
  }

  const stop = transport.listen(heard, () => {
    downSince ??= now()
    tell("down")
  })

  return {
    peer,
    get host() {
      return host
    },
    get peers() {
      return peers
    },
    welcomed: () =>
      welcomed
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            welcomes.add(resolve)
          }),
    askSnapshot(ms) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          snapshots.delete(take)
          reject(new Error("No copy in the room sent the project"))
        }, ms)

        const take = (snapshot: { snapshot: string; lineage: string }) => {
          clearTimeout(timer)
          resolve(snapshot)
        }

        snapshots.add(take)

        // Every copy with the project open answers, so one that has none open can't hold the others up. The first
        // snapshot to arrive is the one this copy opens on.
        for (const other of peers.filter((each) => each !== peer)) {
          void transport.post({ kind: "hello", to: other }).catch(() => undefined)
        }
      })
    },
    send(event) {
      outbox.events.push(event)
      stats.queueMax = Math.max(stats.queueMax, outbox.events.length)
      flush()
    },
    sendTo(to, events) {
      void transport.post({ kind: "batch", to, data: { events } }).catch(() => undefined)
    },
    answerSnapshot(to, snapshot, lineage) {
      void transport.post({ kind: "snapshot", to, data: { snapshot, lineage } }).catch(() => undefined)
    },
    askMissing(version, { of = host, back = false } = {}) {
      if (of && of !== peer) {
        const data = back ? { version, back } : { version }
        void transport.post({ kind: "missing", to: of, data }).catch(() => undefined)
      }
    },
    presence(presence) {
      outbox.presence = presence
      flush()
    },
    on(given) {
      listeners.add(given)

      return () => listeners.delete(given)
    },
    takeStats() {
      const taken = stats
      stats = blankStats()

      return taken
    },
    leave() {
      stop()
      listeners.clear()
      welcomes.clear()
      snapshots.clear()
    }
  }
}

function blankStats(): RoomStats {
  return { rtts: [], presenceSent: 0, presenceReceived: 0, queueMax: 0, batchesInFlightMax: 0 }
}
