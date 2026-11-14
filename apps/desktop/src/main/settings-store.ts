import {
  type AppSettings,
  changedSettings,
  changeSettings,
  defaultSettings,
  type FileChange,
  readSettings,
  settingKeys,
  withExtensionChange
} from "@parity-app/settings"
import type { SettingsState } from "../shared/settings.ts"
import type { LockOptions } from "./file-lock.ts"
import { type FileFormat, sharedFile, type SharedFileState } from "./shared-file.ts"

export interface SettingsStore {
  /** What every window is shown now, from memory: the file as last read, with changes not yet saved on top. */
  state(): SettingsState
  /**
   * Makes one change, in the file as it is now: to Parity's own settings, or to extensions' under `extensions`. Never
   * fails: a change that can't be saved yet waits and is tried again.
   */
  change(change: FileChange): Promise<SettingsState>
  /** Reads the file again, as when a window gains focus, in case a change from another copy was missed. */
  check(): void
  /** Stops watching and trying again. */
  close(): void
}

export interface SettingsStoreOptions {
  /** Hears each state the settings move to, to send the windows. */
  changed: (state: SettingsState, keys: Partial<AppSettings>) => void
  /** Hears each problem once, for the log. */
  problem?: (message: string) => void
  settleMs?: number
  retryMs?: number
  retryMaxMs?: number
  lock?: LockOptions
}

type Values = Pick<SettingsState, "values" | "extensions" | "badValues">

const settingsFormat: FileFormat<Values, FileChange> = {
  read(text) {
    const { problem, ...values } = readSettings(text)

    return problem === undefined ? { values } : { values, problem }
  },
  write: changeSettings,
  apply({ values, extensions, badValues }, change) {
    const entries = settingKeys.map((key) => {
      const value = change[key]

      // A change's `null` puts the setting back to its default.
      return [key, value === undefined ? values[key] : (value ?? defaultSettings[key])]
    })

    // SAFETY: each value is one the file's schema read, a default, or one a change's schema read, for its own key.
    return {
      values: Object.fromEntries(entries) as AppSettings,
      extensions: withExtensionChange(extensions, change.extensions),
      badValues
    }
  }
}

/** The state a window is shown, from the shared file's. */
function settingsState({ values, problem, unsaved }: SharedFileState<Values>): SettingsState {
  const state: SettingsState = { ...values }

  if (problem !== undefined) {
    state.problem = problem
  }

  if (unsaved) {
    state.unsaved = true
  }

  return state
}

/** `settings.json` in the data folder, which every copy of Parity shares (`docs/proposals/settings.md`). */
export function settingsStore(file: string, options: SettingsStoreOptions): SettingsStore {
  const { changed, ...rest } = options

  const shared = sharedFile(file, settingsFormat, {
    ...rest,
    changed: (state, before) =>
      changed(settingsState(state), changedSettings(before.values.values, state.values.values))
  })

  return {
    state: () => settingsState(shared.state()),
    change: (change) => shared.change(change).then(settingsState),
    check: () => shared.check(),
    close: () => shared.close()
  }
}
