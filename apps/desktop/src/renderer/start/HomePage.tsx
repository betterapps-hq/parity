import { Button, Kbd } from "@buildkitgg/shadcn-baseui-kit"
import { FileInput, FolderOpen } from "lucide-react"
import { useEffect } from "react"
import { formatKeys } from "../chrome/keys.ts"
import { useKnownProjects } from "../workspace.ts"
import { accent, ProjectArt } from "./ProjectCard.tsx"
import { ProjectList } from "./ProjectList.tsx"
import { type KnownProject, whenLabel } from "./projects.ts"
import { useStartActions } from "./start-actions.ts"
import { NewProjectButton, OpenMenu, OrgSwitcher, SearchButton } from "./StartControls.tsx"
import { useNow } from "./use-now.ts"

/** Home, pinned first in the tab strip, with the projects the window remembers. */
export function HomePage({ active }: { active: boolean }) {
  return <Home projects={useKnownProjects()} active={active} />
}

/**
 * Home: the project you were last in and what needs you, then your projects. It stays mounted while another tab shows,
 * so its lists keep their place.
 */
export function Home({ projects, active = true }: { projects: readonly KnownProject[]; active?: boolean }) {
  const last = projects.find((project) => project.recent)
  return (
    <main hidden={!active} aria-label="Home" className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-11 px-4 pt-6 pb-14 sm:px-10">
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <OrgSwitcher />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <SearchButton />
            <OpenMenu />
            <NewProjectButton />
          </div>
        </header>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_300px]">
          {last ? <ContinueCard project={last} active={active} /> : <OpenFirst />}
          <ForYou />
        </div>
        <ProjectList projects={projects} skip={last?.root} />
      </div>
    </main>
  )
}

/**
 * The project you were last in. Its picture and Resume open it, and Enter does unless something else on the page has the
 * keyboard. The picture's ring shows only while the pointer is on it.
 */
function ContinueCard({ project, active }: { project: KnownProject; active: boolean }) {
  const actions = useStartActions()
  const now = useNow()
  const resume = () => actions.open(project.root)
  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" && event.target === document.body && !event.defaultPrevented) resume()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })
  return (
    <section
      aria-label="Continue where you left off"
      className="grid items-center gap-7 sm:grid-cols-[minmax(0,400px)_minmax(0,1fr)]"
      style={accent}
    >
      {/* For the pointer only: Resume, beside it, does the same from the keyboard. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={resume}
        className="block overflow-hidden rounded-lg text-left ring-1 ring-foreground/10 outline-none transition-shadow duration-150 hover:ring-2 hover:ring-(--parity)"
      >
        <ProjectArt project={project} />
      </button>
      <div className="flex min-w-0 flex-col items-start gap-3">
        <div className="flex max-w-full flex-col gap-1">
          <span className="text-xs text-muted-foreground">Continue where you left off</span>
          <h2 className="max-w-full truncate text-lg font-semibold tracking-tight">{project.name}</h2>
        </div>
        <p className="max-w-full text-sm text-pretty wrap-anywhere text-muted-foreground">
          {project.opened === undefined ? project.root : `You last opened it ${whenLabel(project.opened, now)}.`}
        </p>
        <Button onClick={resume} aria-label={`Resume ${project.name}`} className="mt-1 gap-2">
          Resume <Kbd className="bg-primary-foreground/10 text-primary-foreground/70">{formatKeys("Enter")}</Kbd>
        </Button>
      </div>
    </section>
  )
}

/** Before any project has opened: the two ways to open one. */
function OpenFirst() {
  const actions = useStartActions()
  return (
    <section aria-labelledby="open-first" className="flex flex-col items-start gap-3 rounded-xl border bg-card/40 p-7">
      <h2 id="open-first" className="text-lg font-semibold tracking-tight">
        Open a project
      </h2>
      <p className="text-sm text-pretty text-muted-foreground">
        Parity opens a React app&apos;s folder and puts its components on a canvas.
      </p>
      <div className="mt-1 flex flex-wrap gap-2">
        <Button onClick={actions.openFolder}>
          <FolderOpen /> Open a folder
        </Button>
        <Button variant="outline" onClick={actions.openFile}>
          <FileInput /> Open a project file
        </Button>
      </div>
    </section>
  )
}

/** What needs you across every project: mentions, reviews, an agent waiting. Nothing can yet, so it's always clear. */
function ForYou() {
  return (
    <section aria-labelledby="for-you" className="flex flex-col gap-1.5">
      <h2 id="for-you" className="text-sm font-semibold">
        For you
      </h2>
      <p className="py-2 text-sm text-muted-foreground">Nothing needs you right now.</p>
    </section>
  )
}
