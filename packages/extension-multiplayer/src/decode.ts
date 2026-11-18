import { fromBase64, type PersonPresence, type Relayed, relayedSchema, toBase64 } from "./protocol.ts"

/*
 * Decoding what the relay sends, as `room.ts` and `window.tsx` do on each message, timed apart for the benchmark and
 * the CI budget (PAR-1325): parsing the JSON, checking it against the protocol, and turning a change's base64 back into
 * Loro's bytes.
 */

/** A presence as a copy sends it while its person moves their pointer and has a layer selected. */
const presence: PersonPresence = {
  name: "Ada",
  pointer: { at: { x: 1234.5, y: 678.25 }, over: true, t: 123_456.7 },
  selection: [{ owner: "parity", type: "layer", key: "app.par#screen-50/n12" }],
  camera: { x: -400, y: -300, width: 1440, height: 900 },
  viewing: { design: "app.par#screen-50", state: "base", mode: "light" }
}

/** The relay's message for a batch with a change of `bytes` bytes, or presence alone without. */
export function relayedBatch(bytes?: number): string {
  const events = bytes === undefined ? [] : [{ kind: "changes", bytes: toBase64(filled(bytes)) }]

  return JSON.stringify({ kind: "batch", from: "peer-2", data: { events, presence } })
}

/** Decodes one message from the relay, as the room does, returning the change's bytes. */
export function decodeRelayed(message: string): Uint8Array[] {
  const parsed = relayedSchema.safeParse(JSON.parse(message))

  if (!parsed.success) {
    throw new Error("The message didn't match the protocol")
  }

  const relayed: Relayed = parsed.data

  return relayed.kind === "batch"
    ? relayed.data.events.flatMap((event) => (event.kind === "changes" ? [fromBase64(event.bytes)] : []))
    : []
}

function filled(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index * 31) % 256)
}
