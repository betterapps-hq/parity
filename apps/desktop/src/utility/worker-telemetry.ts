import type { MessagePort } from "node:worker_threads"
import { createTelemetry, registeredEvents, type Telemetry } from "@parity-app/telemetry"
import { recordInvalidData } from "../shared/invalid-data.ts"
import { readTelemetryRun, telemetryRunVariable } from "../shared/telemetry-run.ts"

/** The key the props worker's messages carry an event under, beside its channel's own messages. */
export const workerTelemetryKey = "parityTelemetry"

/**
 * The props worker's telemetry. It has no Sentry of its own, so it posts each event to the service, which adds it to
 * its breadcrumbs and errors and sends it on to main (PAR-627).
 */
export function startWorkerTelemetry(port: Pick<MessagePort, "postMessage">): Telemetry<typeof registeredEvents> {
  const run = readTelemetryRun(process.env[telemetryRunVariable])
  const post = (envelope: unknown) => port.postMessage({ [workerTelemetryKey]: envelope })
  return recordInvalidData(
    createTelemetry({
      events: registeredEvents,
      context: { process: "worker", installId: run.installId, sessionId: run.sessionId },
      sinks: [{ event: post, span: post }],
      check: run.check,
      onSinkError: (error) => console.warn("[telemetry] a sink failed:", error)
    })
  )
}
