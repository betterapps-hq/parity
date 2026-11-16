import type { SystemChange, SystemSettings } from "@parity-app/settings"
import { resolveTelemetry, type TelemetryLevel, type TelemetryVariables } from "@parity-app/telemetry"
import type { TelemetryState } from "../shared/protocol.ts"

export interface TelemetrySettingOptions {
  /** The variables this run started with, which override the setting. */
  env: TelemetryVariables
  /** What main alone keeps in `settings.json`, which every copy and the CLI read. */
  store: {
    system(): SystemSettings
    /** Resolves whether it saved; a change that didn't holds for this run and is tried again. */
    changeSystem(change: SystemChange): Promise<boolean>
  }
  /** A new random install ID. */
  newId: () => string
}

/**
 * The diagnostics level from Settings and the install ID, kept in `settings.json` so every copy and the CLI read the same
 * (PAR-626, `docs/proposals/settings.md`). The first run makes the install ID, written only if the file still has none,
 * so two copies starting together keep one.
 */
export class TelemetrySetting {
  /** The ID this run made, until the file has one. */
  private readonly made: string | undefined

  /** Resolves to why a new install ID couldn't be saved, for main to record once its telemetry starts (PAR-811). */
  readonly unsaved: Promise<{ message: string } | undefined>

  constructor(private readonly options: TelemetrySettingOptions) {
    if (options.store.system().installId) {
      this.unsaved = Promise.resolve(undefined)

      return
    }

    const made = options.newId()
    this.made = made

    // The ID still names this run's reports if it can't be saved; the next run makes another, so Sentry counts each run
    // as a new user.
    this.unsaved = options.store
      .changeSystem({ newInstallId: made })
      .then((saved) => (saved ? undefined : { message: "settings.json couldn't be written" }))
  }

  get(): TelemetryState {
    const { diagnostics, installId } = this.options.store.system()

    // The variables were read at start, and a bad PARITY_TELEMETRY stopped the app then, so this can't throw.
    return { ...resolveTelemetry(this.options.env, diagnostics), installId: installId ?? this.made ?? "none" }
  }

  /**
   * Saves the level chosen in Settings. Off also replaces the install ID, so reports after turning it on again don't
   * join the earlier ones; that's how the ID is reset. A variable overriding the level still decides this run.
   */
  setLevel(level: TelemetryLevel): TelemetryState {
    void this.options.store.changeSystem(
      level === "off"
        ? { diagnostics: level, installId: this.options.newId() }
        : {
            diagnostics: level
          }
    )

    return this.get()
  }
}
