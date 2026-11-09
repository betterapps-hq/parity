import { z } from "zod"

/**
 * Whether Parity sends to Sentry: everything, or nothing. Every run sends unless it's turned off, as decided on
 * 2026-11-05 (docs/decisions.md, "Parity's own telemetry goes to Sentry, on by default"). There's no level between, as
 * you chose for PAR-626: "Either send or don't."
 */
export type TelemetryLevel = "all" | "off"

/** Which runs an event came from: a checkout, CI, or an installed build a tester runs. */
export type TelemetryEnvironment = "development" | "ci" | "tester"

/** The environment variables that decide what's sent. Empty counts as unset, as a shell's `NAME=` means. */
export interface TelemetryVariables {
  /** `all` or `off`, in any case. */
  PARITY_TELEMETRY?: string | undefined
  /** The cross-tool opt-out (consoledonottrack.com): `1` or `true` turns everything off. */
  DO_NOT_TRACK?: string | undefined
  /** Set by Vitest, whose runs never send. */
  VITEST?: string | undefined
  /** Set by CI services, GitHub Actions among them. */
  CI?: string | undefined
}

export const telemetryLevels: readonly TelemetryLevel[] = ["all", "off"]

/** The variable that decided the level instead of the setting. */
export type TelemetryOverride = "PARITY_TELEMETRY" | "DO_NOT_TRACK" | "VITEST"

/** The level a run sends at, the one Settings saved, and the variable that overrode it, if one did. */
export interface ResolvedTelemetry {
  level: TelemetryLevel
  setting: TelemetryLevel
  overriddenBy?: TelemetryOverride
  /**
   * Set in CI, which sends only its errors and reports, with their breadcrumbs: no spans, logs or Session Replay, which
   * stay in the local copy (PAR-777). CI's end-to-end runs sent nine in ten of `parity-desktop`'s spans.
   */
  errorsOnly?: true
}

/**
 * The level for this run, from the variables and the saved setting (PAR-626). Unit tests and `DO_NOT_TRACK` turn it
 * off whatever else says; then `PARITY_TELEMETRY`; then the setting, which is `all` until someone changes it. A
 * `PARITY_TELEMETRY` that isn't a level throws a `TypeError` naming it, so a typo never sends what someone meant to turn
 * off. In CI, whatever the level, only errors and reports are sent (PAR-777).
 */
export function resolveTelemetry(variables: TelemetryVariables, setting: TelemetryLevel = "all"): ResolvedTelemetry {
  const resolved = resolveLevel(variables, setting)

  return inCi(variables) ? { ...resolved, errorsOnly: true } : resolved
}

function resolveLevel(variables: TelemetryVariables, setting: TelemetryLevel): ResolvedTelemetry {
  const asked = variables.PARITY_TELEMETRY?.trim().toLowerCase() || undefined

  if (asked !== undefined && !telemetryLevels.includes(asked as TelemetryLevel)) {
    throw new TypeError(`PARITY_TELEMETRY is "${variables.PARITY_TELEMETRY}"; expected all or off`)
  }

  if (variables.VITEST) {
    return { level: "off", setting, overriddenBy: "VITEST" }
  }

  if (/^(1|true)$/i.test(variables.DO_NOT_TRACK?.trim() ?? "")) {
    return { level: "off", setting, overriddenBy: "DO_NOT_TRACK" }
  }

  if (asked !== undefined) {
    return { level: asked as TelemetryLevel, setting, overriddenBy: "PARITY_TELEMETRY" }
  }

  return { level: setting, setting }
}

/** The level these variables and the saved setting ask for, as `resolveTelemetry` decides it. */
export function telemetryLevel(variables: TelemetryVariables, setting?: TelemetryLevel): TelemetryLevel {
  return resolveTelemetry(variables, setting).level
}

/** The file in the desktop app's data folder that keeps the setting and the install ID, for the app and the CLI. */
export const telemetryFileName = "telemetry.json"

const savedTelemetry = z.object({
  /** The level chosen in Settings. */
  level: z.enum(["all", "off"]).catch("all"),
  /** A random ID made on the first run, which Sentry reports as the user, so one computer's reports group together. */
  installId: z.uuid().optional().catch(undefined)
})

export type SavedTelemetry = z.infer<typeof savedTelemetry>

/**
 * What `telemetry.json` holds. A missing or unreadable file, or a value that doesn't read, as from another version,
 * counts as unset: the level is then `all`, and the app makes a new install ID.
 */
export function readSavedTelemetry(text: string | undefined): SavedTelemetry {
  let value: unknown = {}

  try {
    if (text !== undefined) {
      value = JSON.parse(text)
    }
  } catch {
    // Unreadable counts as unset.
  }

  return savedTelemetry.catch({ level: "all" }).parse(value)
}

/** What decides where the desktop app keeps its data: the system, its variables and the home folder. */
export interface DataFolderContext {
  platform: string
  env: { PARITY_USER_DATA?: string | undefined; APPDATA?: string | undefined; XDG_CONFIG_HOME?: string | undefined }
  home: string
}

/**
 * The desktop app's data folder, as main sets it from Electron's `appData` folder, so the CLI can read the same
 * `telemetry.json` (PAR-642). `PARITY_USER_DATA` names another copy's folder, as it does for the app.
 */
export function desktopDataFolder({ platform, env, home }: DataFolderContext): string {
  if (env.PARITY_USER_DATA) {
    return env.PARITY_USER_DATA
  }

  const separator = platform === "win32" ? "\\" : "/"
  let appData = env.XDG_CONFIG_HOME || [home, ".config"].join(separator)

  if (platform === "win32") {
    appData = env.APPDATA || [home, "AppData", "Roaming"].join(separator)
  } else if (platform === "darwin") {
    appData = [home, "Library", "Application Support"].join(separator)
  }

  return [appData, "@parity", "desktop"].join(separator)
}

/** Which environment a run reports as: `ci` wherever CI is set, else `tester` for an installed build. */
export function telemetryEnvironment(variables: TelemetryVariables, installed: boolean): TelemetryEnvironment {
  if (inCi(variables)) {
    return "ci"
  }

  return installed ? "tester" : "development"
}

/** Whether this run is in CI: `CI` is set, and not to `0` or `false`. */
function inCi(variables: TelemetryVariables): boolean {
  return Boolean(variables.CI) && !/^(0|false)$/i.test(variables.CI?.trim() ?? "")
}
