import { z } from "zod"

/** How much an event matters, lowest first. `error` and `fatal` events become Sentry errors (PAR-627). */
export type Level = "debug" | "info" | "warn" | "error" | "fatal"

/** The process an event comes from. */
export type Process = "main" | "renderer" | "render" | "service" | "worker" | "builder" | "cli"

/** How a span ended: done, failed, or given up, as a gesture the person cancels. */
export type Outcome = "ok" | "error" | "cancelled"

/** Where an event sits in a trace, as W3C Trace Context has it: 32 and 16 lowercase hex digits. */
export interface TraceContext {
  traceId: string
  spanId: string
}

/** What every event carries besides its own attributes, set once for the process and changed as windows and projects do. */
export interface EventContext {
  process: Process
  /** The install's own ID, kept across runs. */
  installId: string
  /** This run of the app or CLI. */
  sessionId: string
  windowId?: string
  /** The open project's root. */
  project?: string
}

/**
 * One attribute's value, as an event's schema allows: text, a number, a flag, nothing, or lists and objects of them.
 * An optional attribute that isn't given is `undefined`.
 */
export type AttributeValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly AttributeValue[]
  | { readonly [field: string]: AttributeValue }

/** An event's attributes, by name. */
export interface Attributes {
  [name: string]: AttributeValue
}

/**
 * One recorded event, as every sink receives it. `time` is when it happened, or when a span started, in ISO 8601.
 * A span's event also has its `durationMs`, `outcome` and, under another span, `parentSpanId`.
 */
export interface Envelope extends EventContext {
  name: string
  time: string
  level: Level
  traceId?: string
  spanId?: string
  parentSpanId?: string
  durationMs?: number
  outcome?: Outcome
  attributes: Attributes
}

const attributeValue: z.ZodType<AttributeValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.undefined(),
    z.array(attributeValue),
    z.record(z.string(), attributeValue)
  ])
)

const hex = (length: number) => z.string().regex(new RegExp(`^[0-9a-f]{${length}}$`))

/**
 * An envelope as another process sends it to main, for the local copy and Sentry: checked there, since it crossed a
 * process boundary.
 */
export const envelopeSchema: z.ZodType<Envelope> = z.object({
  process: z.enum(["main", "renderer", "render", "service", "worker", "builder", "cli"]),
  installId: z.string(),
  sessionId: z.string(),
  windowId: z.string().optional(),
  project: z.string().optional(),
  name: z.string().min(1),
  time: z.iso.datetime(),
  level: z.enum(["debug", "info", "warn", "error", "fatal"]),
  traceId: hex(32).optional(),
  spanId: hex(16).optional(),
  parentSpanId: hex(16).optional(),
  durationMs: z.number().nonnegative().optional(),
  outcome: z.enum(["ok", "error", "cancelled"]).optional(),
  attributes: z.record(z.string(), attributeValue)
})

/** A span's event, once it has ended. */
export type SpanEnvelope = Envelope & TraceContext & { durationMs: number; outcome: Outcome }

/** Whether an envelope is a span's: it has its trace, its duration and how it ended. */
export function isSpanEnvelope(envelope: Envelope): envelope is SpanEnvelope {
  return (
    envelope.traceId !== undefined &&
    envelope.spanId !== undefined &&
    envelope.durationMs !== undefined &&
    envelope.outcome !== undefined
  )
}
