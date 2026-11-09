import {
  endWhenSettled,
  errorCode,
  type EventAttributes,
  type EventName,
  type Outcome,
  type registeredEvents,
  type Span,
  type Telemetry,
  type TraceContext,
  type TraceHeaders,
  traceHeaders
} from "@parity-app/telemetry"

type Events = typeof registeredEvents

type TraceName = EventName<Events>

/**
 * The trace the window is in: the action or gesture under way, which the service's requests carry, so the work it
 * causes in other processes is one trace with it (PAR-629). A page has no async context to follow, so it's the latest
 * one started that hasn't ended.
 */
let current: Span | undefined
let telemetry: Telemetry<Events> | undefined

/** The window's telemetry, once it has started; until then, as in stories and unit tests, nothing is traced. */
export function traceWith(started: Telemetry<Events>): void {
  telemetry = started
}

/** The headers a request to the service carries, or none outside an action or gesture. */
export function currentTraceHeaders(): TraceHeaders | undefined {
  return current ? traceHeaders(current) : undefined
}

/**
 * Where an event recorded now sits, in the action or gesture under way, for `track`'s `span` when the event is
 * recorded after it has ended or outside it, as a write's is once the service answers (PAR-752).
 */
export function currentTraceContext(): TraceContext | undefined {
  return current && contextOf(current)
}

const contextOf = ({ traceId, spanId }: Span): TraceContext => ({ traceId, spanId })

/** A trace the window is in until `end`, with how it ended and what was learned on the way. */
export interface Trace {
  /** Where it sits in its trace, for events recorded in it, even after it ends. None before telemetry starts. */
  readonly context: TraceContext | undefined
  end(outcome?: Outcome, attributes?: Record<string, unknown>): void
}

/** Starts a trace of its own for an action or gesture. */
export function startTrace<Name extends TraceName>(name: Name, attributes: EventAttributes<Events, Name>): Trace {
  if (!telemetry) {
    return { context: undefined, end: () => undefined }
  }

  const span = telemetry.startSpan(name, attributes)
  const previous = current
  current = span

  return {
    context: contextOf(span),
    end(outcome, learned) {
      span.end(outcome, learned)

      if (current === span) {
        current = previous
      }
    }
  }
}

/** A span the window started in the trace it's in, which `within` makes the trace work runs in. */
export interface Step extends Trace {
  /** Runs work in the span, so the requests it asks before it first waits carry it. */
  within<T>(work: () => T): T
}

/**
 * Starts a span under the trace the window is in, or as a trace of its own outside one, for work that outlasts what
 * started it, such as opening a project. Unlike `startTrace`, it isn't the trace the window is in until `within` says.
 */
export function startStep<Name extends TraceName>(name: Name, attributes: EventAttributes<Events, Name>): Step {
  if (!telemetry) {
    return { context: undefined, end: () => undefined, within: (work) => work() }
  }

  const span = telemetry.startSpan(name, attributes, current ? { parent: current } : undefined)

  return {
    context: contextOf(span),
    end: (outcome, learned) => span.end(outcome, learned),
    within(work) {
      const previous = current
      current = span

      try {
        return work()
      } finally {
        current = previous
      }
    }
  }
}

/**
 * Keeps the trace the window is in now, for work that runs later, such as a save the edit scheduled: what it gives runs
 * work in that trace, so its requests carry it.
 */
export function keepTrace(): <T>(work: () => T) => T {
  const kept = current

  return (work) => {
    const previous = current
    current = kept

    try {
      return work()
    } finally {
      current = previous
    }
  }
}

/** What `command.ran` records of a command as it starts. */
export type CommandAttributes = EventAttributes<Events, "command.ran">

/**
 * Runs a command in a trace of its own, recorded as `command.ran`, which lasts until what it returns settles when that's
 * a promise. What it returns or throws passes through unchanged.
 */
export function tracedCommand<T>(attributes: CommandAttributes, work: () => T): T {
  const trace = startTrace("command.ran", attributes)
  let result: T

  try {
    result = work()
  } catch (error) {
    const code = errorCode(error)
    trace.end("error", code === undefined ? undefined : { code })
    throw error
  }

  if (result instanceof Promise) {
    endWhenSettled(trace, () => result).catch(() => {
      // Its caller has the failure.
    })
  } else {
    trace.end("ok")
  }

  return result
}
