import { deflateSync, inflateSync } from "node:zlib"
import type { Envelope } from "@parity-app/telemetry"
import { z } from "zod"

/**
 * Main's scrubber as the windows' telemetry needs it: the open projects' `.env` values stay in main and are scrubbed
 * from what windows send as it passes through, since a project's code runs in every window's page (PAR-983).
 */
export interface WindowScrubbing {
  /** A copy of the value with secrets replaced, the `.env` values included. */
  value<T>(input: T): T
  /** The values given to scrub besides keys, tokens and passwords. */
  secrets(): readonly string[]
}

/** A Sentry envelope's items, each a header and a payload, which is all main reads of one. */
export interface SentEnvelope {
  1: [header: unknown, payload: unknown][]
}

/** What a page recorded, with its attributes scrubbed of the `.env` values the page never has (PAR-672, PAR-983). */
export function scrubRecorded(envelope: Envelope, scrubbing: WindowScrubbing): Envelope {
  return { ...envelope, attributes: scrubbing.value(envelope.attributes) }
}

/**
 * Scrubs a replay the editor window sent, in place, as main passes it to Sentry. Sentry Electron hands replays straight
 * to the transport, so they skip `beforeSend`: the window scrubs keys and tokens as it records, and the `.env` values
 * are scrubbed here. Its event is always scrubbed, since main adds its own breadcrumbs to it. Its recording is read only
 * when it holds one of the values, since a whole page's snapshot is large; one that can't be read is left out, since
 * it can't be checked.
 */
export function scrubReplays(envelope: SentEnvelope, scrubbing: WindowScrubbing): void {
  const items = envelope[1]

  for (let index = items.length - 1; index >= 0; index--) {
    const [header, payload] = items[index]!
    const read = itemHeader.safeParse(header)

    if (read.data?.type === "replay_event") {
      items[index] = [header, scrubbing.value(payload)]
    } else if (read.data?.type === "replay_recording" && payload instanceof Uint8Array) {
      const scrubbed = scrubbedRecording(payload, scrubbing.secrets(), scrubbing)

      if (scrubbed === "unreadable") {
        items.splice(index, 1)
      } else if (scrubbed) {
        items[index] = [{ ...read.data, length: scrubbed.length }, scrubbed]
      }
    }
  }
}

/** An envelope item's header, read for its type; the rest is kept as sent. */
const itemHeader = z.looseObject({ type: z.string() })

/** The first byte of a zlib stream, as Replay's worker compresses each segment. */
const zlibStart = 0x78

/**
 * A replay segment with the values scrubbed, kept compressed if it was, or none when it holds none of them. A segment
 * is a line of JSON naming it, then its events as JSON, compressed or not.
 */
function scrubbedRecording(
  payload: Uint8Array,
  secrets: readonly string[],
  scrubbing: WindowScrubbing
): Uint8Array | "unreadable" | undefined {
  if (secrets.length === 0) {
    return undefined
  }

  const lineEnd = payload.indexOf(0x0a)

  if (lineEnd < 0) {
    return "unreadable"
  }

  const body = payload.subarray(lineEnd + 1)
  const compressed = body[0] === zlibStart

  try {
    const json = new TextDecoder().decode(compressed ? inflateSync(body) : body)

    // A value is written in the JSON as JSON writes a string, escapes and all.
    if (!secrets.some((secret) => json.includes(JSON.stringify(secret).slice(1, -1)))) {
      return undefined
    }

    // Replay's events, scrubbed whatever their shape.
    const events: unknown = JSON.parse(json)
    const encoded = new TextEncoder().encode(JSON.stringify(scrubbing.value(events)))
    const scrubbedBody = compressed ? deflateSync(encoded) : encoded
    const scrubbed = new Uint8Array(lineEnd + 1 + scrubbedBody.length)
    scrubbed.set(payload.subarray(0, lineEnd + 1))
    scrubbed.set(scrubbedBody, lineEnd + 1)

    return scrubbed
  } catch {
    return "unreadable"
  }
}
