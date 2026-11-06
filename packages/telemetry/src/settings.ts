/**
 * How much Parity sends to Sentry: everything, only errors and crashes, or nothing. Every run sends everything unless
 * it's turned down, as decided on 2026-11-05 (docs/decisions.md, "Parity's own telemetry goes to Sentry, on by
 * default").
 */
export type TelemetryLevel = "all" | "errors" | "off"

/** Which runs an event came from: a checkout, CI, or an installed build a tester runs. */
export type TelemetryEnvironment = "development" | "ci" | "tester"

/** The environment variables that decide what's sent. Empty counts as unset, as a shell's `NAME=` means. */
export interface TelemetryVariables {
  /** `all`, `errors` or `off`, in any case. */
  PARITY_TELEMETRY?: string | undefined
  /** The cross-tool opt-out (consoledonottrack.com): `1` or `true` turns everything off. */
  DO_NOT_TRACK?: string | undefined
  /** Set by Vitest, whose runs never send. */
  VITEST?: string | undefined
  /** Set by CI services, GitHub Actions among them. */
  CI?: string | undefined
}

const levels: readonly TelemetryLevel[] = ["all", "errors", "off"]

/**
 * The level these variables ask for. Unit tests and `DO_NOT_TRACK` turn it off whatever `PARITY_TELEMETRY` says;
 * without either, it's `PARITY_TELEMETRY`, or `all`. A value that isn't a level throws a `TypeError` naming it, so a
 * typo never sends what someone meant to turn off.
 */
export function telemetryLevel(variables: TelemetryVariables): TelemetryLevel {
  const asked = variables.PARITY_TELEMETRY?.trim().toLowerCase() || undefined
  if (asked !== undefined && !levels.includes(asked as TelemetryLevel)) {
    throw new TypeError(`PARITY_TELEMETRY is "${variables.PARITY_TELEMETRY}"; expected all, errors or off`)
  }
  if (variables.VITEST) return "off"
  if (/^(1|true)$/i.test(variables.DO_NOT_TRACK?.trim() ?? "")) return "off"
  return (asked as TelemetryLevel | undefined) ?? "all"
}

/** Which environment a run reports as: `ci` wherever CI is set, else `tester` for an installed build. */
export function telemetryEnvironment(variables: TelemetryVariables, installed: boolean): TelemetryEnvironment {
  if (variables.CI && !/^(0|false)$/i.test(variables.CI.trim())) return "ci"
  return installed ? "tester" : "development"
}
