import { createTelemetry, registeredEvents, type Sink, type Telemetry } from "@parity-app/telemetry"
import { createSentrySink, sentryScrubbing } from "@parity-app/telemetry"
import * as Sentry from "@sentry/electron/renderer"
import type { Component, ErrorInfo } from "react"
import { z } from "zod"
import { recordInvalidData } from "../shared/invalid-data.ts"
import { secretScrubbing } from "../shared/secret-scrubbing.ts"
import { readTelemetryRun } from "../shared/telemetry-run.ts"
import { bitmapAttachment, framesAttachment, framesOnScreen, onFailedRender } from "./canvas/frames-on-screen.ts"
import { consoleCallStack, loggedByProject } from "./console-breadcrumbs.ts"

/**
 * Scrubs secrets from what this window sends before it leaves, and main scrubs them again (PAR-621), the open projects'
 * `.env` values included, which main passes on from the service (PAR-672). The editor window's replays use it too
 * (`replay.ts`, PAR-679).
 */
export const scrubber = secretScrubbing()

/**
 * Sends this window's uncaught errors to Sentry through main, which decides whether anything leaves the computer
 * (PAR-620). Only errors thrown from Parity's own pages count: a project's components run in the same page, and their
 * errors are the project's to show, not Parity's bugs. Gives the window's telemetry (PAR-627). The editor window passes
 * its replay options (`replay.ts`, PAR-624).
 */
export function startTelemetry(options: Parameters<typeof Sentry.init>[0] = {}): Telemetry<typeof registeredEvents> {
  // Named on each event, since this window's scope is copied into main's: the editor window, or an offscreen renderer.
  const kind = location.pathname.endsWith("/render.html") ? "render" : "renderer"
  window.parityTelemetry?.onSecrets((secrets) => scrubber.use(secrets))
  const scrubbing = sentryScrubbing(scrubber, Sentry)
  Sentry.init({
    ...options,
    allowUrls: [location.origin],
    ...scrubbing,
    // What the project's own code logs is the project's, so only Parity's console calls become breadcrumbs (PAR-814).
    beforeBreadcrumb: (breadcrumb) =>
      breadcrumb.category === "console" && loggedByProject(consoleCallStack(), location.origin)
        ? null
        : scrubbing.beforeBreadcrumb(breadcrumb),
    beforeSend: (event, hint) => {
      // An error says which frames were on the canvas (PAR-624).
      const frames = framesOnScreen()

      if (frames.length > 0) {
        hint.attachments = [...(hint.attachments ?? []), framesAttachment(frames)]
      }

      return scrubber.value({ ...event, tags: { ...event.tags, process: kind } })
    }
  })
  onFailedRender(reportFailedRender)
  // Events are this window's breadcrumbs and errors, and go to main for the local copy, Sentry's logs and spans.
  const host = window.parityTelemetry
  const run = host?.run ?? readTelemetryRun(undefined)

  const toMain: Sink[] = host
    ? [{ event: (envelope) => host.record(envelope), span: (envelope) => host.record(envelope) }]
    : []

  const telemetry = recordInvalidData(
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

  scrubber.follow(telemetry)

  return telemetry
}

/** Reports a frame that couldn't be drawn offscreen, with the bitmap it last showed. */
function reportFailedRender(cause: unknown, drawn: { key: string; state?: string; mode?: string }): void {
  const bitmap = bitmapAttachment(framesOnScreen(), drawn)

  const hint: Sentry.EventHint = {
    captureContext: { tags: { render: "failed" }, contexts: { render: { ...drawn, bitmap: bitmap !== undefined } } }
  }

  if (bitmap) {
    hint.attachments = [bitmap]
  }

  Sentry.captureException(cause, hint)
}

/**
 * React's error handlers for a root, which report what a render threw with the components it was in. React logs each
 * itself only when a root has none, so they're logged here too.
 */
export const reactErrorHandlers = {
  onUncaughtError: (cause: unknown, info: CaughtInfo) => report(cause, info, false),
  onCaughtError: (cause: unknown, info: CaughtInfo) => report(cause, info, true)
}

/** What React says about an error, with the boundary that caught it, if one did. */
type CaughtInfo = ErrorInfo & { errorBoundary?: Component<unknown> }

/** The name of the error boundary that caught an error (`chrome/ErrorBoundary.tsx`, PAR-667), for its Sentry tag. */
function boundaryName(info: CaughtInfo): string | undefined {
  return namedBoundary.safeParse(info.errorBoundary?.props).data?.name
}

/** An error boundary's props, read only for its name, since React types any component as the boundary. */
const namedBoundary = z.object({ name: z.string() })

/** The Sentry event of each error a boundary caught, so a report from its fallback can name it (PAR-704). */
const caughtEvents = new WeakMap<object, string>()

/** The Sentry event an error a boundary caught was sent as, if it was an object and was sent. */
export function caughtEventId(cause: unknown): string | undefined {
  return cause instanceof Object ? caughtEvents.get(cause) : undefined
}

function report(cause: unknown, info: CaughtInfo, caught: boolean): void {
  console.error(cause)
  const boundary = boundaryName(info)

  const contexts = { react: { componentStack: info.componentStack } }

  const eventId = Sentry.captureException(cause, {
    mechanism: { type: "react", handled: caught },
    captureContext: boundary ? { contexts, tags: { boundary } } : { contexts }
  })

  if (caught && eventId && cause instanceof Object) {
    caughtEvents.set(cause, eventId)
  }
}
