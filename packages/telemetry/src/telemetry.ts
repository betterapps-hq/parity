import type { Envelope, EventContext, Outcome, SpanEnvelope, TraceContext } from "./envelope.ts"
import type { EventAttributes, EventDefinition, EventName } from "./events.ts"
import { RingBuffer, recentEvents } from "./ring-buffer.ts"
import type { Sink } from "./sink.ts"
import { cryptoBytes, newSpanId, newTraceId, type RandomBytes } from "./trace.ts"

/** An event's attributes didn't match its schema, or it isn't registered. Thrown only while checking. */
export class TelemetryError extends Error {
  override readonly name = "TelemetryError"
}

/** A copy of an event's attributes, so a later change to the object the caller passed doesn't reach its sinks. */
function copyOf(attributes: unknown): Record<string, unknown> {
  return typeof attributes === "object" && attributes !== null ? { ...attributes } : {}
}

/** A span under way: its place in the trace, for spans and events under it, and `end` to record it. */
export interface Span extends TraceContext {
  readonly name: string
  /** Records the span as one event with its duration. Only the first call counts. */
  end(outcome?: Outcome): void
}

export interface TelemetryOptions<Events extends readonly EventDefinition[]> {
  /** Every event this process may record. */
  events: Events
  context: EventContext
  sinks: readonly Sink[]
  /**
   * Whether to check each event's attributes against its schema, and throw on a mismatch or an unknown name. On in
   * development and tests; off in installed builds, where checking would cost time on every event.
   */
  check: boolean
  /** How many recent events to keep, 500 unless given. */
  keep?: number
  /** Called with what a sink threw. A sink's failure never reaches the code that recorded the event. */
  onSinkError?: (error: unknown) => void
  /** The time in milliseconds since 1970, for tests. */
  now?: () => number
  /** A number from 0 up to 1, for sampling, for tests. */
  random?: () => number
  /** Random bytes for trace and span IDs, for tests. */
  randomBytes?: RandomBytes
}

export interface Telemetry<Events extends readonly EventDefinition[]> {
  /** Records an event, under `span` when given. Only registered names type-check. */
  track<Name extends EventName<Events>>(
    name: Name,
    attributes: EventAttributes<Events, Name>,
    options?: { span?: TraceContext }
  ): void
  /**
   * Starts a span, recorded as one event when it ends. It continues `parent`'s trace when given, as a span from
   * another process does, and starts a trace otherwise.
   */
  startSpan<Name extends EventName<Events>>(
    name: Name,
    attributes: EventAttributes<Events, Name>,
    options?: { parent?: TraceContext }
  ): Span
  /** Changes the window or project later events carry. */
  setContext(context: Partial<Pick<EventContext, "windowId" | "project">>): void
  /** The events and ended spans kept, oldest first. */
  recent(): Envelope[]
}

/**
 * The telemetry for one process: it checks, samples and sends each event to every sink, and keeps the most recent
 * ones (decisions.md, "Telemetry's event model is data in and data out in `@parity-app/telemetry`").
 */
export function createTelemetry<const Events extends readonly EventDefinition[]>(
  options: TelemetryOptions<Events>
): Telemetry<Events> {
  const {
    check,
    sinks,
    onSinkError,
    now = Date.now,
    random = Math.random,
    randomBytes = cryptoBytes,
    keep = recentEvents
  } = options
  const definitions = new Map<string, EventDefinition>()
  for (const definition of options.events) {
    if (definitions.has(definition.name)) throw new Error(`${definition.name} is registered twice`)
    definitions.set(definition.name, definition)
  }
  let context: EventContext = { ...options.context }
  const kept = new RingBuffer<Envelope>(keep)

  /** The event's definition, once its attributes are checked when checking. Undefined for an unknown name. */
  function definitionOf(name: string, attributes: unknown): EventDefinition | undefined {
    const definition = definitions.get(name)
    if (!check) return definition
    if (!definition) throw new TelemetryError(`${name} isn't a registered event`)
    const result = definition.schema.safeParse(attributes)
    if (!result.success) {
      const problems = result.error.issues.map((issue) => `${issue.path.join(".") || "attributes"}: ${issue.message}`)
      throw new TelemetryError(`${name}'s attributes don't match its schema: ${problems.join("; ")}`)
    }
    return definition
  }

  function deliver(send: (sink: Sink) => void): void {
    for (const sink of sinks) {
      try {
        send(sink)
      } catch (error) {
        onSinkError?.(error)
      }
    }
  }

  function envelope(
    definition: EventDefinition,
    time: number,
    attributes: Record<string, unknown>,
    at: EventContext = context
  ): Envelope {
    return { ...at, name: definition.name, time: new Date(time).toISOString(), level: definition.level, attributes }
  }

  return {
    track(name, attributes, { span } = {}) {
      const definition = definitionOf(name, attributes)
      if (!definition || random() >= definition.sample) return
      const recorded = envelope(definition, now(), copyOf(attributes))
      if (span) Object.assign(recorded, { traceId: span.traceId, spanId: span.spanId })
      kept.push(recorded)
      deliver((sink) => sink.event(recorded))
    },

    startSpan(name, attributes, { parent } = {}) {
      const definition = definitionOf(name, attributes)
      // A span sampled out still has IDs, so spans under it keep their trace.
      const sampled = definition !== undefined && random() < definition.sample
      const traceId = parent?.traceId ?? newTraceId(randomBytes)
      const spanId = newSpanId(randomBytes)
      const start = now()
      // It carries the window and project it started in.
      const startContext = context
      const copy = copyOf(attributes)
      let ended = false
      return {
        name,
        traceId,
        spanId,
        end(outcome = "ok") {
          if (ended) return
          ended = true
          if (!sampled || !definition) return
          const recorded: SpanEnvelope = {
            ...envelope(definition, start, copy, startContext),
            traceId,
            spanId,
            ...(parent ? { parentSpanId: parent.spanId } : {}),
            durationMs: Math.max(0, now() - start),
            outcome
          }
          kept.push(recorded)
          deliver((sink) => sink.span(recorded))
        }
      }
    },

    setContext(changes) {
      context = { ...context, ...changes }
    },

    recent: () => kept.toArray()
  }
}
