import type { DocProvider } from "@parity-app/multiplayer"
import type { LoroBackend } from "@parity-app/multiplayer-loro"
import { createUserId, type Editor, InstancePresenceRecordType, type TLInstancePresence } from "tldraw"
import { z } from "zod"
import type { PresenceEvent } from "../shared/protocol.ts"
import { firstName } from "./account/account.ts"
import { agentPalettes } from "./agent/agent-colors.ts"
import { presence as agentPresence } from "./agent/presence.ts"
import { fnv1a } from "./bits.ts"
import { reportError } from "./report-error.ts"

/*
 * A live room in development (PAR-1179; docs/editor.md, "A live room in development"). With `PARITY_ROOM=1`, every copy
 * of the app `pnpm dev` starts opens the project on the Loro provider and joins a room through the relay in
 * `scripts/dev-room.ts`. The first copy in opens the files and hosts; a later one opens on the host's snapshot. Each
 * copy sends the Loro updates of its commits and takes in the others'. People's cursors are tldraw presence records,
 * drawn by `RoomCursor`; an agent's steps are passed on as they are to the agent presence queue, so the other copies
 * play its cursor as this one does. Only the host saves files.
 */

/** Where someone's cursor is, in page coordinates, or nowhere when it's off the canvas. */
const personSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Their palette's name, among the agents' palettes. */
  palette: z.string(),
  cursor: z.object({ x: z.number(), y: z.number() }).optional()
})

type Person = z.infer<typeof personSchema>

const point = z.object({ x: z.number(), y: z.number() })

/** An agent's step as another copy sent it, without the tab it was in there. */
const agentStep = z.object({
  kind: z.enum([
    "read",
    "write",
    "move",
    "screenshot",
    "measure",
    "accessibility",
    "problems",
    "console",
    "board",
    "start",
    "end"
  ]),
  label: z.string().optional(),
  design: z.string().optional(),
  node: z.string().optional(),
  state: z.string().optional(),
  mode: z.string().optional(),
  error: z.string().optional(),
  from: point.optional(),
  to: point.optional(),
  agent: z.string().optional(),
  agentId: z.string().optional()
}) satisfies z.ZodType<Omit<PresenceEvent, "tab">>

/** What's sent to every other copy at once: in order, with only the latest of each person's cursor. */
const batchSchema = z.object({
  updates: z.array(z.string()),
  people: z.array(personSchema),
  agents: z.array(agentStep)
})

type Batch = z.infer<typeof batchSchema>

/** A message from the relay: its own about who's in the room, or another copy's, with `from` added. */
const roomMessage = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("welcome"), host: z.string(), peers: z.array(z.string()) }),
  z.object({ kind: z.literal("joined"), from: z.string(), host: z.string() }),
  z.object({ kind: z.literal("left"), from: z.string(), host: z.string().optional() }),
  z.object({ kind: z.literal("hello"), from: z.string() }),
  z.object({ kind: z.literal("snapshot"), from: z.string(), data: z.string() }),
  z.object({ kind: z.literal("batch"), from: z.string(), data: batchSchema })
])

type RoomMessage = z.infer<typeof roomMessage>

/** What a copy sends: to `to`, or to every other copy. */
type Outgoing =
  | { kind: "hello"; to: string }
  | { kind: "snapshot"; to: string; data: string }
  | { kind: "batch"; data: Batch }

export interface LiveRoom {
  /** This copy, as the relay knows it. */
  readonly peer: string
  /** Whether this copy saves files: the host does, and a copy that takes over when the host leaves. */
  saves(): boolean
  /** Opens the project on Loro, on the host's snapshot unless this copy is the first in. */
  readonly provider: DocProvider
  /**
   * Sends this person's cursor on the canvas and shows the others', and passes on what agents do in `tab`, the tab the
   * project is open in here, showing other copies' agents there.
   */
  attachEditor(editor: Editor | undefined, tab: string): void
  leave(): void
}

