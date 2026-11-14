import type { JsonValue, PreferenceOverride, ProjectPreferenceKey } from "@parity-app/core"
import type { ExportSize } from "@parity-app/editor"
import { type CodeEditorChoice, codeEditors } from "@parity-app/processes"
import { useSyncExternalStore } from "react"
import { z } from "zod"
import {
  clearProjectExtensionSetting,
  clearProjectPreference,
  setProjectExtensionSetting,
  setProjectPreference,
  useEffectivePreferences,
  useProjectSettings
} from "../project-settings.ts"
import { useStore, windowStore } from "../store.ts"
import { workspace } from "../workspace.ts"
import { actions } from "./actions.ts"
import { closeDialog, openDialog, useOpenDialog } from "./app-dialogs.ts"
import { openKeybindings, setKeys, useKeybindings } from "./keybindings.ts"
import { keymap, keysOf } from "./keymap.ts"
import { type Preferences, setPreferences, usePreferences } from "./preferences.ts"
import { extensionsFrom, type Setting, type Value } from "./settings/definitions.ts"
import { SettingsView } from "./settings/SettingsView.tsx"
import { isCommand } from "./settings/shortcuts.tsx"
import type { SettingsData } from "./settings/store.ts"
import { setTelemetryLevel, useTelemetry } from "./telemetry-setting.ts"
import { checkForUpdates, setBetaUpdates, useUpdates } from "./updates.tsx"

/** Where Settings opens: a page, and a setting on it to mark. */
interface Opening {
  page?: string
  setting?: string
}

const opening = windowStore<Opening>(() => ({}))

/** Opens Settings, on a page and with a setting on it marked when asked, as a link to a setting does. */
export function openSettings(page?: string, setting?: string): void {
  opening.set({ page, setting })
  openDialog("settings")
}

/** The person's preferences Settings shows, by setting id. */
const preferenceIds = [
  "theme",
  "autosave",
  "codeEditor",
  "componentsView",
  "snapping",
  "layoutGrid",
  "exportSizes",
  "performanceStats"
] as const satisfies readonly (keyof Preferences)[]

type PreferenceId = (typeof preferenceIds)[number]

function isPreference(id: string): id is PreferenceId {
  return preferenceIds.some((key) => key === id)
}

function isProjectPreference(id: string): id is ProjectPreferenceKey {
  return id === "autosave" || id === "snapping" || id === "layoutGrid" || id === "exportSizes"
}

function isEditorChoice(value: Value): value is CodeEditorChoice {
  return value === "auto" || value === "system" || codeEditors.some((editor) => editor.id === value)
}

/** An export size as Settings' choices write it: `png 2x`. */
function sizeText(size: ExportSize): string {
  return `${size.format} ${size.scale}x`
}

/** Every export size, by how Settings' choices write it. */
const sizeChoices = new Map(
  (["png", "jpg"] as const).flatMap((format) =>
    ([1, 2, 3] as const).map((scale): [string, ExportSize] => [sizeText({ format, scale }), { format, scale }])
  )
)

/** The export sizes Settings' choices name, in the order they're listed, leaving out any it can't read. */
function sizesOf(value: Value): ExportSize[] {
  return (Array.isArray(value) ? value : []).flatMap((text) => sizeChoices.get(text) ?? [])
}

/** A preference's value as Settings shows it. */
function shownValue(preferences: Pick<Preferences, PreferenceId>, id: PreferenceId): Value {
  return id === "exportSizes" ? preferences.exportSizes.map(sizeText) : preferences[id]
}

const flag = z.boolean()

/** A value from one of Settings' controls for one of the person's preferences, as the preference takes it. */
const preferenceValue = z.discriminatedUnion("id", [
  z.object({ id: z.literal("theme"), value: z.enum(["light", "dark", "system"]) }),
  z.object({ id: z.literal("componentsView"), value: z.enum(["names", "list", "grid"]) }),
  z.object({ id: z.enum(["autosave", "snapping", "layoutGrid", "performanceStats"]), value: flag })
])

/** One of the person's preferences, from a value Settings' control gave. */
function preferenceChange(id: PreferenceId, value: Value): Partial<Preferences> | undefined {
  if (id === "exportSizes") {
    const sizes = sizesOf(value)

    return sizes.length > 0 ? { exportSizes: sizes } : undefined
  }

  if (id === "codeEditor") {
    return isEditorChoice(value) ? { codeEditor: value } : undefined
  }

  const read = preferenceValue.safeParse({ id, value })

  if (!read.success) {
    return undefined
  }

  switch (read.data.id) {
    case "theme":
      return { theme: read.data.value }
    case "componentsView":
      return { componentsView: read.data.value }
    default:
      return { [read.data.id]: read.data.value }
  }
}

