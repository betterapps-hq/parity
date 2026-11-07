import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.tsx"
import { keepFilesFromOpening } from "./canvas/drop-files.ts"
import { receiveTelemetry } from "./chrome/telemetry-setting.ts"
import { setInterfaceTelemetry, watchTabs } from "./interface-events.ts"
import { replaySampling } from "./replay.ts"
import { reactErrorHandlers, startTelemetry } from "./telemetry.ts"
import { startTheme } from "./theme.ts"
import { workspace } from "./workspace.ts"
import "tldraw/tldraw.css"
import "./styles.css"

// The editor window is recorded with Session Replay while diagnostics are on, once main says whether they are; the
// offscreen renderers aren't recorded (PAR-624).
// Tabs, panels, dialogs, modes, settings and the start page record what's done with them (PAR-634).
setInterfaceTelemetry(startTelemetry(replaySampling))
watchTabs({
  subscribe: workspace.subscribe,
  view: () => ({ tabs: workspace.getTabs(), active: workspace.isHomeActive() ? undefined : workspace.getActiveId() })
})
void window.canvasHost.telemetry.get().then(receiveTelemetry, () => undefined)
startTheme()
keepFilesFromOpening(window)

createRoot(document.getElementById("root")!, reactErrorHandlers).render(
  <StrictMode>
    <App />
  </StrictMode>
)
