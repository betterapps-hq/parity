import type { Envelope, Level, SpanEnvelope } from "./envelope.ts"
import { isErrorEvent, type Sink } from "./sink.ts"

/*
 * How envelopes become Sentry's breadcrumbs, errors, logs and transactions, shared by the app and the CLI (PAR-642).
 * The package still never imports Sentry: these are the parts of Sentry's own types the mapping fills in, which each
 * process's Sentry module accepts as they are.
 */

export type SeverityLevel = "debug" | "info" | "warning" | "error" | "fatal"

export interface Breadcrumb {
  type: "default"
  category: string
  level: SeverityLevel
  timestamp: number
  data: Record<string, unknown>
}

export interface Event {
  type?: "transaction"
  level: SeverityLevel
  message?: string
  timestamp: number
  start_timestamp?: number
  transaction?: string
  transaction_info?: { source: "custom" }
  tags: Record<string, string>
  contexts: {
    parity?: Record<string, unknown>
    trace?: {
      trace_id: string
      span_id: string
      parent_span_id?: string
      op?: string
      status?: string
      origin?: "manual"
      data?: Record<string, unknown>
    }
  }
  spans?: []
}

/** A Sentry structured log: its level, its message, the attributes it's searched by, and the trace it belongs to. */
export interface SentryLog {
  level: Level
  message: string
  attributes: Record<string, unknown>
  traceId?: string
}

/** What the sink does with Sentry, which each process's own Sentry module provides. */
export interface SentryTarget {
  addBreadcrumb(breadcrumb: Breadcrumb): void
  captureEvent(event: Event): void
  /** Only main sends logs, so only it needs this. */
  log?(log: SentryLog): void
}

const severities: Record<Level, SeverityLevel> = {
  debug: "debug",
  info: "info",
  warn: "warning",
  error: "error",
  fatal: "fatal"
}

const seconds = (time: string) => Date.parse(time) / 1000

/** The envelope's own fields besides its name, time and level, for a breadcrumb's data or an error's context. */
function details(envelope: Envelope): Record<string, unknown> {
  const { name: _name, time: _time, level: _level, attributes, ...rest } = envelope

  return { ...rest, ...attributes }
}

/** An event or span as a breadcrumb, which goes with the next error its process sends. */
export function breadcrumbOf(envelope: Envelope): Breadcrumb {
  return {
    type: "default",
    category: envelope.name,
    level: severities[envelope.level],
    timestamp: seconds(envelope.time),
    data: details(envelope)
  }
}

/**
 * An `error.*` event as a Sentry error. Its message is the event's `message` attribute when it has one, named by the
 * event; its attributes go as a context, and its trace links the error to the trace it happened in.
 */
export function errorOf(envelope: Envelope): Event {
  const { message } = envelope.attributes

  return {
    level: severities[envelope.level],
    message: typeof message === "string" && message ? `${envelope.name}: ${message}` : envelope.name,
    timestamp: seconds(envelope.time),
    tags: { process: envelope.process, event: envelope.name },
    contexts: {
      parity: details(envelope),
      ...(envelope.traceId && envelope.spanId
        ? { trace: { trace_id: envelope.traceId, span_id: envelope.spanId } }
        : {})
    }
  }
}

/**
 * An event as a Sentry structured log. Its message is its name, and its attributes are searchable as they are, beside
 * the envelope's fields under `parity.`.
 */
export function logOf(envelope: Envelope): SentryLog {
  const fields = {
    process: envelope.process,
    install_id: envelope.installId,
    session_id: envelope.sessionId,
    window_id: envelope.windowId,
    project: envelope.project,
    span_id: envelope.spanId,
    parent_span_id: envelope.parentSpanId,
    duration_ms: envelope.durationMs,
    outcome: envelope.outcome
  }

  const attributes: Record<string, unknown> = { ...envelope.attributes }

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      attributes[`parity.${key}`] = value
    }
  }

  return {
    level: envelope.level,
    message: envelope.name,
    attributes,
    ...(envelope.traceId ? { traceId: envelope.traceId } : {})
  }
}

const statuses = { ok: "ok", error: "internal_error", cancelled: "cancelled" } as const

/**
 * A span as a Sentry transaction of its own, with Parity's trace and span IDs, so spans from every process and the CLI
 * join in one trace by their parents.
 */
export function transactionOf(span: SpanEnvelope): Event {
  const start = seconds(span.time)

  return {
    type: "transaction",
    transaction: span.name,
    transaction_info: { source: "custom" },
    start_timestamp: start,
    timestamp: start + span.durationMs / 1000,
    level: severities[span.level],
    tags: { process: span.process },
    contexts: {
      trace: {
        trace_id: span.traceId,
        span_id: span.spanId,
        ...(span.parentSpanId ? { parent_span_id: span.parentSpanId } : {}),
        op: span.name,
        status: statuses[span.outcome],
        origin: "manual",
        data: logOf(span).attributes
      }
    },
    spans: []
  }
}

/**
 * The sink each process records into Sentry's scope with: every event and span becomes a breadcrumb, so an error carries
 * the events before it, and each `error.*` event becomes a Sentry error. With `upload`, as in main, which every
 * process's events reach, events also become structured logs and spans become Sentry spans.
 */
export function createSentrySink(target: SentryTarget, { upload = false, scope = true } = {}): Sink {
  return {
    event(envelope) {
      if (scope) {
        target.addBreadcrumb(breadcrumbOf(envelope))

        if (isErrorEvent(envelope)) {
          target.captureEvent(errorOf(envelope))
        }
      }

      if (upload) {
        target.log?.(logOf(envelope))
      }
    },
    span(envelope) {
      if (scope) {
        target.addBreadcrumb(breadcrumbOf(envelope))
      }

      if (upload) {
        target.captureEvent(transactionOf(envelope))
      }
    }
  }
}
