import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.tsx"
import { keepFilesFromOpening } from "./canvas/drop-files.ts"
import { setBoundaryReporter } from "./chrome/ErrorBoundary.tsx"
import { openReport } from "./chrome/ReportProblemDialog.tsx"
import { receiveTelemetry } from "./chrome/telemetry-setting.ts"
import { installClassMerger } from "./class-merger.ts"
import { setInterfaceTelemetry, watchTabs } from "./interface-events.ts"
import { watchLongTasks } from "./long-tasks.ts"
import { replaySampling } from "./replay.ts"
import { setWindowTelemetry } from "./report-error.ts"
import { caughtEventId, reactErrorHandlers, startTelemetry } from "./telemetry.ts"
import { startTheme } from "./theme.ts"
import { traceWith } from "./tracing.ts"
import { workspace } from "./workspace.ts"
import "tldraw/tldraw.css"
import "./styles.css"

// The editor window is recorded with Session Replay while diagnostics are on, once main says whether they are; the
// offscreen renderers aren't recorded (PAR-624).
// Actions and gestures start the traces the service's work joins (PAR-629), and tasks over 200 ms are recorded with
// the input that started them (PAR-631).
const telemetry = startTelemetry(replaySampling)

traceWith(telemetry)

watchLongTasks(telemetry)

// Tabs, panels, dialogs, modes, settings and the start page record what's done with them (PAR-634).
setInterfaceTelemetry(telemetry)

setWindowTelemetry(telemetry)

// A part of the window that fails offers Report a problem (PAR-667), linked to the error it caught (PAR-704), which the
// dialog names by the part's label (PAR-757).
setBoundaryReporter((error, { label }) => {
  const eventId = caughtEventId(error)
  void openReport(eventId ? { eventId, label } : {})
})

watchTabs({
  subscribe: workspace.subscribe,
  view: () => ({ tabs: workspace.getTabs(), active: workspace.isHomeActive() ? undefined : workspace.getActiveId() })
})

void window.canvasHost.telemetry.get().then(receiveTelemetry, () => undefined)

startTheme()

// The kit's components merge classes knowing the app's type roles (docs/typography.md).
installClassMerger()

keepFilesFromOpening(window)

createRoot(document.getElementById("root")!, reactErrorHandlers).render(
  <StrictMode>
    <App />
  </StrictMode>
)
