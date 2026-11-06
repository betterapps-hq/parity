import * as Sentry from "@sentry/electron/utility"

/** How much of a builder's output goes with its crash. */
const builderLines = 50

/**
 * Starts sending the service's errors to Sentry through main, which decides whether anything leaves the computer
 * (PAR-620). Until it has run, as in unit tests, the reports below do nothing.
 */
export function startTelemetry(): void {
  // Named on each event, as main and the windows do; the worker's and builders' reports below name their own.
  Sentry.init({ beforeSend: (event) => ({ ...event, tags: { process: "service", ...event.tags } }) })
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
