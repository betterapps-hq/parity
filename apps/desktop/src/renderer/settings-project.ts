import { extensionAdds, type ProjectPreferenceKey } from "@parity-app/core"
import type { ExtensionStatus } from "@parity-app/extensions"
import { useEffect, useMemo, useSyncExternalStore } from "react"
import { z } from "zod"
import type { SettingsExtension, SettingsProject, SettingsProjectChange } from "../shared/settings-view.ts"
import { actions } from "./chrome/actions.ts"
import { extensionsFrom } from "./chrome/settings/definitions.ts"
import { overrideOf, sizeText } from "./chrome/settings/values.ts"
import { extensionsOf, type ProjectExtensions } from "./extensions.ts"
import {
  clearProjectExtensionSetting,
  clearProjectPreference,
  setProjectExtensionSetting,
  setProjectPreference,
  useEffectivePreferences,
  useProjectSettings
} from "./project-settings.ts"
import { request } from "./service.ts"
import { type ProjectSession, workspace } from "./workspace.ts"

/*
 * The editor window's side of Settings (PAR-1090). Settings is its own web contents, owned by main, which loads no
 * project code, so it can't read the open project itself: the window sends it what its project page shows, each time
 * that changes, and makes each change Settings sends back an undo step on the project's main file. The window also
 * sends the project service its extensions' settings from that file, saved or not, so extensions see them at once.
 */

const noExtensions: ProjectExtensions = { extensions: [], logs: {} }
const unsubscribed = () => () => undefined

/** The active tab's project, or nothing on Home or while it opens. */
function useActiveSession(): ProjectSession | undefined {
  return useSyncExternalStore(workspace.subscribe, () => workspace.getActive()?.session)
}

/** The extensions running in the active tab's project, or none on Home. */
function useActiveExtensions(session: ProjectSession | undefined): ProjectExtensions {
  const store = session ? extensionsOf(session).store : undefined

  return useSyncExternalStore(store?.subscribe ?? unsubscribed, store?.get ?? (() => noExtensions))
}

/** A built-in extension as Settings lists it, with what its host says of it when it runs in a host of its own. */
function listed(
  extension: ReturnType<typeof extensionsFrom>[number],
  status: ExtensionStatus | undefined
): SettingsExtension {
  const entry: SettingsExtension = {
    id: extension.id,
    name: extension.name,
    running: extension.running,
    found: extension.found,
    adds: extension.adds
  }

  if (extension.prefix !== undefined) {
    entry.prefix = extension.prefix
  }

  if (!status) {
    return entry
  }

  entry.icon = status.icon
  entry.prefix = status.prefix
  entry.settings = status.contributes.settings ?? {}
  entry.permissions = status.permissions
  entry.state = status.state
  entry.onStartup = status.activates.includes("onStartup")
  entry.problems = status.settingProblems

  if (status.reason !== undefined) {
    entry.reason = status.reason
  }

  if (status.activatedIn !== undefined) {
    entry.activatedIn = status.activatedIn
  }

  if (status.memory !== undefined) {
    entry.memory = status.memory
  }

  return entry
}

/** What Settings shows of the active tab's project, the same object until something in it changes. */
export function useSettingsProject(): SettingsProject {
  const project = useProjectSettings()
  const effective = useEffectivePreferences()
  const session = useActiveSession()
  const running = useActiveExtensions(session)

  return useMemo(() => {
    const builtIn = session
      ? extensionsFrom(session.info.detection.tools, (id) => extensionAdds(id, session.info, running.extensions))
      : extensionsFrom(undefined)

    const shown: SettingsProject = {
      overrides: (project?.overrides ?? []).map((override) => ({
        id: override.key,
        value: override.key === "exportSizes" ? override.value.map(sizeText) : override.value
      })),
      extensions: project?.extensions ?? {},
      unsaved: project?.unsaved ?? false,
      savesItself: effective.autosave,
      list: builtIn.map((extension) =>
        listed(
          extension,
          running.extensions.find((status) => status.prefix === extension.id)
        )
      )
    }

    if (session && project) {
      shown.project = { name: session.info.name, file: session.store.mainPath }
    }

    return shown
  }, [project, effective.autosave, session, running.extensions])
}

/** What the window last sent Settings, which a change Settings sends back is checked against. */
let published: SettingsProject | undefined

/** The project settings Settings may change, by id: the person's settings a project can change, and extensions'. */
function projectSettingOf(
  id: string
): { preference: ProjectPreferenceKey } | { prefix: string; key: string } | undefined {
  if (id === "autosave" || id === "snapping" || id === "layoutGrid" || id === "exportSizes") {
    return { preference: id }
  }

  for (const extension of published?.list ?? []) {
    const prefix = extension.prefix

    if (prefix && extension.settings?.[id]?.scope === "project" && id.startsWith(`${prefix}.`)) {
      return { prefix, key: id.slice(prefix.length + 1) }
    }
  }

  return undefined
}

/** A value an extension's setting takes: a string, a number or a true or false. */
const plainValue = z.union([z.string(), z.number(), z.boolean()])

/** Makes a change Settings sent an undo step on the active tab's project, or saves it. */
export function applySettingsProjectChange(change: SettingsProjectChange): void {
  if (change.kind === "save") {
    void actions.save.run("panel")

    return
  }

  const place = projectSettingOf(change.id)

  if (!place) {
    return
  }

  if (change.kind === "reset") {
    if ("preference" in place) {
      clearProjectPreference(place.preference)
    } else {
      clearProjectExtensionSetting(place.prefix, place.key)
    }

    return
  }

  if ("preference" in place) {
    const override = overrideOf(place.preference, change.value)

    if (override) {
      setProjectPreference(override)
    }

    return
  }

  const value = plainValue.safeParse(change.value)

  if (value.success) {
    setProjectExtensionSetting(place.prefix, place.key, value.data)
  }
}

/**
 * Keeps Settings up to date with the active project, and makes its changes to the project undo steps. Settings is
 * main's own web contents, so this draws nothing.
 */
export function SettingsBridge(): null {
  const project = useSettingsProject()

  useEffect(() => {
    published = project
    window.canvasHost.settingsView.publish(project)
  }, [project])

  useEffect(() => window.canvasHost.settingsView.onProjectChange(applySettingsProjectChange), [])

  return null
}

/**
 * Sends the project service each open project's settings for its extensions as its main file holds them now, saved or
 * not, whenever they change, so `parity.settings` sees a change at once (PAR-1090).
 */
export function watchExtensionSettings(): void {
  const sent = new WeakMap<ProjectSession, unknown>()
  const watched = new WeakSet<ProjectSession>()

  const send = (session: ProjectSession) => {
    const extensions = session.store.getMainDocument()?.extensions ?? {}

    if (sent.get(session) === extensions) {
      return
    }

    sent.set(session, extensions)
    void request("extensions.projectSettings", { projectId: session.id, settings: extensions }).catch(() => undefined)
  }

  const watch = () => {
    for (const tab of workspace.getTabs()) {
      const session = tab.session

      if (!session || watched.has(session)) {
        continue
      }

      watched.add(session)
      // The service read the saved file as the project opened, so only what changes after is sent.
      sent.set(session, session.store.getMainDocument()?.extensions ?? {})
      const unsubscribe = session.store.subscribe(() => send(session))
      session.untilClosed(unsubscribe)
    }
  }

  workspace.subscribe(watch)
  watch()
}
