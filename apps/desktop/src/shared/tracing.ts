import { AsyncLocalStorage } from "node:async_hooks"
import {
  endWhenSettled,
  type EventAttributes,
  type EventName,
  readTraceHeaders,
  type registeredEvents,
  type SettledAs,
  type Span,
  type Telemetry,
  type TraceContext,
  type TraceHeaders,
  traceHeaders
} from "@parity-app/telemetry"

type Events = typeof registeredEvents

/**
 * The span main or the service is working in, followed across `await`s, so a request it sends while answering another
 * carries that one's trace on (PAR-629). Node only: the windows keep theirs in `renderer/tracing.ts`.
 */
const current = new AsyncLocalStorage<TraceContext>()

/** This process's telemetry, once it has started; until then, as in unit tests, nothing is traced. */
let telemetry: Telemetry<Events> | undefined

export function traceWith(started: Telemetry<Events>): void {
  telemetry = started
}

/** The span this process is working in, for work that runs later, such as a queued job, to keep. */
export function currentTrace(): TraceContext | undefined {
  return current.getStore()
}

/** The headers that continue the span this process is working in, for a request it sends, or none outside one. */
export function currentTraceHeaders(): TraceHeaders | undefined {
  const span = current.getStore()

  return span ? traceHeaders(span) : undefined
}

/**
 * Runs `work` in a span under `parent`, or under the span this process is working in, ended when it settles with the
 * failure's code, or as `settled` says. Requests `work` sends carry the span on. `work` is given the span, to end it
 * first itself with what it learned, and none when nothing is traced.
 */
export function inSpan<Name extends EventName<Events>, T>(
  name: Name,
  attributes: EventAttributes<Events, Name>,
  work: (span?: Span) => T | Promise<T>,
  parent: TraceContext | undefined = current.getStore(),
  settled?: SettledAs<Awaited<T>>
): Promise<T> {
  if (!telemetry) {
    return Promise.resolve().then(() => work())
  }

  const span = telemetry.startSpan(name, attributes, parent ? { parent } : {})

  return current.run(span, () => endWhenSettled(span, () => work(span), settled))
}

/**
 * Records an event under the span this process is working in, or `span` when given. Until telemetry has started,
 * nothing is recorded. A mistake the development build's checks catch is logged rather than thrown, so it never stops
 * the work it describes.
 */
export function track<Name extends EventName<Events>>(
  name: Name,
  attributes: EventAttributes<Events, Name>,
  span: TraceContext | undefined = current.getStore()
): void {
  if (!telemetry) {
    return
  }

  try {
    telemetry.track(name, attributes, span ? { span } : {})
  } catch (error) {
    console.error("[telemetry]", error)
  }
}

/**
 * A channel's `around`, and the one for what a window asks main over IPC (PAR-810): each request's handler runs in a
 * `request.handled` span that continues the trace the request came with, or starts one when it came with none, as an
 * older sender's does. What the handler returns or throws passes through, and a failure's code is on the span.
 * Telemetry sent on to main, as `record`, isn't a span, since each would record another.
 */
export function handleInSpan<Result>(
  { method, trace }: { method: string; trace: unknown },
  answer: () => Result
): Result | Promise<Result> {
  if (method === "record") {
    return answer()
  }

  return inSpan("request.handled", { method }, answer, readTraceHeaders(trace))
}
