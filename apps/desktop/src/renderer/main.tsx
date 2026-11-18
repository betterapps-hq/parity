import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.tsx"
import { keepFilesFromOpening } from "./canvas/drop-files.ts"
import { setBoundaryReporter } from "./chrome/ErrorBoundary.tsx"
import { startKeybindings } from "./chrome/keybindings.ts"
import { openReport } from "./chrome/ReportProblemDialog.tsx"
import { receiveTelemetry } from "./chrome/telemetry-setting.ts"
import { installClassMerger } from "./class-merger.ts"
import { extensionTime } from "./extension-time.ts"
import { setInterfaceTelemetry } from "./interface-events.ts"
import { watchLongFrames, watchLongTasks } from "./long-tasks.ts"
import { preloadOpenProject } from "./ProjectView.tsx"
import { replaySampling } from "./replay.ts"
import { setWindowTelemetry } from "./report-error.ts"
import { watchExtensionSettings } from "./settings-project.ts"
import { caughtEventId, reactErrorHandlers, startTelemetry } from "./telemetry.ts"
import { startTheme } from "./theme.ts"
import { currentTraceHeaders, traceWith } from "./tracing.ts"
import { followSheetsIntoWindows } from "./window-sheets.ts"
import "tldraw/tldraw.css"
import "./styles.css"

// Before anything adopts a stylesheet, so a frame or icon drawn in a lens's own window takes that window's copies.
followSheetsIntoWindows()

// The editor window is recorded with Session Replay while diagnostics are on, once main says whether they are; the
// offscreen renderers aren't recorded (PAR-624).
// Actions and gestures start the traces the service's work joins (PAR-629), and tasks over 200 ms are recorded with
// the input that started them (PAR-631).
const telemetry = startTelemetry(replaySampling)

traceWith(telemetry)

// Requests to main carry the action or gesture they were asked in, as the service's do (PAR-810).
window.parityTelemetry?.traceFrom(currentTraceHeaders)

watchLongTasks(telemetry)

// Long frames are put down to the window module whose chunk ran most of them (PAR-1283).
watchLongFrames((frame) => extensionTime.frame(frame))

// Panels, dialogs, modes, settings and the start page record what's done with them (PAR-634).
setInterfaceTelemetry(telemetry)

setWindowTelemetry(telemetry)

// A part of the window that fails offers Report a problem (PAR-667), linked to the error it caught (PAR-704), which the
// dialog names by the part's label (PAR-757).
setBoundaryReporter((error, { label }) => {
  const eventId = caughtEventId(error)
  void openReport(eventId ? { eventId, label } : {})
})

void window.canvasHost.telemetry.get().then(receiveTelemetry, () => undefined)

startTheme()

// The shortcuts the person changed, from keybindings.json, which main sends as they change (PAR-1085).
startKeybindings()

// Each open project's settings for its extensions go to the service as they change, saved or not (PAR-1090).
watchExtensionSettings()

// The kit's components merge classes knowing the app's type roles (docs/typography.md).
installClassMerger()

keepFilesFromOpening(window)

createRoot(document.getElementById("root")!, reactErrorHandlers).render(
  <StrictMode>
    <App />
  </StrictMode>
)

preloadOpenProject()
