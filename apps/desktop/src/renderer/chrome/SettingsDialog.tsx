import { useEffect } from "react"
import { applySettingsProjectChange, useSettingsProject } from "../settings-project.ts"
import { useStore } from "../store.ts"
import { closeDialog, useOpenDialog } from "./app-dialogs.ts"
import { drawSettingsInPage, settingsOpening } from "./open-settings.ts"
import { type SettingsChanges, useSettingsData } from "./settings/settings-data.ts"
import { SettingsView } from "./settings/SettingsView.tsx"

/*
 * Settings drawn in the page, as Storybook shows it. In the app, Settings is main's own view (PAR-1090), which
 * `openSettings` asks for and `SettingsBridge` keeps up to date with the open project.
 */

export { openSettings } from "./open-settings.ts"

const changes: SettingsChanges = {
  project: applySettingsProjectChange,
  extensions: (change) => window.canvasHost.settingsView.changeExtensions(change).then(() => undefined)
}

/** Settings drawn in the page, over the window, as Storybook shows it: the person's settings, and the open project's. */
export function SettingsDialog() {
  useEffect(() => drawSettingsInPage(), [])

  const open = useOpenDialog() === "settings"
  const { page, setting } = useStore(settingsOpening)
  const data = useSettingsData(useSettingsProject(), changes, open)

  return (
    <SettingsView
      key={open ? `${page}:${setting}` : "closed"}
      data={data}
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          settingsOpening.set({})
          closeDialog()
        }
      }}
      initialPage={page}
      initialSetting={setting}
    />
  )
}
