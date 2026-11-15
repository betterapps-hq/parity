import type { ExtensionSettingsChange } from "@parity-app/settings"
import { useMemo } from "react"
import type { SettingsProject, SettingsProjectChange } from "../../../shared/settings-view.ts"
import { openKeybindings, setKeys, useKeybindings } from "../keybindings.ts"
import { keymap, keysOf } from "../keymap.ts"
import { setPreferences, useExtensionAppSettings, usePreferences } from "../preferences.ts"
import { setTelemetryLevel, useTelemetry } from "../telemetry-setting.ts"
import { checkForUpdates, setBetaUpdates, useUpdates } from "../updates.tsx"
import { extensionsOfProject } from "./extension-list.ts"
import { extensionPlace } from "./extension-settings.ts"
import { isCommand } from "./shortcuts.tsx"
import type { SettingsData } from "./store.ts"
import { extensionValue, isPreference, preferenceChange, shownValue } from "./values.ts"

/*
 * What Settings shows and changes (PAR-1090): the person's settings, from main, and the open project's, from what the
 * editor window sent. The person's are saved as they change; a change to the project goes back to the window, which
 * makes it an undo step. Extensions' settings for every project are saved only from here, since main takes them only
 * from Settings.
 */

/** Updates can't change the beta setting while it checks, downloads or installs. */
const updatesBusy = new Set(["disabled", "checking", "downloading", "installing"])

/** What Settings changes outside itself: the open project, in its window, and extensions' settings in settings.json. */
export interface SettingsChanges {
  project: (change: SettingsProjectChange) => void
  extensions: (change: ExtensionSettingsChange) => Promise<void>
}

/** Before the window has sent anything: no project open, and no extensions yet. */
const nothingOpen: SettingsProject = { overrides: [], extensions: {}, unsaved: false, savesItself: false, list: [] }

/** Settings' data, from the person's settings and what the window sent of its project. */
export function useSettingsData(
  project: SettingsProject | undefined,
  changes: SettingsChanges,
  open: boolean
): SettingsData {
  const shown = project ?? nothingOpen
  const preferences = usePreferences()
  const appValues = useExtensionAppSettings()
  const telemetry = useTelemetry(open)
  const updates = useUpdates()
  const keybindings = useKeybindings()

  const extensions = useMemo(() => extensionsOfProject(shown.list), [shown.list])

  const locked: Record<string, string> = {}

  if (telemetry?.overriddenBy) {
    locked.telemetry = telemetry.overriddenBy
  }

  const lost: Record<string, string> = {}

  for (const [command, taker] of Object.entries(keybindings.lost)) {
    lost[command] = keymap[taker].label
  }

  const data: SettingsData = {
    locked,
    extensions,
    mine(entry) {
      if (isPreference(entry.id)) {
        return shownValue(preferences, entry.id)
      }

      if (entry.id === "telemetry") {
        return telemetry ? telemetry.level !== "off" : true
      }

      if (entry.id === "installId") {
        return telemetry?.installId ?? ""
      }

      if (entry.id === "betaUpdates") {
        return updates.beta
      }

      const place = entry.scope === "app" ? extensionPlace(entry, extensions) : undefined

      return (place && extensionValue(entry, appValues[place.prefix]?.[place.key])) ?? entry.default
    },
    theirs(entry) {
      if (!shown.project) {
        return undefined
      }

      const override = shown.overrides.find((item) => item.id === entry.id)

      if (override) {
        return override.value
      }

      const place = entry.scope === "project" ? extensionPlace(entry, extensions) : undefined

      return place && extensionValue(entry, shown.extensions[place.prefix]?.[place.key])
    },
    setMine(entry, value) {
      if (entry.id === "telemetry") {
        return setTelemetryLevel(value === true ? "all" : "off").then(() => undefined)
      }

      if (entry.id === "betaUpdates") {
        return setBetaUpdates(value === true)
      }

      const place = entry.scope === "app" ? extensionPlace(entry, extensions) : undefined

      if (place) {
        const plain = extensionValue(entry, Array.isArray(value) ? undefined : value)

        return plain === undefined || Array.isArray(plain)
          ? Promise.reject(new TypeError(`Settings can't save ${entry.id}`))
          : changes.extensions({ [place.prefix]: { [place.key]: plain } })
      }

      const change = isPreference(entry.id) ? preferenceChange(entry.id, value) : undefined

      if (!change) {
        return Promise.reject(new TypeError(`Settings can't save ${entry.id}`))
      }

      setPreferences(change)

      // Turning autosave on saves what's waiting now, rather than at the next edit.
      if (change.autosave) {
        changes.project({ kind: "save" })
      }

      return Promise.resolve()
    },
    setTheirs: (entry, value) => changes.project({ kind: "set", id: entry.id, value }),
    resetTheirs: (entry) => changes.project({ kind: "reset", id: entry.id }),
    overrides: shown.overrides.map((override) => override.id),
    unsaved: shown.unsaved,
    savesItself: shown.savesItself,
    save: () => changes.project({ kind: "save" }),
    keysOf: (command) => (isCommand(command) ? (keysOf(command)[0] ?? "") : ""),
    bind: (command, keys) =>
      isCommand(command)
        ? setKeys(command, keys).then(() => undefined)
        : Promise.reject(new TypeError(`No command ${command}`)),
    lost,
    skipped: keybindings.skipped,
    extensionShortcuts: shown.shortcuts ?? [],
    version: window.canvasHost.appVersion,
    checkForUpdates,
    busy: { betaUpdates: updatesBusy.has(updates.phase) },
    openKeybindings: () => void openKeybindings().catch(() => undefined)
  }

  if (shown.project) {
    data.project = shown.project
  }

  return data
}
