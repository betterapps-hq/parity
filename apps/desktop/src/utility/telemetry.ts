import {
  createTelemetry,
  envelopeSchema,
  isSpanEnvelope,
  registeredEvents,
  type Sink,
  type Telemetry
} from "@parity-app/telemetry"
import { createSentrySink, sentryScrubbing } from "@parity-app/telemetry"
import * as Sentry from "@sentry/electron/utility"
import { recordInvalidData } from "../shared/invalid-data.ts"
import { secretScrubbing } from "../shared/secret-scrubbing.ts"
import { readTelemetryRun, telemetryRunVariable } from "../shared/telemetry-run.ts"
import { mainProcess } from "./main-process.ts"
import { workerTelemetryKey } from "./worker-telemetry.ts"

/** How much of a builder's output goes with its crash. */
const builderLines = 50

/**
 * Starts sending the service's errors to Sentry through main, which decides whether anything leaves the computer
 * (PAR-620), and gives the service's telemetry: its events are its breadcrumbs and errors, and go to main for the local
 * copy and Sentry's logs and spans (PAR-627). Until it has run, as in unit tests, the reports below do nothing.
 */
export function startTelemetry(): Telemetry<typeof registeredEvents> {
  // Named on each event, as main and the windows do; the worker's and builders' reports below name their own.
  Sentry.init({
    ...sentryScrubbing(scrubber, Sentry),
    beforeSend: (event) => scrubber.value({ ...event, tags: { process: "service", ...event.tags } })
  })
  const run = readTelemetryRun(process.env[telemetryRunVariable])
  const telemetry = recordInvalidData(
    createTelemetry({
      events: registeredEvents,
      context: { process: "service", installId: run.installId, sessionId: run.sessionId },
      sinks: [scopeSink, toMain],
      check: run.check,
      onSinkError: (error) => console.warn("[telemetry] a sink failed:", error)
    })
  )
  scrubber.follow(telemetry)
  return telemetry
}

/**
 * Secrets are scrubbed before an event leaves the service, and again in main (PAR-621), the open projects' `.env`
 * values included (PAR-672).
 */
const scrubber = secretScrubbing()

/** A copy of the value with secrets replaced, the open projects' `.env` values included, as `Scrubber.value`. */
export function scrubSecrets<T>(value: T): T {
  return scrubber.value(value)
}

/** Scrubs the open projects' `.env` values from now on, here and in main, which passes them to every window. */
export function useProjectSecrets(secrets: string[]): void {
  scrubber.use(secrets)
  mainProcess.request("secrets", secrets).catch(() => {
    // Main went away, and its scrubber with it.
  })
}

/** The service's Sentry scope: events are its breadcrumbs, and `error.*` events its errors. */
const scopeSink = createSentrySink({
  addBreadcrumb: (breadcrumb) => Sentry.addBreadcrumb(breadcrumb),
  captureEvent: (event) => void Sentry.captureEvent(event)
})

/** Main, which writes the local copy and sends Sentry's logs and spans. Requests wait until main's channel connects. */
const record = (envelope: unknown) =>
  mainProcess.request("record", envelope).catch(() => {
    // Main went away; the event is lost with it.
  })
const toMain: Sink = { event: record, span: record }

/**
 * Records what the props worker sent, which has no Sentry of its own: it joins the service's breadcrumbs and errors,
 * then goes to main. Other messages are the worker's channel's.
 */
export function recordFromWorker(message: unknown): void {
  if (typeof message !== "object" || message === null || !(workerTelemetryKey in message)) return
  const read = envelopeSchema.safeParse((message as Record<string, unknown>)[workerTelemetryKey])
  if (!read.success) return
  const envelope = read.data
  for (const sink of [scopeSink, toMain]) {
    try {
      if (isSpanEnvelope(envelope)) sink.span(envelope)
      else sink.event(envelope)
    } catch (error) {
      console.warn("[telemetry] couldn't record the worker's event:", error)
    }
  }
}

/** Reports the props worker failing, which only the service sees. */
export function reportWorkerError(error: Error): void {
  Sentry.captureException(error, { captureContext: { tags: { process: "worker" } } })
}

/** Reports a builder that stopped by itself, with how it ended and the last of what it printed. */
export function reportBuilderCrash(builder: string, why: string, output: string): void {
  const lines = output.trimEnd().split(/\r?\n/).slice(-builderLines).join("\n")
  Sentry.captureMessage(why, {
    level: "error",
    tags: { process: "builder", builder },
    contexts: { builder: { output: lines } }
  })
}
