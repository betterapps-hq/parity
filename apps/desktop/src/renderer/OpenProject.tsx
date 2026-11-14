import { type ReactNode, useCallback, useEffect } from "react"
import type { Editor } from "tldraw"
import { AgentPresence } from "./agent/AgentPresence.tsx"
import { CanvasDrop } from "./canvas/CanvasDrop.tsx"
import { CanvasEditor } from "./canvas/CanvasEditor.tsx"
import { CanvasOverlay } from "./canvas/CanvasOverlay.tsx"
import { ProjectContext } from "./canvas/context.ts"
import { TabOrderOverlay } from "./canvas/TabOrderOverlay.tsx"
import { CanvasMenu } from "./chrome/CanvasMenu.tsx"
import { ConsolePanel, ResizeTop } from "./chrome/ConsolePanel.tsx"
import { ErrorBoundary } from "./chrome/ErrorBoundary.tsx"
import { FloatingToolbar } from "./chrome/FloatingToolbar/FloatingToolbar.tsx"
import { Inspector } from "./chrome/Inspector.tsx"
import { setLayout, useLayout } from "./chrome/layout.ts"
import { LeftPanel } from "./chrome/LeftPanel.tsx"
import { StatusBar } from "./chrome/StatusBar.tsx"
import { ZoomControls } from "./chrome/ZoomControls.tsx"
import { startPreviews } from "./component-previews.ts"
import { useTool } from "./selection.ts"
import { type ProjectSession, type Tab, workspace } from "./workspace.ts"

/**
 * An open project's canvas and panels, loaded in a chunk of its own (PAR-1084): tldraw and the panels make up most of
 * the window's code, and none of it is drawn until a project has opened, so the window paints without it.
 */
export function OpenProject({
  tab,
  session,
  active,
  reopen
}: {
  tab: Tab
  session: ProjectSession
  active: boolean
  reopen: () => void
}) {
  return (
    <ProjectContext value={session}>
      <div hidden={!active} className="flex min-h-0 flex-1 flex-col">
        {/* Each part fails on its own; this catches what they don't, and can reopen the project (PAR-667). */}
        <ErrorBoundary name="project" label={tab.title} kind="page" onReopen={reopen}>
          <main className="flex min-h-0 flex-1">
            <ErrorBoundary name="left-panel" label="Left panel" onReopen={reopen} className="w-64 flex-none border-r">
              <LeftPanel />
            </ErrorBoundary>
            {/* The console docks under the canvas, between the side panels (PAR-147). */}
            <div className="flex min-w-0 flex-1 flex-col">
              <ErrorBoundary name="canvas" label="Canvas" onReopen={reopen} className="justify-center">
                <CanvasArea tabId={tab.id} shown={active} />
              </ErrorBoundary>
              <ConsoleBoundary onReopen={reopen}>
                <ConsolePanel />
              </ConsoleBoundary>
            </div>
            <ErrorBoundary name="inspector" label="Inspector" onReopen={reopen} className="w-72 flex-none border-l">
              <Inspector />
            </ErrorBoundary>
          </main>
          <ErrorBoundary name="status-bar" label="Status bar" kind="strip" className="h-7 shrink-0 border-t">
            <StatusBar />
          </ErrorBoundary>
        </ErrorBoundary>
      </div>
    </ProjectContext>
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

function CanvasArea({ tabId, shown }: { tabId: string; shown: boolean }) {
  const session = workspace.getTab(tabId)?.session
  const tool = useTool(session!.selection)
  const onEditor = useCallback((editor: Editor | undefined) => workspace.setEditor(tabId, editor), [tabId])

  // Component previews are made in the background for as long as the tab is open (PAR-207), and go when it closes.
  useEffect(() => (session ? startPreviews(session) : undefined), [session])

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
        <CanvasEditor onEditor={onEditor} shown={shown} />
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
        <ErrorBoundary name="canvas.agents" label="Agents" kind="silent">
          <AgentPresence />
        </ErrorBoundary>
        <ErrorBoundary name="canvas.toolbar" label="Toolbar" kind="silent">
          <FloatingToolbar />
        </ErrorBoundary>
        <ErrorBoundary name="canvas.view-controls" label="Zoom" kind="silent">
          <ZoomControls />
        </ErrorBoundary>
      </div>
    </CanvasMenu>
  )
}
