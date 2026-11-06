import { useCallback, useEffect } from "react"
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
import { ConsolePanel } from "./chrome/ConsolePanel.tsx"
import { Inspector } from "./chrome/Inspector.tsx"
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
        <main className="flex min-h-0 flex-1">
          <LeftPanel />
          {/* The console docks under the canvas, between the side panels (PAR-147). */}
          <div className="flex min-w-0 flex-1 flex-col">
            <CanvasArea tabId={tab.id} shown={active} />
            <ConsolePanel />
          </div>
          <Inspector />
        </main>
        <StatusBar />
      </div>
    </ProjectContext>
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
        <CanvasOverlay />
        <TabOrderOverlay />
        <InspectOverlay />
        <CanvasDrop />
        <AgentPresence />
        <FloatingToolbar />
        <ViewControls />
      </div>
    </CanvasMenu>
  )
}
