import { StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import type { SettingsOpening, SettingsProject } from "../shared/settings-view.ts"
import { startKeybindings } from "./chrome/keybindings.ts"
import { type SettingsChanges, useSettingsData } from "./chrome/settings/settings-data.ts"
import { SettingsView } from "./chrome/settings/SettingsView.tsx"
import { receiveTelemetry } from "./chrome/telemetry-setting.ts"
import { receiveUpdate } from "./chrome/updates.tsx"
import { installClassMerger } from "./class-merger.ts"
import { startTheme } from "./theme.ts"
import "./styles.css"

/*
 * Settings' own page (PAR-1090): its own web contents over the editor window, owned by main, which never loads project
 * code. So it alone may change the person's settings for every project, extensions' among them. The open project's page
 * comes from what the editor window sends through main, and each change to it goes back the same way, for the window to
 * make an undo step. Closing Settings takes the page away.
 */

const host = window.canvasHost
const view = host.settingsView

const changes: SettingsChanges = {
  project: (change) => void view.changeProject(change).catch(() => undefined),
  extensions: (change) => view.changeExtensions(change).then(() => undefined)
}

function SettingsPage() {
  const [opening, setOpening] = useState<SettingsOpening & { at: number }>({ at: 0 })
  const [project, setProject] = useState<SettingsProject>()
  const data = useSettingsData(project, changes, true)

  useEffect(() => view.onOpening((next) => setOpening((last) => ({ ...next, at: last.at + 1 }))), [])
  useEffect(() => view.onProject(setProject), [])

  // Nothing to show until main says where to open, which it does as the page loads.
  if (opening.at === 0) {
    return null
  }

  return (
    <SettingsView
      key={opening.at}
      data={data}
      open
      onOpenChange={(next) => {
        if (!next) {
          void view.close()
        }
      }}
      initialPage={opening.page}
      initialSetting={opening.setting}
    />
  )
}

void host.telemetry.get().then(receiveTelemetry, () => undefined)

host.updates.subscribe(receiveUpdate)

void host.updates.get().then(receiveUpdate, () => undefined)

startTheme()

startKeybindings()

installClassMerger()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SettingsPage />
  </StrictMode>
)
