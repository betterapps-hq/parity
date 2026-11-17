import {
  type CanvasDocument,
  clearExtensionSetting,
  clearPreferenceOverride,
  emptyDocument,
  type JsonValue,
  type PreferenceOverride,
  preferenceOverrides,
  type ProjectExtensions,
  type ProjectPreferenceKey,
  setExtensionSetting,
  setPreferenceOverride,
  withProjectPreferences
} from "@parity-app/core"
import { applyDocuments, type ProjectDoc } from "@parity-app/multiplayer"
import { useMemo, useSyncExternalStore } from "react"
import { getPreferences, type Preferences, setPreferences, subscribePreferences } from "./chrome/preferences.ts"
import { useUnsaved } from "./project-doc.ts"
import { workspace } from "./workspace.ts"

/**
 * What the open project's `.par` sets for itself (PAR-1085): its own values for some of the person's preferences, which
 * win while it's open, and extensions' project settings. Each change is an undo step on the project's main file, saved
 * with it by Save, or a moment later with autosave on, as any other edit is.
 */

/** What a project's main file sets, as the Settings dialog's project page lists it. */
export interface ProjectSettings {
  /** Its own values for the person's preferences, in the order they were set. */
  overrides: readonly PreferenceOverride[]
  /** Extensions' project settings, by extension id and then key, as `storybook` → `configDir`. */
  extensions: ProjectExtensions
  /** Whether the project has changes Save hasn't written yet, these or any other. */
  unsaved: boolean
}

const noExtensions: ProjectExtensions = {}

/** The window's project, or nothing on Home or while a project opens. */
function activeSession() {
  return workspace.getProject()?.session
}

function activeDoc(): ProjectDoc | undefined {
  return activeSession()?.doc
}

function useActiveDoc(): ProjectDoc | undefined {
  return useSyncExternalStore(workspace.subscribe, activeDoc)
}

/** The document's main file, following its changes; nothing without a document. */
function useMainFile(doc: ProjectDoc | undefined): CanvasDocument | undefined {
  const subscribe = useMemo(
    () => (listener: () => void) => (doc ? doc.subscribe(() => listener()) : () => undefined),
    [doc]
  )

  return useSyncExternalStore(subscribe, () => mainFile(doc))
}

function mainFile(doc: ProjectDoc | undefined): CanvasDocument | undefined {
  return doc?.file(doc.main)
}

/** The project settings of the active tab's project, or nothing when no project is open there. */
export function useProjectSettings(): ProjectSettings | undefined {
  const session = useSyncExternalStore(workspace.subscribe, activeSession)
  const main = useMainFile(session?.doc)
  const unsaved = useUnsaved(session)

  return useMemo(
    () =>
      session && {
        overrides: preferenceOverrides(main),
        extensions: main?.extensions ?? noExtensions,
        unsaved
      },
    [session, main, unsaved]
  )
}

/** Changes the project's main file as one undo step, creating it when the project has none yet. */
function changeMain(doc: ProjectDoc, label: string, update: (document: CanvasDocument) => CanvasDocument): void {
  const document = update(mainFile(doc) ?? emptyDocument())
  applyDocuments(doc, label, [{ path: doc.main, document }], { origin: "edit" })
}

/** What a preference is called in the undo step that changes it. */
const preferenceNames: Record<ProjectPreferenceKey, string> = {
  autosave: "autosave",
  snapping: "snapping",
  layoutGrid: "the layout grid",
  exportSizes: "export sizes"
}

/** Sets the project's own value for a preference, as one undo step. */
export function setProjectPreference(override: PreferenceOverride, doc: ProjectDoc | undefined = activeDoc()): void {
  if (doc) {
    changeMain(doc, `Set ${preferenceNames[override.key]} for the project`, (document) =>
      setPreferenceOverride(document, override)
    )
  }
}

/** Takes the project's own value for a preference away, so the person's applies again, as one undo step. */
export function clearProjectPreference(key: ProjectPreferenceKey, doc: ProjectDoc | undefined = activeDoc()): void {
  if (doc && mainFile(doc)?.preferences?.[key] !== undefined) {
    changeMain(doc, `Use your own ${preferenceNames[key]}`, (document) => clearPreferenceOverride(document, key))
  }
}

/** Sets an extension's project setting, as one undo step. */
export function setProjectExtensionSetting(
  extension: string,
  key: string,
  value: JsonValue,
  doc: ProjectDoc | undefined = activeDoc()
): void {
  if (doc) {
    changeMain(doc, `Set ${extension} ${key}`, (document) => setExtensionSetting(document, extension, key, value))
  }
}

/** Takes an extension's project setting away, so it reads as the extension's default, as one undo step. */
export function clearProjectExtensionSetting(
  extension: string,
  key: string,
  doc: ProjectDoc | undefined = activeDoc()
): void {
  if (doc && mainFile(doc)?.extensions?.[extension]?.[key] !== undefined) {
    changeMain(doc, `Reset ${extension} ${key}`, (document) => clearExtensionSetting(document, extension, key))
  }
}

/** The person's preferences, and the main file they were last read with, so the same pair gives the same object. */
let last: { preferences: Preferences; main: CanvasDocument | undefined; effective: Preferences } | undefined

/**
 * The preferences in effect in a project, by default the active tab's: the person's, with the project's own values over
 * them. The same object until either changes.
 */
export function getEffectivePreferences(doc: ProjectDoc | undefined = activeDoc()): Preferences {
  const preferences = getPreferences()
  const main = mainFile(doc)

  if (last?.preferences !== preferences || last.main !== main) {
    last = { preferences, main, effective: withProjectPreferences(preferences, main) }
  }

  return last.effective
}

/** The preferences in effect in a project, by default the active tab's (see `getEffectivePreferences`). */
export function useEffectivePreferences(doc?: ProjectDoc): Preferences {
  const active = useActiveDoc()
  const preferences = useSyncExternalStore(subscribePreferences, getPreferences)
  const main = useMainFile(doc ?? active)

  return useMemo(() => withProjectPreferences(preferences, main), [preferences, main])
}

/**
 * Changes a preference where it takes effect: the project's own value when the project sets one, as an undo step, and
 * otherwise the person's. The View menu's toggles and the Export section change preferences this way, so what they
 * show is what they change.
 */
export function setEffectivePreference(override: PreferenceOverride, doc: ProjectDoc | undefined = activeDoc()): void {
  if (doc && mainFile(doc)?.preferences?.[override.key] !== undefined) {
    setProjectPreference(override, doc)

    return
  }

  switch (override.key) {
    case "autosave":
      setPreferences({ autosave: override.value })
      break
    case "snapping":
      setPreferences({ snapping: override.value })
      break
    case "layoutGrid":
      setPreferences({ layoutGrid: override.value })
      break
    case "exportSizes":
      setPreferences({ exportSizes: override.value })
      break
  }
}
