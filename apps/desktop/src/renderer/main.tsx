import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.tsx"
import { keepFilesFromOpening } from "./canvas/drop-files.ts"
import { replayOptions } from "./replay.ts"
import { reactErrorHandlers, startTelemetry } from "./telemetry.ts"
import { startTheme } from "./theme.ts"
import "tldraw/tldraw.css"
import "./styles.css"

// The editor window is recorded with Session Replay; the offscreen renderers aren't (PAR-624).
startTelemetry(replayOptions(window.canvasHost.telemetry))
startTheme()
keepFilesFromOpening(window)

createRoot(document.getElementById("root")!, reactErrorHandlers).render(
  <StrictMode>
    <App />
  </StrictMode>
)
