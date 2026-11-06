import type { TraceContext } from "./envelope.ts"

/** Fills a buffer of the given length with random bytes. */
export type RandomBytes = (length: number) => Uint8Array

/** Web Crypto's random bytes, which the window, Node and the CLI all have. */
export const cryptoBytes: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length))

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** A random ID of `length` bytes as lowercase hex, never all zeros, which W3C Trace Context holds invalid. */
function randomId(length: number, random: RandomBytes): string {
  for (;;) {
    const id = hex(random(length))
    if (/[^0]/.test(id)) return id
  }
}

/** A new trace's ID: 16 random bytes. */
export function newTraceId(random: RandomBytes = cryptoBytes): string {
  return randomId(16, random)
}

/** A new span's ID: 8 random bytes. */
export function newSpanId(random: RandomBytes = cryptoBytes): string {
  return randomId(8, random)
}

/** A `traceparent` header for a span, sampled: version 00, its trace and span IDs, and flags 01. */
export function formatTraceparent({ traceId, spanId }: TraceContext): string {
  return `00-${traceId}-${spanId}-01`
}

const traceparent = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(-.*)?$/

/**
 * Reads a `traceparent` header, as another process or the CLI sends it, to continue its trace. It's outside data, so
 * anything W3C Trace Context holds invalid gives nothing: version ff, IDs of all zeros, capitals, or version 00 with
 * more after its flags.
 */
export function parseTraceparent(header: string): TraceContext | undefined {
  const match = traceparent.exec(header.trim())
  if (!match) return undefined
  const [, version, traceId, spanId, , rest] = match
  if (version === "ff" || (version === "00" && rest !== undefined)) return undefined
  if (!traceId || !spanId || !/[^0]/.test(traceId) || !/[^0]/.test(spanId)) return undefined
  return { traceId, spanId }
}
