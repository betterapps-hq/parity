import { AppWindow } from "lucide-react"
import { createContext, type ReactNode, use, useCallback, useEffect } from "react"
import type { Editor } from "tldraw"
import { CanvasDrop } from "../canvas/CanvasDrop.tsx"
import { CanvasEditor } from "../canvas/CanvasEditor.tsx"
import { CanvasOverlay } from "../canvas/CanvasOverlay.tsx"
import { TabOrderOverlay } from "../canvas/TabOrderOverlay.tsx"
import { CanvasMenu } from "../chrome/CanvasMenu.tsx"
import { ConsolePanel, ResizeTop } from "../chrome/ConsolePanel.tsx"
import { ErrorBoundary } from "../chrome/ErrorBoundary.tsx"
import { FloatingToolbar } from "../chrome/FloatingToolbar/FloatingToolbar.tsx"
import { Inspector } from "../chrome/Inspector.tsx"
import { setLayout, useLayout } from "../chrome/layout.ts"
import { LeftPanel } from "../chrome/LeftPanel.tsx"
import { ZoomControls } from "../chrome/ZoomControls.tsx"
import { useTool } from "../selection.ts"
import { CanvasShown, WindowLayers } from "../window-canvas.tsx"
import { workspace } from "../workspace.ts"
import type { LensView } from "./registry.ts"

/** What the open project's lenses read from the window: which project, whether it shows, and how to reopen it. */
export interface OpenProjectParts {
  projectId: string
  /** The project shows, not hidden under an extension's page or the sign-in screen. */
  shown: boolean
  /** Opens the project again, as a part that failed offers. */
  reopen: () => void
}

export const OpenProjectContext = createContext<OpenProjectParts | undefined>(undefined)

function useOpenProject(): OpenProjectParts {
  const parts = use(OpenProjectContext)

  if (!parts) {
    throw new Error("The project's lenses need the open project around them.")
  }

  return parts
}

/**
 * Today's canvas, Layers with its asset tabs, and the inspector with Modes, as one lens. It draws everything the
 * project has, pages, stories and component boards too, until those have lenses of their own (lens-layout.md).
 */
export const screensLens: LensView<"screens"> = {
  id: "screens",
  name: "Screens",
  icon: "app-window",
  Icon: AppWindow,
  order: 2,
  shortcut: "Ctrl+2",
  Canvas: ScreensCanvas,
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

/** The canvas, with the console docked under it (PAR-147). */
function ScreensCanvas() {
  const { projectId, shown, reopen } = useOpenProject()

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ErrorBoundary name="canvas" label="Canvas" onReopen={reopen} className="justify-center">
        <CanvasArea projectId={projectId} shown={shown} />
      </ErrorBoundary>
      <ConsoleBoundary onReopen={reopen}>
        <ConsolePanel />
      </ConsoleBoundary>
    </div>
  )
}

/** The console's boundary: says it failed in the console's own height, and can hide it. */
function ConsoleBoundary({ onReopen, children }: { onReopen: () => void; children: ReactNode }) {
  const { consoleHeight } = useLayout()

  return (
    <ErrorBoundary
      name="console"
      label="Console"
      kind="docked"
      onReopen={onReopen}
      onClose={() => setLayout({ console: false })}
      closeLabel="Close the console"
      className="flex-none border-t"
      style={{ height: consoleHeight }}
      edge={<ResizeTop height={consoleHeight} />}
    >
      {children}
    </ErrorBoundary>
  )
}

function CanvasArea({ projectId, shown }: { projectId: string; shown: boolean }) {
  const project = workspace.getProject()
  const session = project?.id === projectId ? project.session : undefined
  const tool = useTool(session!.selection)

  const onEditor = useCallback((editor: Editor | undefined) => workspace.setEditor(projectId, editor), [projectId])

  useEffect(() => {
    const editor = session?.editor

    if (!editor) {
      return
    }

    editor.setCurrentTool(tool === "hand" ? "hand" : "select")
  }, [session?.editor, tool])

  // Isolated, so the canvas's floating controls and overlays, high up within it, stay below menus and dialogs. It sits
  // above the panels beside it, so a floating bar wider than a narrow canvas lies over them rather than under them
  // (PAR-893); its overlays clip to it, so only the bars reach out. The panels' resize edges, z-10, stay above it. A
  // right-click on it opens the canvas's menu.
  return (
    <CanvasMenu>
      <div
        className={`canvas-area relative isolate z-[5] min-w-0 flex-1 ${tool === "text" ? "cursor-text" : ""} ${tool === "frame" ? "cursor-crosshair" : ""}`}
        data-tool={tool}
      >
        <CanvasShown value={shown}>
          <CanvasEditor onEditor={onEditor} shown={shown} />
          {/* Internal extensions' layers, each with an error boundary of its own (window-canvas.tsx). */}
          <WindowLayers order="overDesigns" />
          {/* What's drawn over the canvas fails without a word, leaving the canvas as it is; Sentry still hears. */}
          <ErrorBoundary name="canvas.overlay" label="Outlines" kind="silent">
            <CanvasOverlay />
          </ErrorBoundary>
          <ErrorBoundary name="canvas.tab-order" label="Tab order" kind="silent">
            <TabOrderOverlay />
          </ErrorBoundary>
          <ErrorBoundary name="canvas.drop" label="Drop" kind="silent">
            <CanvasDrop />
          </ErrorBoundary>
          <WindowLayers order="overSelection" />
          <WindowLayers order="edge" />
          <ErrorBoundary name="canvas.toolbar" label="Toolbar" kind="silent">
            <FloatingToolbar />
          </ErrorBoundary>
          <ErrorBoundary name="canvas.view-controls" label="Zoom" kind="silent">
            <ZoomControls />
          </ErrorBoundary>
        </CanvasShown>
      </div>
    </CanvasMenu>
  )
}
