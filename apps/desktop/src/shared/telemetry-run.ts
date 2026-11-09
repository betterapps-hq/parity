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

    if (typeof run === "object" && run !== null) {
      const { installId, sessionId, check } = run as Record<string, unknown>

      if (typeof installId === "string" && typeof sessionId === "string" && typeof check === "boolean") {
        return { installId, sessionId, check }
      }
    }
  } catch {
    // Not passed as main writes it.
  }

  return { installId: "unknown", sessionId: "unknown", check: false }
}
