import { lazy, Suspense } from "react"
import { useShortcuts } from "./canvas/shortcuts.ts"
import { OpeningProject, ProjectFailed } from "./ProjectStatus.tsx"
import { useTabs, workspace } from "./workspace.ts"

const loadOpenProject = () => import("./OpenProject.tsx")
const OpenProject = lazy(() => loadOpenProject().then(({ OpenProject }) => ({ default: OpenProject })))

/**
 * Loads the open project's chunk once the window has painted and is idle, so a project that opens seconds later finds
 * it ready rather than waiting for it (PAR-1084).
 */
export function preloadOpenProject(): void {
  requestIdleCallback(() => void loadOpenProject())
}

/**
 * One project tab. Inactive tabs stay mounted, so switching back is instant and agents can still read them, though a
 * while after one's hidden its frames sleep, showing their bitmaps, until it's shown again (PAR-153). It's given
 * the tab's id rather than the tab: React keeps the props its parent drew last, and a closed tab's session, canvas
 * included, would stay in memory until the window drew again.
 */
export function ProjectView({ id, active }: { id: string; active: boolean }) {
  const tab = useTabs().find((candidate) => candidate.id === id)
  const session = tab?.session
  useShortcuts(session?.selection, active)

  if (!tab) {
    return null
  }

  const reopen = () => void workspace.reload(id)

  if (!session) {
    return (
      <main hidden={!active} className="flex min-h-0 flex-1 flex-col">
        {tab.status === "error" ? <ProjectFailed tab={tab} /> : <OpeningProject tab={tab} />}
      </main>
    )
  }

  return (
    <Suspense
      fallback={
        <main hidden={!active} className="flex min-h-0 flex-1 flex-col">
          <OpeningProject tab={tab} />
        </main>
      }
    >
      <OpenProject tab={tab} session={session} active={active} reopen={reopen} />
    </Suspense>
  )
}
