import { z } from "zod"
import type { Attributes, Outcome, TraceContext } from "./envelope.ts"
import type { Span } from "./telemetry.ts"

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

    if (/[^0]/.test(id)) {
      return id
    }
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

  if (!match) {
    return undefined
  }

  const [, version, traceId, spanId, , rest] = match

  if (version === "ff" || (version === "00" && rest !== undefined)) {
    return undefined
  }

  if (!traceId || !spanId || !/[^0]/.test(traceId) || !/[^0]/.test(spanId)) {
    return undefined
  }

  return { traceId, spanId }
}

/**
 * What a request carries so the process answering it continues the sender's trace: Sentry's `sentry-trace` header,
 * `<trace>-<span>-1`, and its `baggage`. Channel requests carry it as their `trace` field, and the CLI as HTTP headers.
 */
export interface TraceHeaders {
  "sentry-trace": string
  baggage?: string
}

/** The headers that continue a span's trace, sampled, as every span Parity sends is. */
export function traceHeaders({ traceId, spanId }: TraceContext): TraceHeaders {
  return { "sentry-trace": `${traceId}-${spanId}-1`, baggage: `sentry-trace_id=${traceId},sentry-sampled=true` }
}

/** Text, or nothing for anything else. */
const textOrNothing = z.string().optional().catch(undefined)

/** A header's value, read by its first when Node gives a repeated header as an array, or nothing unless it's text. */
const header = z.preprocess((value) => (Array.isArray(value) ? value.at(0) : value), textOrNothing)

/** The headers a trace continues by, from any object; anything else has neither. */
const tracingHeaders = z.object({ "sentry-trace": header, traceparent: header }).catch({})

const sentryTrace = /^([0-9a-f]{32})-([0-9a-f]{16})(-[01])?$/

/**
 * The trace a request's headers continue: its `sentry-trace`, or a W3C `traceparent`. Headers come from another process
 * or the CLI, so anything else, or an ID of all zeros, gives nothing and the request starts a trace of its own. Node's
 * repeated headers, given as arrays, are read by their first.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: headers from another process or the CLI, parsed here
export function readTraceHeaders(headers: unknown): TraceContext | undefined {
  const { "sentry-trace": sentry, traceparent: parent } = tracingHeaders.parse(headers)

  if (sentry !== undefined) {
    const match = sentryTrace.exec(sentry.trim())
    const [, traceId, spanId] = match ?? []

    if (traceId && spanId && /[^0]/.test(traceId) && /[^0]/.test(spanId)) {
      return { traceId, spanId }
    }

    return undefined
  }

  return parent === undefined ? undefined : parseTraceparent(parent)
}

/** A failure's own `code` and its `details.code`, each when it's text. */
const codedFailure = z
  .object({ details: z.object({ code: textOrNothing }).optional().catch(undefined), code: textOrNothing })
  .catch({})

/** What a failure says its code is: a coded error's `details.code`, or an error's own `code`, such as Node's. */
export function errorCode(cause: unknown): string | undefined {
  const { details, code } = codedFailure.parse(cause)

  return details?.code ?? code
}

/** How a span ends: its outcome and the attributes learned on the way, such as a failure's code. */
export interface SpanEnd {
  outcome: Outcome
  attributes?: Attributes
}

/** How `endWhenSettled` ends a span, when its default doesn't say enough. */
export interface SettledAs<T> {
  /** How it ends when `work` returns: `ok` with nothing learned unless given. */
  result?(value: T): SpanEnd
  /** How it ends when `work` throws: `error` with the failure's code unless given. */
  error?(cause: unknown): SpanEnd
}

/**
 * Runs `work` and ends `span` when it settles: `ok`, or `error` with the failure's code, unless `settled` says how.
 * What `work` returns or throws passes through unchanged.
 */
export async function endWhenSettled<T>(
  span: { end: Span["end"] },
  work: () => T | Promise<T>,
  settled: SettledAs<T> = {}
): Promise<T> {
  let result: T

  try {
    result = await work()
  } catch (error) {
    if (settled.error) {
      const { outcome, attributes } = settled.error(error)
      span.end(outcome, attributes)
    } else {
      const code = errorCode(error)
      span.end("error", code === undefined ? undefined : { code })
    }

    throw error
  }

  if (settled.result) {
    const { outcome, attributes } = settled.result(result)
    span.end(outcome, attributes)
  } else {
    span.end("ok")
  }

  return result
}
