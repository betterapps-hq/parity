import { Button, Kbd } from "@buildkitgg/shadcn-baseui-kit"
import { ArrowRight, FileInput, FolderOpen, Inbox } from "lucide-react"
import { useEffect, useId, useMemo } from "react"
import { useAccount } from "../account/account.ts"
import { formatKeys } from "../chrome/keys.ts"
import { Name } from "../chrome/Name.tsx"
import { PanelSectionTitle } from "../chrome/PanelSection.tsx"
import { useExampleFolder, useKnownProjects } from "../workspace.ts"
import { examplePicture } from "./example-picture.ts"
import { ProjectArt } from "./ProjectArt.tsx"
import { accent } from "./ProjectCard.tsx"
import { ProjectList } from "./ProjectList.tsx"
import { type KnownProject, whenLabel } from "./projects.ts"
import { StartActionsProvider, useStartActions, workspaceActions } from "./start-actions.ts"
import { NewProjectButton, OpenMenu, SearchButton, WorkspaceMenu } from "./StartControls.tsx"
import { useNow } from "./use-now.ts"

/** Home, pinned first in the tab strip, with the projects the window remembers and the example when there is one. */
export function HomePage({ active }: { active: boolean }) {
  const projects = useKnownProjects()
  const example = useExampleFolder()
  const actions = useMemo(
    () =>
      example
        ? { ...workspaceActions, example: { root: example, name: "Acme", picture: examplePicture } }
        : workspaceActions,
    [example]
  )
  return (
    <StartActionsProvider value={actions}>
      <Home projects={projects} active={active} />
    </StartActionsProvider>
  )
}

/**
 * Home: the project you were last in and what needs you, then your projects. It stays mounted while another tab shows,
 * so its lists keep their place.
 */
