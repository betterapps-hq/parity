import { useEffect } from "react"
import type { SettingsOpening } from "../../shared/settings-view.ts"
import { applySettingsProjectChange, useSettingsProject } from "../settings-project.ts"
import { useStore, windowStore } from "../store.ts"
import { closeDialog, openDialog, useOpenDialog } from "./app-dialogs.ts"
import { type SettingsChanges, useSettingsData } from "./settings/settings-data.ts"
import { SettingsView } from "./settings/SettingsView.tsx"

/*
 * Settings, from File > Settings, Ctrl+, or a link to a setting. In the app it's its own web contents over the window,
 * owned by main, which loads no project code (PAR-1090): `openSettings` asks main to show it, and `SettingsBridge`
 * keeps it up to date with the open project. Storybook draws the same Settings in the page itself, with
 * `SettingsDialog`.
 */

/** Where Settings opens: a page, and a setting on it to mark. */
interface Opening {
  page?: string
  setting?: string
}

const opening = windowStore<Opening>(() => ({}))

/** Whether Settings is drawn in this page, as Storybook draws it, rather than as main's own view. */
let inPage = false

/** Opens Settings, on a page and with a setting on it marked when asked, as a link to a setting does. */
export function openSettings(page?: string, setting?: string): void {
  if (inPage) {
    opening.set({ page, setting })
    openDialog("settings")

    return
  }

  const asked: SettingsOpening = {}

  if (page !== undefined) {
    asked.page = page
  }

  if (setting !== undefined) {
    asked.setting = setting
  }

  void window.canvasHost.settingsView.open(asked).catch(() => undefined)
}

const changes: SettingsChanges = {
  project: applySettingsProjectChange,
  extensions: (change) => window.canvasHost.settingsView.changeExtensions(change).then(() => undefined)
}

/** Settings drawn in the page, over the window, as Storybook shows it: the person's settings, and the open project's. */
export function SettingsDialog() {
  useEffect(() => {
    inPage = true

    return () => {
      inPage = false
    }
  }, [])

  const open = useOpenDialog() === "settings"
  const { page, setting } = useStore(opening)
  const data = useSettingsData(useSettingsProject(), changes, open)

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
