import { type ReactNode, useCallback, useEffect } from "react"
import type { Editor } from "tldraw"
import { AgentPresence } from "./agent/AgentPresence.tsx"
import { CanvasDrop } from "./canvas/CanvasDrop.tsx"
import { CanvasEditor } from "./canvas/CanvasEditor.tsx"
import { CanvasOverlay } from "./canvas/CanvasOverlay.tsx"
import { ProjectContext } from "./canvas/context.ts"
import { InspectOverlay } from "./canvas/InspectOverlay.tsx"
import { useShortcuts } from "./canvas/shortcuts.ts"
import { TabOrderOverlay } from "./canvas/TabOrderOverlay.tsx"
import { CanvasMenu } from "./chrome/CanvasMenu.tsx"
import { ConsolePanel, ResizeTop } from "./chrome/ConsolePanel.tsx"
import { ErrorBoundary } from "./chrome/ErrorBoundary.tsx"
import { Inspector } from "./chrome/Inspector.tsx"
import { setLayout, useLayout } from "./chrome/layout.ts"
import { LeftPanel } from "./chrome/LeftPanel.tsx"
import { StatusBar } from "./chrome/StatusBar.tsx"
import { FloatingToolbar, ViewControls } from "./chrome/Toolbar.tsx"
import { startPreviews } from "./component-previews.ts"
import { keepProjectPicture } from "./project-picture.ts"
import { OpeningProject, ProjectFailed } from "./ProjectStatus.tsx"
import { useTool } from "./selection.ts"
import { useTabs, workspace } from "./workspace.ts"

/**
 * One project tab. Inactive tabs stay mounted, so switching back is instant and agents can still read them, though a
 * while after one's hidden its frames sleep, showing their bitmaps, until it's shown again (PAR-153). It's given
 * the tab's id rather than the tab: React keeps the props its parent drew last, and a closed tab's session, canvas
 * included, would stay in memory until the window drew again.
 */
export function ProjectView({ id, active }: { id: string; active: boolean }) {
  const tab = useTabs().find((candidate) => candidate.id === id)
  const session = tab?.session
  useShortcuts(session, active)
  // The start page's picture of the project, taken as it opens and after each save (PAR-607).
  useEffect(() => (session ? keepProjectPicture(session) : undefined), [session])
  if (!tab) return null
  const reopen = () => void workspace.reload(id)

  if (!session) {
    return (
      <main hidden={!active} className="flex min-h-0 flex-1 flex-col">
        {tab.status === "error" ? <ProjectFailed tab={tab} /> : <OpeningProject tab={tab} />}
      </main>
    )
  }

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

  // Component previews are made in the background for as long as the tab is open (PAR-207).
  const projectId = session?.id
  useEffect(() => (projectId ? startPreviews(projectId) : undefined), [projectId])

  useEffect(() => {
    const editor = session?.editor
    if (!editor) return
    editor.setCurrentTool(tool === "hand" ? "hand" : "select")
  }, [session?.editor, tool])

  // Isolated, so the canvas's floating controls and overlays, high up within it, stay below menus and dialogs. A
  // right-click on it opens the canvas's menu.
  return (
    <CanvasMenu>
      <div
        className={`canvas-area relative isolate min-w-0 flex-1 ${tool === "text" ? "cursor-text" : ""} ${tool === "frame" ? "cursor-crosshair" : ""}`}
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
        <ErrorBoundary name="canvas.inspect" label="Inspect" kind="silent">
          <InspectOverlay />
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
        <ErrorBoundary name="canvas.view-controls" label="View controls" kind="silent">
          <ViewControls />
        </ErrorBoundary>
      </div>
    </CanvasMenu>
  )
}