/** How long to wait for the host's snapshot. A large project's takes a moment to export. */
const snapshotWaitMs = 30_000

const emptyBatch = (): Batch => ({ updates: [], people: [], agents: [] })

/** Joins the project's room, waiting for the host's snapshot when another copy hosts. */
export async function joinLiveRoom(url: string, project: string): Promise<LiveRoom> {
  const peer = crypto.randomUUID().slice(0, 8)
  const palette = agentPalettes[fnv1a(peer) % agentPalettes.length]?.name ?? ""
  // Asked each time, since who's signed in can arrive after the project opens.
  const name = () => import.meta.env.VITE_PARITY_ROOM_NAME ?? firstName() ?? "Guest"
  const query = `room=${encodeURIComponent(project)}&peer=${peer}`
  const events = new EventSource(`${url}/events?${query}`)
  const listeners = new Set<(message: RoomMessage) => void>()

  events.onmessage = (event: MessageEvent<string>) => {
    const parsed = roomMessage.safeParse(JSON.parse(event.data))

    if (!parsed.success) {
      return
    }

    for (const listener of listeners) {
      listener(parsed.data)
    }
  }

  const post = (message: Outgoing) =>
    fetch(`${url}/send?${query}`, { method: "POST", body: JSON.stringify(message) }).then(
      () => undefined,
      () => undefined
    )

  // One batch on its way at a time, so they arrive in order, holding what comes meanwhile for the next.
  let outbox = emptyBatch()
  let sending = false

  const flush = () => {
    if (sending || (outbox.updates.length === 0 && outbox.people.length === 0 && outbox.agents.length === 0)) {
      return
    }

    const batch = outbox
    outbox = emptyBatch()
    sending = true

    void post({ kind: "batch", data: batch }).finally(() => {
      sending = false
      flush()
    })
  }

  const queue = (add: (batch: Batch) => void) => {
    add(outbox)
    flush()
  }

  /** The first message `pick` picks, within `ms`. */
  const next = <T>(pick: (message: RoomMessage) => T | undefined, ms: number, what: string) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(listener)
        reject(new Error(`The room sent no ${what}`))
      }, ms)

      const listener = (message: RoomMessage) => {
        const picked = pick(message)

        if (picked !== undefined) {
          clearTimeout(timer)
          listeners.delete(listener)
          resolve(picked)
        }
      }

      listeners.add(listener)
    })

  const welcome = await next((message) => (message.kind === "welcome" ? message : undefined), 5000, "welcome")
  let host = welcome.host
  let snapshot: Uint8Array | undefined

  if (host !== peer) {
    const arriving = next((message) => (message.kind === "snapshot" ? message : undefined), snapshotWaitMs, "snapshot")

    // Every copy with the project open answers, so one that has none open, such as a window back at the start page,
    // can't hold the others up. The first snapshot to arrive is the one this copy opens on.
    for (const other of welcome.peers.filter((each) => each !== peer)) {
      void post({ kind: "hello", to: other })
    }

    snapshot = fromBase64((await arriving).data)
  }

  const loro = await import("@parity-app/multiplayer-loro")
  let backend: LoroBackend | undefined
  let editor: Editor | undefined
  let tab: string | undefined
  /** Updates that came before the document opened, taken in once it has. */
  const early: Uint8Array[] = []
  const askers: string[] = []
  const people = new Map<string, Person>()
  let stopEditor: () => void = nothing
  let stopLocal: () => void = nothing

  const answer = (to: string) => {
    if (backend) {
      void post({ kind: "snapshot", to, data: toBase64(backend.snapshot()) })
    } else {
      askers.push(to)
    }
  }

  const take = (bytes: Uint8Array) => {
    if (!backend) {
      early.push(bytes)

      return
    }

    try {
      backend.receive(bytes)
    } catch (error) {
      reportError(error, { operation: "liveRoom.receive", title: "Couldn't take in a change from the room" })
    }
  }

  const show = (person: Person) => {
    people.set(person.id, person)

    if (editor) {
      putPerson(editor, person)
    }
  }

  const forget = (from: string) => {
    people.delete(from)
    editor?.store.mergeRemoteChanges(() => editor?.store.remove([InstancePresenceRecordType.createId(from)]))
  }

  listeners.add((message) => {
    switch (message.kind) {
      case "hello":
        answer(message.from)
        break
      case "batch":
        for (const data of message.data.updates) {
          take(fromBase64(data))
        }

        for (const person of message.data.people) {
          show(person)
        }

        if (tab !== undefined && message.data.agents.length > 0) {
          const here = tab
          agentPresence.push(
            message.data.agents.map((step) => ({ ...step, tab: here })),
            true
          )
        }

        break
      // A welcome comes again when the connection to a relay that restarted reconnects.
      case "welcome":
      case "joined":
        host = message.host
        break
      case "left":
        host = message.host ?? peer
        forget(message.from)
        break
      default:
        break
    }
  })

  // What this copy's agents do in the project's tab, for the other copies to play.
  const stopAgents = agentPresence.onPush((steps) => {
    const mine = steps.flatMap(({ tab: of, ...step }) => (of === tab ? [step] : []))

    if (mine.length > 0) {
      queue((batch) => batch.agents.push(...mine))
    }
  })

  const provider: DocProvider = {
    name: loro.loroProvider.name,
    sync: true,
    open: (options) => {
      const opened = loro.openLoro(options, snapshot)
      backend = opened
      stopLocal = opened.subscribeLocalUpdates((bytes) => queue((batch) => batch.updates.push(toBase64(bytes))))

      for (const bytes of early.splice(0)) {
        take(bytes)
      }

      for (const to of askers.splice(0)) {
        answer(to)
      }

      return opened
    }
  }

  const sendCursor = (cursor: Person["cursor"]) => {
    const person: Person = { id: peer, name: name(), palette, cursor }

    queue((batch) => {
      batch.people = [...batch.people.filter((each) => each.id !== peer), person]
    })
  }

  return {
    peer,
    saves: () => host === peer,
    provider,
    attachEditor: (next, of) => {
      stopEditor()
      editor = next
      tab = of

      if (!next) {
        return
      }

      for (const person of people.values()) {
        putPerson(next, person)
      }

      const container = next.getContainer()
      const move = (event: PointerEvent) => sendCursor(next.screenToPage({ x: event.clientX, y: event.clientY }))
      const away = () => sendCursor(undefined)
      container.addEventListener("pointermove", move)
      container.addEventListener("pointerleave", away)

      stopEditor = () => {
        container.removeEventListener("pointermove", move)
        container.removeEventListener("pointerleave", away)
      }
    },
    leave: () => {
      stopEditor()
      stopAgents()
      stopLocal()
      events.close()
      listeners.clear()
    }
  }
}

/** Puts someone's cursor on this canvas, as a collaborator tldraw places and `RoomCursor` draws. */
function putPerson(editor: Editor, person: Person): void {
  const record: TLInstancePresence = InstancePresenceRecordType.create({
    id: InstancePresenceRecordType.createId(person.id),
    userId: createUserId(person.id),
    userName: person.name,
    // The palette's name, which `RoomCursor` draws with.
    color: person.palette,
    // One page in every copy, whatever it's called.
    currentPageId: editor.getCurrentPageId(),
    cursor: person.cursor ? { ...person.cursor, type: "default", rotation: 0 } : null,
    lastActivityTimestamp: Date.now()
  })

  editor.store.mergeRemoteChanges(() => editor.store.put([record]))
}

function nothing(): void {
  // Nothing to stop yet.
}

function toBase64(bytes: Uint8Array): string {
  let text = ""

  for (let at = 0; at < bytes.length; at += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  }

  return btoa(text)
}

function fromBase64(data: string): Uint8Array {
  return Uint8Array.from(atob(data), (char) => char.charCodeAt(0))
}
