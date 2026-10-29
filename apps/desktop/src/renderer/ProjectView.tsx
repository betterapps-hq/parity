import { useCallback, useEffect } from "react"
import type { Editor } from "tldraw"
import { AgentPresence } from "./agent/AgentPresence.tsx"
import { CanvasDrop } from "./canvas/CanvasDrop.tsx"
import { CanvasEditor } from "./canvas/CanvasEditor.tsx"
import { CanvasOverlay } from "./canvas/CanvasOverlay.tsx"
import { ProjectContext } from "./canvas/context.ts"
import { useShortcuts } from "./canvas/shortcuts.ts"
import { TabOrderOverlay } from "./canvas/TabOrderOverlay.tsx"
import { Inspector } from "./chrome/Inspector.tsx"
import { LeftPanel } from "./chrome/LeftPanel.tsx"
import { StatusBar } from "./chrome/StatusBar.tsx"
import { FloatingToolbar, ViewControls } from "./chrome/Toolbar.tsx"
import { OpeningProject, ProjectFailed } from "./ProjectStatus.tsx"
import { useTool } from "./selection.ts"
import { type Tab, workspace } from "./workspace.ts"

/** One project tab. Inactive tabs stay mounted, so switching back is instant and agents can still read them. */
export function ProjectView({ tab, active }: { tab: Tab; active: boolean }) {
  const session = tab.session
  useShortcuts(session, active)

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
          <CanvasArea tabId={tab.id} />
          <Inspector />
        </main>
        <StatusBar />
      </div>
    </ProjectContext>
  )
}

function CanvasArea({ tabId }: { tabId: string }) {
  const session = workspace.getTab(tabId)?.session
  const tool = useTool(session!.selection)
  const onEditor = useCallback((editor: Editor | undefined) => workspace.setEditor(tabId, editor), [tabId])

  useEffect(() => {
    const editor = session?.editor
    if (!editor) return
    editor.setCurrentTool(tool === "hand" ? "hand" : "select")
  }, [session?.editor, tool])

  return (
    // Isolated, so the canvas's floating controls and overlays, high up within it, stay below menus and dialogs.
    <div
      className={`canvas-area relative isolate min-w-0 flex-1 ${tool === "text" ? "cursor-text" : ""}`}
      data-tool={tool}
    >
      <CanvasEditor onEditor={onEditor} />
      <CanvasOverlay />
      <TabOrderOverlay />
      <CanvasDrop />
      <AgentPresence />
      <FloatingToolbar />
      <ViewControls />
    </div>
  )
}
