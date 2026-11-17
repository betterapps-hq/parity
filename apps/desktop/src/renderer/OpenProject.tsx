import { useEffect } from "react"
import { ProjectContext } from "./canvas/context.ts"
import { ProjectColors } from "./canvas/project-colors.tsx"
import { ErrorBoundary } from "./chrome/ErrorBoundary.tsx"
import { setLayout, useLayout } from "./chrome/layout.ts"
import { StatusBar } from "./chrome/StatusBar.tsx"
import { startPreviews } from "./component-previews.ts"
import { followSelection, sendRouteMarks } from "./extension-editor.ts"
import { appLenses } from "./lenses/app-lenses.ts"
import { LensWorkspace } from "./lenses/LensWorkspace.tsx"
import { OpenProjectContext } from "./lenses/project-canvas.tsx"
import type { Project, ProjectSession } from "./workspace.ts"

/** A project opens on Screens, as it did before it had lenses; Pages draws its pages once it's shown. */
const openingLayout = { groups: [{ where: "main", tabs: ["screens"] }] }

/**
 * An open project in the lens shell: the lens bar, each open lens a tab over its canvas, and the left panel and inspector
 * of the lens in focus (lens-layout.md). It's loaded in a chunk of its own (PAR-1084): tldraw and the panels make up
 * most of the window's code, and none of it is drawn until a project has opened, so the window paints without it.
 */
export function OpenProject({
  project,
  session,
  active,
  reopen
}: {
  project: Project
  session: ProjectSession
  active: boolean
  reopen: () => void
}) {
  // The project's extensions read what's selected through `parity.selection` (PAR-1092).
  useEffect(() => followSelection(session), [session])
  // And the person's marks on its routes through `parity.routes` (PAR-1175, PAR-1176).
  useEffect(() => sendRouteMarks(session), [session])

  // The panels follow the window's panel layout, which Show Layers, the View menu and extensions change too.
  const { left, right } = useLayout()

  // Component previews are made in the background for as long as the project is open (PAR-207), and go when it closes.
  useEffect(() => startPreviews(session), [session])

  return (
    <ProjectContext value={session}>
      <ProjectColors hidden={!active} className="flex min-h-0 flex-1 flex-col">
        {/* Each part fails on its own; this catches what they don't, and can reopen the project (PAR-667). */}
        <ErrorBoundary name="project" label={project.title} kind="page" onReopen={reopen}>
          <OpenProjectContext value={{ projectId: project.id, shown: active, reopen }}>
            <LensWorkspace
              lenses={appLenses}
              layout={openingLayout}
              title={project.title}
              panels={{ left, right }}
              onPanels={setLayout}
              statusBar={
                <ErrorBoundary name="status-bar" label="Status bar" kind="strip" className="h-7 shrink-0 border-t">
                  <StatusBar />
                </ErrorBoundary>
              }
            />
          </OpenProjectContext>
        </ErrorBoundary>
      </ProjectColors>
    </ProjectContext>
  )
}
