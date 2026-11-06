import { createScrubber } from "@parity-app/telemetry"
import * as Sentry from "@sentry/electron/renderer"
import type { ErrorInfo } from "react"

/**
 * Sends this window's uncaught errors to Sentry through main, which decides whether anything leaves the computer
 * (PAR-620). Only errors thrown from Parity's own pages count: a project's components run in the same page, and their
 * errors are the project's to show, not Parity's bugs.
 */
export function startTelemetry(): void {
  // Named on each event, since this window's scope is copied into main's: the editor window, or an offscreen renderer.
  const kind = location.pathname.endsWith("/render.html") ? "render" : "renderer"
  // Secrets are scrubbed before an event leaves the window, and again in main (PAR-621).
  const scrubber = createScrubber()
  Sentry.init({
    allowUrls: [location.origin],
    beforeSend: (event) => scrubber.value({ ...event, tags: { ...event.tags, process: kind } }),
    beforeSendTransaction: (event) => scrubber.value(event),
    beforeSendLog: (log) => scrubber.value(log),
    beforeBreadcrumb: (breadcrumb) => scrubber.value(breadcrumb)
  })
}

/**
 * React's error handlers for a root, which report what a render threw with the components it was in. React logs each
 * itself only when a root has none, so they're logged here too.
 */
export const reactErrorHandlers = {
  onUncaughtError: (error: unknown, info: ErrorInfo) => report(error, info, false),
  onCaughtError: (error: unknown, info: ErrorInfo) => report(error, info, true)
}

function report(error: unknown, { componentStack }: ErrorInfo, caught: boolean): void {
  console.error(error)
  Sentry.captureException(error, {
    mechanism: { type: "react", handled: caught },
    captureContext: { contexts: { react: { componentStack } } }
  })
}
