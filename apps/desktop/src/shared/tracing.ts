import { AsyncLocalStorage } from "node:async_hooks"
import {
  endWhenSettled,
  type EventAttributes,
  type EventName,
  readTraceHeaders,
  type registeredEvents,
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
 * failure's code. Requests `work` sends carry the span on.
 */
export function inSpan<Name extends EventName<Events>, T>(
  name: Name,
  attributes: EventAttributes<Events, Name>,
  work: () => T | Promise<T>,
  parent: TraceContext | undefined = current.getStore()
): Promise<T> {
  if (!telemetry) return Promise.resolve().then(work)
  const span = telemetry.startSpan(name, attributes, parent ? { parent } : {})
  return current.run(span, () => endWhenSettled(span, work))
}

/**
 * Records an event under the span this process is working in. Until telemetry has started, nothing is recorded. A
 * mistake the development build's checks catch is logged rather than thrown, so it never stops the work it describes.
 */
export function track<Name extends EventName<Events>>(name: Name, attributes: EventAttributes<Events, Name>): void {
  if (!telemetry) return
  const span = current.getStore()
  try {
    telemetry.track(name, attributes, span ? { span } : {})
  } catch (error) {
    console.error("[telemetry]", error)
  }
}

/**
 * A channel's `around`: each request's handler runs in a `request.handled` span that continues the trace the request
 * came with, or starts one when it came with none, as an older sender's does. Telemetry sent on to main isn't a span,
 * since each would record another.
 */
export function handleInSpan({ method, trace }: { method: string; trace: unknown }, answer: () => unknown): unknown {
  if (method === "record") return answer()
  return inSpan("request.handled", { method }, answer, readTraceHeaders(trace))
}
