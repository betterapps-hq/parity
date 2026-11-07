import { createScrubber, createTelemetry, registeredEvents, type Sink, type Telemetry } from "@parity-app/telemetry"
import * as Sentry from "@sentry/electron/renderer"
import type { ErrorInfo } from "react"
import { recordInvalidData } from "../shared/invalid-data.ts"
import { createSentrySink } from "../shared/sentry-sink.ts"
import { readTelemetryRun } from "../shared/telemetry-run.ts"
import { bitmapAttachment, framesAttachment, framesOnScreen, onFailedRender } from "./canvas/frames-on-screen.ts"

/**
 * Sends this window's uncaught errors to Sentry through main, which decides whether anything leaves the computer
 * (PAR-620). Only errors thrown from Parity's own pages count: a project's components run in the same page, and their
 * errors are the project's to show, not Parity's bugs. Gives the window's telemetry (PAR-627). The editor window passes
 * its replay options (`replay.ts`, PAR-624).
 */
export function startTelemetry(options: Parameters<typeof Sentry.init>[0] = {}): Telemetry<typeof registeredEvents> {
  // Named on each event, since this window's scope is copied into main's: the editor window, or an offscreen renderer.
  const kind = location.pathname.endsWith("/render.html") ? "render" : "renderer"
  // Secrets are scrubbed before an event leaves the window, and again in main (PAR-621).
  const scrubber = createScrubber()
  Sentry.init({
    ...options,
    allowUrls: [location.origin],
    beforeSend: (event, hint) => {
      // An error says which frames were on the canvas (PAR-624).
      const frames = framesOnScreen()
      if (frames.length > 0) hint.attachments = [...(hint.attachments ?? []), framesAttachment(frames)]
      return scrubber.value({ ...event, tags: { ...event.tags, process: kind } })
    },
    beforeSendTransaction: (event) => scrubber.value(event),
    beforeSendLog: (log) => scrubber.value(log),
    beforeBreadcrumb: (breadcrumb) => scrubber.value(breadcrumb)
  })
  onFailedRender(reportFailedRender)
  // Events are this window's breadcrumbs and errors, and go to main for the local copy, Sentry's logs and spans.
  const host = window.parityTelemetry
  const run = host?.run ?? readTelemetryRun(undefined)
  const toMain: Sink[] = host
    ? [{ event: (envelope) => host.record(envelope), span: (envelope) => host.record(envelope) }]
    : []
  return recordInvalidData(
    createTelemetry({
      events: registeredEvents,
      context: { process: kind, installId: run.installId, sessionId: run.sessionId },
      sinks: [
        createSentrySink({
          addBreadcrumb: (breadcrumb) => Sentry.addBreadcrumb(breadcrumb),
          captureEvent: (event) => void Sentry.captureEvent(event)
        }),
        ...toMain
      ],
      check: run.check,
      onSinkError: (error) => console.warn("[telemetry] a sink failed:", error)
    })
  )
}

/** Reports a frame that couldn't be drawn offscreen, with the bitmap it last showed. */
function reportFailedRender(error: unknown, drawn: { key: string; state?: string; mode?: string }): void {
  const bitmap = bitmapAttachment(framesOnScreen(), drawn)
  Sentry.captureException(error, {
    captureContext: { tags: { render: "failed" }, contexts: { render: { ...drawn, bitmap: bitmap !== undefined } } },
    ...(bitmap ? { attachments: [bitmap] } : {})
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
