import { useKnownProjects } from "../workspace.ts"
import { ProjectList } from "./ProjectList.tsx"
import type { KnownProject } from "./projects.ts"
import { NewProjectButton, OpenMenu, SearchButton } from "./StartControls.tsx"

/** A new tab, with the projects the window remembers. A project opened from it opens in this tab. */
export function NewTabPage({ active }: { active: boolean }) {
  return <NewTab projects={useKnownProjects()} active={active} />
}

/** A new tab: one field to go anywhere, which has the keyboard when the tab shows, then your projects. */
export function NewTab({ projects, active = true }: { projects: readonly KnownProject[]; active?: boolean }) {
  return (
    <main hidden={!active} aria-label="New tab" className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-11 px-4 pt-16 pb-14 sm:px-10">
        <h1 className="sr-only">New tab</h1>
        <div className="mx-auto flex w-full max-w-[640px] flex-col items-center gap-3">
          <SearchButton large takeFocus={active} />
          <div className="flex flex-wrap items-center justify-center gap-2">
            <OpenMenu />
            <NewProjectButton />
          </div>
        </div>
        <ProjectList projects={projects} />
      </div>
    </main>
  )
}
