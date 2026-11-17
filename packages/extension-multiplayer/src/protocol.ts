import { z } from "zod"

/*
 * What copies in a room send each other through the relay (docs/proposals/extensions-in-the-window.md, "What the
 * multiplayer extension sends between copies"). This is the extension's own protocol, not core's. Document changes,
 * gestures, agents' steps and the host's colors go in order on one channel; each person's presence goes with them, only
 * the latest kept while a batch is on its way.
 */

const point = z.object({ x: z.number(), y: z.number() })
const rect = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
const nodeRef = z.object({ owner: z.string(), type: z.string(), key: z.string() })
const inFrame = { state: z.string().optional(), mode: z.string().optional() }

/** A gesture as `parity.presence` tells it, checked as it arrives. */
export const gestureSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("move"),
    phase: z.enum(["start", "drop", "end", "cancel"]),
    targets: z.array(
      z.object({ ...inFrame, ref: nodeRef, offset: point, size: z.object({ width: z.number(), height: z.number() }) })
    ),
    drop: z.object({ ...inFrame, parent: nodeRef, index: z.number().int() }).optional()
  }),
  z.object({
    kind: z.literal("resize"),
    phase: z.enum(["start", "end", "cancel"]),
    ref: nodeRef,
    frame: z.object(inFrame).optional(),
    handle: z.enum(["top", "right", "bottom", "left", "topLeft", "topRight", "bottomLeft", "bottomRight"]),
    from: rect
  }),
  z.object({ kind: z.literal("marquee"), phase: z.enum(["start", "end", "cancel"]), from: point }),
  z.object({
    kind: z.literal("text"),
    phase: z.enum(["start", "caret", "end"]),
    ref: nodeRef,
    frame: z.object(inFrame).optional(),
    caret: z.object({ anchor: z.number().int(), focus: z.number().int() }).optional()
  })
])

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
  agentId: z.string(),
  agent: z.string().optional(),
  label: z.string().optional(),
  ref: nodeRef.optional(),
  state: z.string().optional(),
  mode: z.string().optional(),
  from: point.optional(),
  to: point.optional(),
  error: z.string().optional()
})

/** One of the ordered events in a batch. */
export const eventSchema = z.discriminatedUnion("kind", [
  /** A change committed in the sender's document, as `parity.sync` framed it, in base64. */
  z.object({ kind: z.literal("changes"), bytes: z.string() }),
  z.object({ kind: z.literal("gesture"), gesture: gestureSchema }),
  /** The sender's own agents' steps. */
  z.object({ kind: z.literal("agents"), steps: z.array(agentStep) }),
  /** The host's palette numbers for everyone in the room, by peer. */
  z.object({ kind: z.literal("colors"), assigned: z.array(z.tuple([z.string(), z.number().int().nonnegative()])) })
])

export type RoomEvent = z.infer<typeof eventSchema>

/** What someone is doing now, the latest of each. */
export const presenceSchema = z.object({
  name: z.string(),
  pointer: z.object({ at: point, over: z.boolean() }).optional(),
  selection: z.array(nodeRef),
  camera: rect.optional(),
  viewing: z.object({ design: z.string().optional(), ...inFrame })
})

export type PersonPresence = z.infer<typeof presenceSchema>

/** What one copy sends everyone, or `to` one copy. */
export const batchSchema = z.object({
  events: z.array(eventSchema),
  presence: presenceSchema.optional()
})

export type Batch = z.infer<typeof batchSchema>

/** A message from the relay: its own about who's in the room, or another copy's, with `from` added. */
export const relayedSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("welcome"), host: z.string(), peers: z.array(z.string()) }),
  z.object({ kind: z.literal("joined"), from: z.string(), host: z.string() }),
  z.object({ kind: z.literal("left"), from: z.string(), host: z.string().optional() }),
  /** Asks for the document, from a copy that's joining. */
  z.object({ kind: z.literal("hello"), from: z.string() }),
  z.object({
    kind: z.literal("snapshot"),
    from: z.string(),
    data: z.object({ snapshot: z.string(), lineage: z.string() })
  }),
  /** Asks for the changes a copy at `version` is missing. */
  z.object({ kind: z.literal("missing"), from: z.string(), data: z.object({ version: z.string() }) }),
  z.object({ kind: z.literal("batch"), from: z.string(), data: batchSchema })
])

export type Relayed = z.infer<typeof relayedSchema>

/** What a copy posts to the relay: for `to`, or for every other copy. */
export type Outgoing =
  | { kind: "hello"; to: string }
  | { kind: "snapshot"; to: string; data: { snapshot: string; lineage: string } }
  | { kind: "missing"; to: string; data: { version: string } }
  | { kind: "batch"; to?: string; data: Batch }

export function toBase64(bytes: Uint8Array): string {
  let text = ""

  for (let at = 0; at < bytes.length; at += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  }

  return btoa(text)
}

export function fromBase64(data: string): Uint8Array {
  return Uint8Array.from(atob(data), (char) => char.charCodeAt(0))
}
