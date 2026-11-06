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
  attributes: Record<string, unknown>
}

/** A span's event, once it has ended. */
export type SpanEnvelope = Envelope & TraceContext & { durationMs: number; outcome: Outcome }
