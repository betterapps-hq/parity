import { z } from "zod"
import type { JsonValue } from "./app-settings.ts"

/**
 * What main alone keeps in `settings.json` (`docs/proposals/settings.md`, Telemetry and updates): Settings' diagnostics
 * level and Get beta updates, which main changes through methods of their own, and the install ID it makes on the first
 * run. A window's change can't name them, since `settingsChange` takes only Parity's own settings.
 */
export interface SystemSettings {
  /** Share diagnostics: all, or off. */
  diagnostics: "all" | "off"
  betaUpdates: boolean
  /** A random ID, which Sentry reports as the user, so one computer's reports group together. None before the first run. */
  installId?: string
}

/** A change main makes to them. `newInstallId` is written only when the file has no install ID yet. */
export interface SystemChange {
  diagnostics?: "all" | "off"
  betaUpdates?: boolean
  installId?: string
  newInstallId?: string
}

const diagnostics = z.enum(["all", "off"])
const installId = z.uuid()

/** Each of them as `object` holds it, one that's missing or doesn't read at its default. */
export function systemOf(object: Record<string, JsonValue>): SystemSettings {
  const system: SystemSettings = {
    diagnostics: diagnostics.catch("all").parse(object["diagnostics"]),
    betaUpdates: z.boolean().catch(false).parse(object["betaUpdates"])
  }

  const id = installId.safeParse(object["installId"])

  if (id.success) {
    system.installId = id.data
  }

  return system
}

/** Them after a change. */
export function withSystemChange(system: SystemSettings, change: SystemChange | undefined): SystemSettings {
  if (!change) {
    return system
  }

  const next = { ...system }

  if (change.diagnostics !== undefined) {
    next.diagnostics = change.diagnostics
  }

  if (change.betaUpdates !== undefined) {
    next.betaUpdates = change.betaUpdates
  }

  if (change.installId !== undefined) {
    next.installId = change.installId
  } else if (change.newInstallId !== undefined && next.installId === undefined) {
    next.installId = change.newInstallId
  }

  return next
}
