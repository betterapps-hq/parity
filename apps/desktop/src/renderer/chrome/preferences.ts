import { type AppSettings, changedSettings, defaultSettings, type SettingsChange } from "@parity-app/settings"
import { z } from "zod"
import type { SettingsState } from "../../shared/settings.ts"
import { recordInterface } from "../interface-events.ts"
import { useStore, windowStore } from "../store.ts"

/**
 * How the app looks and behaves, set from Settings and the menus: `settings.json`, which main keeps and every copy of
 * Parity shares (`docs/proposals/settings.md`). A change made in another copy arrives here too.
 */
export type Preferences = AppSettings

/** The settings as main has them; `resetWindowStores` puts back the defaults, as a first run has them. */
const preferences = windowStore((): Preferences => ({ ...defaultSettings }))

/** What main last said, for Settings to show: a file that doesn't read, values that didn't, changes not saved yet. */
const settingsState = windowStore((): Omit<SettingsState, "values"> => ({ badValues: [] }))

function take(state: SettingsState): void {
  preferences.set(state.values)
  const { values: _values, ...rest } = state
  settingsState.set(rest)
}

// Main answers before the page draws, so the first frame has the person's settings. Tests and stories without a host
// start from the defaults.
const host = typeof window === "undefined" ? undefined : window.canvasHost?.settings

if (host) {
  take(host.now())
  host.subscribe(take)
}

export function getPreferences(): Preferences {
  return preferences.get()
}

/** A setting `setting.changed` records as it is; any other, such as the export sizes, goes as JSON. */
const plainSetting = z.union([z.string(), z.number(), z.boolean()])

export function setPreferences(change: Partial<Preferences>): void {
  const before = preferences.get()
  const after = { ...before, ...change }
  const changed = changedSettings(before, after)

  if (Object.keys(changed).length === 0) {
    return
  }

  for (const [setting, value] of Object.entries(changed)) {
    const plain = plainSetting.safeParse(value)
    recordInterface("setting.changed", { setting, value: plain.success ? plain.data : JSON.stringify(value) })
  }

  // Shown at once; main saves it and sends every window, in every copy, what the file holds after.
  preferences.set(after)
  void host?.change(changed satisfies SettingsChange)
}

export const subscribePreferences = preferences.subscribe

export function usePreferences(): Preferences {
  return useStore(preferences)
}

/** Problems with `settings.json` for Settings to show, as main last said. */
export function useSettingsProblems(): Omit<SettingsState, "values"> {
  return useStore(settingsState)
}
