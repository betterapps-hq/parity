import { extensionAdds, type ProjectPreferenceKey } from "@parity-app/core"
import type { ExtensionStatus, InstalledStatus } from "@parity-app/extension-host"
import { useEffect, useMemo, useSyncExternalStore } from "react"
import { z } from "zod"
import type { SettingsProject, SettingsProjectChange } from "../shared/settings-view.ts"
import { actions } from "./chrome/actions.ts"
import { keymap, keysOf } from "./chrome/keymap.ts"
import { extensionList } from "./chrome/settings/extension-list.ts"
import { isCommand } from "./chrome/settings/shortcuts.tsx"
import type { ExtensionShortcut } from "./chrome/settings/store.ts"
import { overrideOf, sizeText } from "./chrome/settings/values.ts"
import { extensionKeys, extensionsOf, type ProjectExtensions } from "./extensions.ts"
import {
  clearProjectExtensionSetting,
  clearProjectPreference,
  setProjectExtensionSetting,
  setProjectPreference,
  useEffectivePreferences,
  useProjectSettings
} from "./project-settings.ts"
import { request } from "./service.ts"
import { resetWithWindow, windowStore } from "./store.ts"
import { type ProjectSession, workspace } from "./workspace.ts"

/*
 * The editor window's side of Settings (PAR-1090). Settings is its own web contents, owned by main, which loads no
 * project code, so it can't read the open project itself: the window sends it what its project page shows, each time
 * that changes, and makes each change Settings sends back an undo step on the project's main file. The window also
 * sends the project service its extensions' settings from that file, saved or not, so extensions see them at once.
 */

const noExtensions: ProjectExtensions = { extensions: [], logs: {} }
const unsubscribed = () => () => undefined

/** The window's project, or nothing on Home or while it opens. */
function useActiveSession(): ProjectSession | undefined {
  return useSyncExternalStore(workspace.subscribe, () => workspace.getProject()?.session)
}

/** The extensions running in the active tab's project, or none on Home. */
function useActiveExtensions(session: ProjectSession | undefined): ProjectExtensions {
  const store = session ? extensionsOf(session).store : undefined

  return useSyncExternalStore(store?.subscribe ?? unsubscribed, store?.get ?? (() => noExtensions))
}

/** Every installed extension, from the service, which reads their manifests as it starts; nothing until it answers. */
const installedExtensions = windowStore<InstalledStatus[] | undefined>(() => undefined)
const noneInstalled: InstalledStatus[] = []

/** Which ask for them is current: a reset or a restarted service makes an earlier answer stale. */
let installedAsk = 0
let askingInstalled = false
let hearsReconnect = false

resetWithWindow(() => {
  installedAsk += 1
  askingInstalled = false
})

/** Asks the service for its installed extensions, unless it's asked already. */
function askInstalled(): void {
  if (askingInstalled) {
    return
  }

  askingInstalled = true
  const ask = installedAsk

  void request("extensions.installed", {}).then(
    (list) => {
      if (ask === installedAsk) {
        askingInstalled = false
        installedExtensions.set(list)
      }
    },
    () => {
      if (ask === installedAsk) {
        askingInstalled = false
      }
    }
  )
}

/** Asks again once a restarted service is back, since an answer the old one owed never comes. */
function askAgain(): void {
  installedAsk += 1
  askingInstalled = false
  askInstalled()
}

function subscribeInstalled(listener: () => void): () => void {
  if (!hearsReconnect) {
    hearsReconnect = true
    window.canvasHost.onReconnect(askAgain)
  }

  if (installedExtensions.get() === undefined) {
    askInstalled()
  }

  return installedExtensions.subscribe(listener)
}

/** The extensions Parity has installed, as their manifests describe them. */
function useInstalledExtensions(): InstalledStatus[] {
  return useSyncExternalStore(subscribeInstalled, () => installedExtensions.get() ?? noneInstalled)
}

/**
 * Each extension's keys, under its name, those that don't work saying which command has them: one of Parity's, which
 * wins, or another extension's, when both ask for them (PAR-1092).
 */
function shortcutsOf(extensions: readonly ExtensionStatus[]): { extension: string; shortcuts: ExtensionShortcut[] }[] {
  const { keys, clashes } = extensionKeys(extensions)
  const nameOf = (id: string) => extensions.find((each) => each.id === id)?.displayName ?? id

  const labelOf = (written: string) => {
    const owner = Object.keys(keymap).find((command) => isCommand(command) && keysOf(command).includes(written))

    return owner && isCommand(owner) ? keymap[owner].label : "Another command"
  }

  return extensions.flatMap((extension) => {
    const titleOf = (command: string) =>
      extension.contributes.commands?.find((declared) => declared.id === command)?.title ?? command

    const shortcuts: ExtensionShortcut[] = [
      ...keys.flatMap((key) =>
        key.extension === extension.id ? [{ command: key.command, title: titleOf(key.command), keys: key.keys }] : []
      ),
      ...clashes.flatMap((clash) =>
        clash.extension === extension.id
          ? [
              {
                command: clash.command,
                title: titleOf(clash.command),
                keys: clash.keys,
                clash:
                  clash.with === "parity"
                    ? `${labelOf(clash.keys)} has these keys`
                    : `${clash.with.map(nameOf).join(" and ")} also asks for these keys`
              }
            ]
          : []
      )
    ]

    return shortcuts.length > 0 ? [{ extension: extension.displayName, shortcuts }] : []
  })
}

/** What Settings shows of the active tab's project, the same object until something in it changes. */
export function useSettingsProject(): SettingsProject {
  const project = useProjectSettings()
  const effective = useEffectivePreferences()
  const session = useActiveSession()
  const running = useActiveExtensions(session)
  const installed = useInstalledExtensions()

  return useMemo(() => {
    const list = extensionList(
      installed,
      session && {
        tools: session.info.detection.tools,
        running: running.extensions,
        addsOf: (prefix) => extensionAdds(prefix, session.info, running.extensions)
      }
    )

    const shown: SettingsProject = {
      overrides: (project?.overrides ?? []).map((override) => ({
        id: override.key,
        value: override.key === "exportSizes" ? override.value.map(sizeText) : override.value
      })),
      extensions: project?.extensions ?? {},
      unsaved: project?.unsaved ?? false,
      savesItself: effective.autosave,
      list
    }

    if (session && project) {
      shown.project = { name: session.info.name, file: session.doc.main }
    }

    const shortcuts = shortcutsOf(running.extensions)

    if (shortcuts.length > 0) {
      shown.shortcuts = shortcuts
    }

    return shown
  }, [project, effective.autosave, session, running.extensions, installed])
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
    const extensions = session.doc.file(session.doc.main)?.extensions ?? {}

    if (sent.get(session) === extensions) {
      return
    }

    sent.set(session, extensions)
    void request("extensions.projectSettings", { projectId: session.id, settings: extensions }).catch(() => undefined)
  }

  const watch = () => {
    const session = workspace.getProject()?.session

    if (session && !watched.has(session)) {
      watched.add(session)
      // The service read the saved file as the project opened, so only what changes after is sent.
      sent.set(session, session.doc.file(session.doc.main)?.extensions ?? {})
      const unsubscribe = session.doc.subscribe(() => send(session))
      session.untilClosed(unsubscribe)
    }
  }

  workspace.subscribe(watch)
  watch()
}
