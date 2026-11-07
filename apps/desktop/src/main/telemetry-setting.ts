import {
  readSavedTelemetry,
  resolveTelemetry,
  type SavedTelemetry,
  type TelemetryLevel,
  type TelemetryVariables
} from "@parity-app/telemetry"
import type { TelemetryState } from "../shared/protocol.ts"

export interface TelemetrySettingOptions {
  /** The variables this run started with, which override the setting. */
  env: TelemetryVariables
  /** `telemetry.json`'s text, or undefined when there's none. */
  read: () => string | undefined
  save: (text: string) => void
  /** A new random install ID. */
  newId: () => string
}

/**
 * The diagnostics level from Settings and the install ID, kept in `telemetry.json` in the app's data folder so the CLI
 * reads the same (PAR-626). The first run makes the install ID. A file that can't be written leaves this run's ID unsaved.
 */
export class TelemetrySetting {
  private saved: SavedTelemetry & { installId: string }

  constructor(private readonly options: TelemetrySettingOptions) {
    const saved = readSavedTelemetry(options.read())
    if (saved.installId) {
      this.saved = { ...saved, installId: saved.installId }
      return
    }
    this.saved = { ...saved, installId: options.newId() }
    try {
      this.write(this.saved)
    } catch {
      // The ID still names this run's reports; the next run makes another.
    }
  }

  get(): TelemetryState {
    // The variables were read at start, and a bad PARITY_TELEMETRY stopped the app then, so this can't throw.
    return { ...resolveTelemetry(this.options.env, this.saved.level), installId: this.saved.installId }
  }

  /**
   * Saves the level chosen in Settings. Off also replaces the install ID, so reports after turning it on again don't
   * join the earlier ones; that's how the ID is reset. A variable overriding the level still decides this run.
   */
  setLevel(level: TelemetryLevel): TelemetryState {
    const installId = level === "off" ? this.options.newId() : this.saved.installId
    const next = { ...this.saved, level, installId }
    this.write(next)
    this.saved = next
    return this.get()
  }

  private write(value: SavedTelemetry): void {
    this.options.save(`${JSON.stringify(value, null, 2)}\n`)
  }
}
