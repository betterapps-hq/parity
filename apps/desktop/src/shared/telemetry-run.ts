import { isComposite, isText } from "@parity-app/core/values/evaluate"

/**
 * What main tells the other processes about this run for their telemetry: the install and session every event carries,
 * and whether events are checked against their schemas, as they are outside installed builds.
 */
export interface TelemetryRun {
  installId: string
  sessionId: string
  check: boolean
}

/** The window's command-line argument, and the service's environment variable, that carry the run. */
export const telemetryRunArgument = "--parity-telemetry-run="
export const telemetryRunVariable = "PARITY_TELEMETRY_RUN"

/** The run as main passes it, in characters safe in a command line or an environment variable. */
export function writeTelemetryRun(run: TelemetryRun): string {
  return encodeURIComponent(JSON.stringify(run))
}

/**
 * The run main passed, or one naming neither, as in unit tests, where no main started the process. It's read without
 * zod, which the windows' preload scripts can't load.
 */
export function readTelemetryRun(text: string | undefined): TelemetryRun {
  try {
    const run: unknown = text ? JSON.parse(decodeURIComponent(text)) : undefined

    if (isTelemetryRun(run)) {
      return { installId: run.installId, sessionId: run.sessionId, check: run.check }
    }
  } catch {
    // Not passed as main writes it.
  }

  return { installId: "unknown", sessionId: "unknown", check: false }
}

/** Whether what main passed is a run, checked by hand since zod can't load here. */
function isTelemetryRun(value: unknown): value is TelemetryRun {
  return (
    isComposite(value) &&
    "installId" in value &&
    isText(value.installId) &&
    "sessionId" in value &&
    isText(value.sessionId) &&
    "check" in value &&
    (value.check === true || value.check === false)
  )
}
