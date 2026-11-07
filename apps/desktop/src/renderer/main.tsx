import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.tsx"
import { keepFilesFromOpening } from "./canvas/drop-files.ts"
import { receiveTelemetry } from "./chrome/telemetry-setting.ts"
import { watchLongTasks } from "./long-tasks.ts"
import { replaySampling } from "./replay.ts"
import { reactErrorHandlers, startTelemetry } from "./telemetry.ts"
import { startTheme } from "./theme.ts"
import "tldraw/tldraw.css"
import "./styles.css"

// The editor window is recorded with Session Replay while diagnostics are on, once main says whether they are; the
// offscreen renderers aren't recorded (PAR-624).
// Tasks over 200 ms are recorded with the input that started them (PAR-631).
watchLongTasks(startTelemetry(replaySampling))
void window.canvasHost.telemetry.get().then(receiveTelemetry, () => undefined)
startTheme()
keepFilesFromOpening(window)

createRoot(document.getElementById("root")!, reactErrorHandlers).render(
  <StrictMode>
    <App />
  </StrictMode>
)