/** A project's own value for a preference, from a value Settings' control gave. */
function overrideOf(key: ProjectPreferenceKey, value: Value): PreferenceOverride | undefined {
  if (key === "exportSizes") {
    const sizes = sizesOf(value)

    return sizes.length > 0 ? { key, value: sizes } : undefined
  }

  const read = flag.safeParse(value)

  return read.success ? { key, value: read.data } : undefined
}

/** An extension's project setting by Settings' id, `storybook.configDir`: its extension and key. */
function extensionKey(id: string): { extension: string; key: string } | undefined {
  const [extension, key] = id.split(".")

  return extension && key ? { extension, key } : undefined
}

/** A value an extension keeps in the project's file, as Settings' controls take it. */
function asValue(value: JsonValue | undefined): Value | undefined {
  const read = plainValue.safeParse(value)

  return read.success ? read.data : undefined
}

const plainValue = z.union([z.string(), z.number(), z.boolean()])

/** Updates can't change the beta setting while it checks, downloads or installs. */
const updatesBusy = new Set(["disabled", "checking", "downloading", "installing"])

/** The active tab's project, or nothing on Home or while it opens. */
function useActiveSession() {
  return useSyncExternalStore(workspace.subscribe, () => workspace.getActive()?.session)
}

/** Settings for the app, from File > Settings or Ctrl+,: the person's settings, and the open project's. */
export function SettingsDialog() {
  const open = useOpenDialog() === "settings"
  const { page, setting } = useStore(opening)
  const preferences = usePreferences()
  const effective = useEffectivePreferences()
  const project = useProjectSettings()
  const session = useActiveSession()
  const telemetry = useTelemetry(open)
  const updates = useUpdates()
  const keybindings = useKeybindings()

  const locked: Record<string, string> = {}

  if (telemetry?.overriddenBy) {
    locked.telemetry = telemetry.overriddenBy
  }

  const lost: Record<string, string> = {}

  for (const [command, taker] of Object.entries(keybindings.lost)) {
    lost[command] = keymap[taker].label
  }

  const projectValue = (entry: Setting): Value | undefined => {
    if (isProjectPreference(entry.id)) {
      const override = project?.overrides.find((item) => item.key === entry.id)

      return override && (override.key === "exportSizes" ? override.value.map(sizeText) : override.value)
    }

    const place = entry.scope === "project" ? extensionKey(entry.id) : undefined

    return place && asValue(project?.extensions[place.extension]?.[place.key])
  }

  const data: SettingsData = {
    project: session && project ? { name: session.info.name, file: session.store.mainPath } : undefined,
    locked,
    extensions: extensionsFrom(session ? session.info.detection.tools : undefined),
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

      return entry.id === "betaUpdates" ? updates.beta : entry.default
    },
    theirs: (entry) => (project ? projectValue(entry) : undefined),
    setMine(entry, value) {
      if (entry.id === "telemetry") {
        return setTelemetryLevel(value === true ? "all" : "off").then(() => undefined)
      }

      if (entry.id === "betaUpdates") {
        return setBetaUpdates(value === true)
      }

      const change = isPreference(entry.id) ? preferenceChange(entry.id, value) : undefined

      if (!change) {
        return Promise.reject(new TypeError(`Settings can't save ${entry.id}`))
      }

      setPreferences(change)

      // Turning autosave on saves what's waiting now, rather than at the next edit.
      if (change.autosave) {
        void workspace.flush().catch(() => undefined)
      }

      return Promise.resolve()
    },
    setTheirs(entry, value) {
      const override = isProjectPreference(entry.id) ? overrideOf(entry.id, value) : undefined
      const place = extensionKey(entry.id)

      if (override) {
        setProjectPreference(override)
      } else if (entry.scope === "project" && place) {
        setProjectExtensionSetting(place.extension, place.key, value)
      }
    },
    resetTheirs(entry) {
      const place = extensionKey(entry.id)

      if (isProjectPreference(entry.id)) {
        clearProjectPreference(entry.id)
      } else if (entry.scope === "project" && place) {
        clearProjectExtensionSetting(place.extension, place.key)
      }
    },
    overrides: project?.overrides.map((override) => override.key) ?? [],
    unsaved: project?.unsaved ?? false,
    savesItself: effective.autosave,
    save: () => void actions.save.run("panel"),
    keysOf: (command) => (isCommand(command) ? (keysOf(command)[0] ?? "") : ""),
    bind: (command, keys) =>
      isCommand(command)
        ? setKeys(command, keys).then(() => undefined)
        : Promise.reject(new TypeError(`No command ${command}`)),
    lost,
    skipped: keybindings.skipped,
    version: window.canvasHost.appVersion,
    checkForUpdates,
    busy: { betaUpdates: updatesBusy.has(updates.phase) },
    openKeybindings: () => void openKeybindings().catch(() => undefined)
  }

  return (
    <SettingsView
      key={open ? `${page}:${setting}` : "closed"}
      data={data}
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          opening.set({})
          closeDialog()
        }
      }}
      initialPage={page}
      initialSetting={setting}
    />
  )
}
