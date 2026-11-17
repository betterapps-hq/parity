import { AppWindow } from "lucide-react"
import { ErrorBoundary } from "../chrome/ErrorBoundary.tsx"
import { Inspector } from "../chrome/Inspector.tsx"
import { LeftPanel } from "../chrome/LeftPanel.tsx"
import { ProjectCanvas, useOpenProject } from "./project-canvas.tsx"
import type { LensView } from "./registry.ts"

/**
 * Today's canvas, Layers with its asset tabs, and the inspector with Modes, as one lens: the project's designs, its
 * stories and its component boards, until Stories and Components have lenses of their own (lens-layout.md). The app's
 * pages are Pages'.
 */
export const screensLens: LensView<"screens"> = {
  id: "screens",
  name: "Screens",
  icon: "app-window",
  Icon: AppWindow,
  order: 2,
  shortcut: "Ctrl+2",
  Canvas: ({ lens, visible }) => <ProjectCanvas lens={lens} draws="designs" visible={visible} />,
  Panel: ScreensPanel,
  Inspector: ScreensInspector
}

function ScreensPanel() {
  const { reopen } = useOpenProject()

  return (
    <ErrorBoundary name="left-panel" label="Left panel" onReopen={reopen} className="w-64 flex-none border-r">
      <LeftPanel />
    </ErrorBoundary>
  )
}

function ScreensInspector() {
  const { reopen } = useOpenProject()

  return (
    <ErrorBoundary name="inspector" label="Inspector" onReopen={reopen} className="w-72 flex-none border-l">
      <Inspector />
    </ErrorBoundary>
  )
}