export function Home({ projects, active = true }: { projects: readonly KnownProject[]; active?: boolean }) {
  const last = projects.find((project) => project.recent && !project.missing)
  const signedIn = !!useAccount().state.account
  // The ways to bring your own app sit beside the example; without it, the first-time panel offers them itself.
  const { example } = useStartActions()
  const bringYourOwn = !last && !!example
  const side = bringYourOwn || signedIn
  return (
    <main hidden={!active} aria-label="Home" className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-11 px-4 pt-6 pb-14 sm:px-10">
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <WorkspaceMenu />
          <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2 max-sm:w-full">
            <SearchButton />
            <OpenMenu />
            <NewProjectButton />
          </div>
        </header>
        <div className={`grid gap-12 ${side ? "lg:grid-cols-[minmax(0,1fr)_300px]" : ""}`}>
          {last ? <ContinueCard project={last} active={active} /> : <FirstTime />}
          {side && (
            <div className="flex flex-col gap-8">
              {bringYourOwn && <BringYourOwn />}
              {signedIn && <ForYou />}
            </div>
          )}
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
export function ContinueCard({ project, active }: { project: KnownProject; active: boolean }) {
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
        <ProjectArt project={project} labels />
      </button>
      <div className="flex min-w-0 flex-col items-start gap-3">
        <div className="flex max-w-full flex-col gap-1">
          <span className="text-xs text-muted-foreground">Continue where you left off</span>
          <h2 className="max-w-full truncate text-lg font-semibold tracking-tight">
            <Name>{project.name}</Name>
          </h2>
        </div>
        <p className="max-w-full type-body wrap-anywhere text-muted-foreground">
          {project.opened === undefined ? project.root : `You last opened it ${whenLabel(project.opened, now)}.`}
        </p>
        <Button onClick={resume} aria-label={`Resume ${project.name}`} className="mt-1 gap-2">
          Resume <Kbd className="bg-primary-foreground/10 text-primary-foreground/70">{formatKeys("Enter")}</Kbd>
        </Button>
      </div>
    </section>
  )
}

/**
 * Before any project has opened, where Continue will be, so nothing moves once there's one: the example to look around,
 * shown as Continue shows a project, or, without it, what Parity does with your app and how to open it.
 */
export function FirstTime() {
  const actions = useStartActions()
  const { example } = actions
  if (!example) {
    return (
      <section
        aria-labelledby="first-time"
        className="grid items-center gap-7 sm:grid-cols-[minmax(0,400px)_minmax(0,1fr)]"
      >
        <OpenArt />
        <div className="flex min-w-0 flex-col items-start gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Welcome to Parity</span>
            <h2 id="first-time" className="text-lg font-semibold tracking-tight">
              Open your React app
            </h2>
          </div>
          <p className="type-body text-muted-foreground">
            Parity puts your app&apos;s screens and components on a canvas, drawn by your own code. Changes you make on
            the canvas are written back to it.
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Button onClick={actions.openFolder}>
              <FolderOpen /> Open a folder
            </Button>
            <Button variant="outline" onClick={actions.openFile}>
              <FileInput /> Open a project file
            </Button>
          </div>
        </div>
      </section>
    )
  }
  const project: KnownProject = { root: example.root, name: example.name, starred: false, recent: false }
  const open = () => actions.open(example.root)
  return (
    <section
      aria-labelledby="first-time"
      className="grid items-center gap-7 sm:grid-cols-[minmax(0,400px)_minmax(0,1fr)]"
      style={accent}
    >
      {/* For the pointer only: the button beside it does the same from the keyboard. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={open}
        className="block overflow-hidden rounded-lg text-left ring-1 ring-foreground/10 outline-none transition-shadow duration-150 hover:ring-2 hover:ring-(--parity)"
      >
        <ProjectArt project={project} labels fallback={example.picture} />
      </button>
      <div className="flex min-w-0 flex-col items-start gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Look around first</span>
          <h2 id="first-time" className="text-lg font-semibold tracking-tight">
            {example.name}, an example app
          </h2>
        </div>
        <p className="type-body text-muted-foreground">
          See its screens in desktop and mobile, drawn by its own code. Then pick another variant for a button, put two
          layers in a row, or see what the accessibility checks find.
        </p>
        <Button onClick={open} className="mt-1">
          Open {example.name} <ArrowRight />
        </Button>
      </div>
    </section>
  )
}

/** A picture for opening your own app: a folder, and the boards it becomes. */
function OpenArt() {
  return (
    <div
      aria-hidden
      className="relative grid aspect-[16/10] place-items-center overflow-hidden rounded-lg bg-muted/70 ring-1 ring-foreground/10"
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 60% at 30% 25%, oklch(0.7 0.16 275 / 0.22), transparent 70%), radial-gradient(50% 50% at 90% 100%, oklch(0.6 0.12 335 / 0.14), transparent 70%)"
        }}
      />
      <div className="relative flex items-center gap-[6%] px-[8%]">
        <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-background shadow-lg ring-1 ring-neutral-500/60">
          <FolderOpen className="size-6 text-muted-foreground" />
        </span>
        <ArrowRight className="size-5 shrink-0 text-muted-foreground" />
        <span className="flex items-end gap-2">
          <span className="flex aspect-[16/10] w-36 flex-col overflow-hidden rounded-[5px] bg-background shadow-lg ring-1 ring-neutral-500/60">
            <span className="h-[14%] border-b" />
            <span className="flex flex-1 gap-[6%] p-[7%]">
              <span className="w-[22%] rounded-sm bg-muted" />
              <span className="flex flex-1 flex-col gap-[10%]">
                <span className="h-[18%] w-2/3 rounded-sm bg-muted" />
                <span className="flex-1 rounded-sm bg-muted/60" />
              </span>
            </span>
          </span>
          <span className="flex aspect-[9/19] w-11 flex-col overflow-hidden rounded-[6px] bg-background shadow-lg ring-1 ring-neutral-500/60">
            <span className="h-[8%] border-b" />
            <span className="flex flex-1 flex-col gap-[8%] p-[12%]">
              <span className="h-[10%] rounded-sm bg-muted" />
              <span className="flex-1 rounded-sm bg-muted/60" />
            </span>
          </span>
        </span>
      </div>
    </div>
  )
}

/** Beside the example, the first time: the ways to open your own app instead. */
function BringYourOwn() {
  const actions = useStartActions()
  const detail = useId()
  const ways = [
    { icon: FolderOpen, name: "Open a folder", detail: "A React app on this computer", onClick: actions.openFolder },
    {
      icon: FileInput,
      name: "Open a project file",
      detail: "A .par file kept beside an app",
      onClick: actions.openFile
    }
  ]
  return (
    <section aria-labelledby="bring-your-own" className="flex flex-col gap-1.5">
      <SectionTitle id="bring-your-own" title="Bring your own app" />
      <ul className="-mx-2 flex flex-col">
        {ways.map((way, index) => (
          <li key={way.name}>
            <button
              type="button"
              onClick={way.onClick}
              aria-label={way.name}
              aria-describedby={`${detail}-${index}`}
              className="group/way flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <way.icon className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{way.name}</span>
                <span id={`${detail}-${index}`} className="truncate text-xs text-muted-foreground">
                  {way.detail}
                </span>
              </span>
              <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/way:opacity-100 group-focus-visible/way:opacity-100" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * What needs you across every project: mentions, reviews, an agent waiting. It comes through an organization, so Home
 * shows it only once you're signed in. Nothing can need you yet, so it says what will show up.
 */
function ForYou() {
  return (
    <section aria-labelledby="for-you" className="flex flex-col gap-2.5">
      <SectionTitle id="for-you" title="For you" />
      <div className="flex items-start gap-3 rounded-xl border border-dashed p-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Inbox className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium">Nothing needs you</p>
          <p className="type-description text-muted-foreground">
            Comments, mentions and reviews that need you show up here.
          </p>
        </div>
      </div>
    </section>
  )
}

/**
 * A section's title on Home: the inspector's section title, which leads what it heads, as Bring your own app and For
 * you lead their rows. It carries the id the section is labelled by, and sits at its rows' edge, without the indent and
 * margin a title keeps over a panel's fields.
 */
function SectionTitle({ id, title }: { id: string; title: string }) {
  return <PanelSectionTitle id={id} title={title} as="h2" spacing="-ml-1" />
}
