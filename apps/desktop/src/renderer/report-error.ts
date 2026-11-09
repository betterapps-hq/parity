import { errorDetails } from "@parity-app/core"
import type { EventAttributes, EventName, registeredEvents, Telemetry, TraceContext } from "@parity-app/telemetry"
import { type ExternalToast, toast } from "sonner"
import type { Attributes } from "./chrome/event-attributes.ts"

type Events = typeof registeredEvents

/** The window's telemetry, once `startTelemetry` has made it. Stories and tests run without one, or with a test sink's. */
let telemetry: Telemetry<Events> | undefined

export function setWindowTelemetry(next: Telemetry<Events> | undefined): void {
  telemetry = next
}

/**
 * Records an event from this window. A mistake in recording one, caught by the development build's checks, is logged
 * rather than thrown, so it never stops what the person did.
 */
export function track<Name extends EventName<Events>>(
  name: Name,
  attributes: EventAttributes<Events, Name>,
  options?: { span?: TraceContext }
): void {
  try {
    telemetry?.track(name, attributes, options)
  } catch (error) {
    console.error("[telemetry]", error)
  }
}

/** A failure's message, as its notification says it. */
export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** A failure's `CodedError` code, when it has one. */
export function errorCode(cause: unknown): string | undefined {
  return errorDetails(cause)?.code
}

export interface ReportContext extends ExternalToast {
  /** What failed, as `document.save`; recorded as the event's `action`. */
  operation: string
  /** The notification's title. */
  title: string
  /** What it was acting on. */
  context?: Record<string, string | number | boolean>
  /** The trace it belongs to. */
  span?: TraceContext
}

/**
 * Shows a failure as an error notification and records it as `error.caught`, with its code, what failed and what it was
 * acting on (PAR-632). Every error notification goes through here.
 */
export function reportError(cause: unknown, { operation, title, context, span, ...shown }: ReportContext): void {
  toast.error(title, shown)
  const caught: Attributes<"error.caught"> = { action: operation, title, message: errorMessage(cause) }
  const code = errorCode(cause)

  if (code) {
    caught.code = code
  }

  if (context) {
    caught.context = context
  }

  track("error.caught", caught, span ? { span } : undefined)
}
