import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect, useRef, useState } from "react"
import type { MockTab } from "../parts.tsx"
import { forYou, projects, type StartProject, type Template } from "./data.ts"
import { FirstRunPage } from "./first-run.tsx"
import { NewProjectDialog, type NewProjectStart } from "./new-project.tsx"
import { HomePage, NewTabPage, ProjectTab, StartActionsProvider, StartWindow } from "./page.tsx"
import { SearchPalette } from "./search.tsx"

/**
 * The start page: what the app shows when it opens, on the Home tab and in a new tab. It stays quiet: a render of
 * each project and a few words about it, with the rest a click away. Everything works: the tabs and menus, the inbox
 * and account, opening a project (which opens its tab), New project with its templates, Open, and search (Ctrl K).
 */
const meta = {
  title: "Parity/Explorations/Start page",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

type Context = "home" | "new-tab" | "first-run"

const openProjects: MockTab[] = [
  { id: "website", title: "Kestrel website" },
  { id: "dashboard", title: "Cloud console" }
]

const tabsFor: Record<Context, MockTab[]> = {
  home: [{ id: "home", title: "Home", home: true }, ...openProjects],
  "new-tab": [{ id: "home", title: "Home", home: true }, ...openProjects, { id: "new", title: "New tab" }],
  "first-run": [{ id: "home", title: "Home", home: true }]
}

const isNewTab = (id: string) => id === "new" || id.startsWith("new-")

/** A start page in a working window: tabs open, switch and close, and every control does what it says. */
function StartStory({ context, dialog, search }: { context: Context; dialog?: NewProjectStart; search?: string }) {
  const [tabs, setTabs] = useState(tabsFor[context])
  const [active, setActive] = useState(context === "new-tab" ? "new" : "home")
  const [made, setMade] = useState<StartProject[]>([])
  const [start, setStart] = useState(dialog)
  const [searching, setSearching] = useState(search !== undefined)
  const [done, setDone] = useState<string[]>([])
  const opened = useRef(0)
  useEffect(() => {
    const open = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      setSearching(true)
    }
    window.addEventListener("keydown", open)
    return () => window.removeEventListener("keydown", open)
  }, [])
  const everything = [...projects, ...made]
  /** A project opens in its tab: the one it's in already, the new tab it was picked from, or a tab of its own. */
  const openProject = (id: string, known = everything) => {
    const project = known.find((candidate) => candidate.id === id)
    if (!project) return
    setStart(undefined)
    setSearching(false)
    if (!tabs.some((tab) => tab.id === id)) {
      const tab = { id, title: project.name }
      setTabs(isNewTab(active) ? tabs.map((item) => (item.id === active ? tab : item)) : [...tabs, tab])
    }
    setActive(id)
  }
  const closeTab = (id: string) => {
    const at = tabs.findIndex((tab) => tab.id === id)
    const rest = tabs.filter((tab) => tab.id !== id)
    setTabs(rest)
    if (id === active) setActive(rest[Math.max(0, at - 1)]!.id)
  }
  const newTab = () => {
    const id = `new-${++opened.current}`
    setTabs([...tabs, { id, title: "New tab" }])
    setActive(id)
  }
  const unread = context === "first-run" ? 0 : forYou.filter((item) => item.unread && !done.includes(item.id)).length
  const shown = active === "home" || isNewTab(active) ? undefined : everything.find((item) => item.id === active)
  return (
    <StartActionsProvider
      value={{
        openProject,
        create: (project) => {
          setMade([...made, project])
          openProject(project.id, [project])
        },
        newProject: (from) => setStart(from ?? { tab: "template" }),
        search: () => setSearching(true),
        done,
        markDone: (...ids) => setDone((current) => [...current, ...ids])
      }}
    >
      <StartWindow
        tabs={tabs.map((tab) => (tab.home ? { ...tab, badge: active === "home" ? 0 : unread } : tab))}
        active={active}
        canvas={!!shown}
        inbox={context !== "first-run"}
        onSelect={setActive}
        onClose={closeTab}
        onNew={newTab}
      >
        {active === "home" &&
          (context === "first-run" ? (
            <FirstRunPage
              onPickTemplate={(template: Template) =>
                setStart({ tab: "template", stack: template.stack, template: template.id })
              }
              onPickExisting={() => setStart({ tab: "existing" })}
            />
          ) : (
            <HomePage />
          ))}
        {isNewTab(active) && <NewTabPage />}
        {shown && <ProjectTab key={shown.id} project={shown} />}
        {start && (
          <NewProjectDialog
            key={JSON.stringify(start)}
            start={start}
            open
            onOpenChange={(open) => !open && setStart(undefined)}
          />
        )}
        <SearchPalette open={searching} onOpenChange={setSearching} initialQuery={search ?? ""} />
      </StartWindow>
    </StartActionsProvider>
  )
}

/**
 * Home, when Parity opens. Where you left off comes first, as a render of the board you were on and a sentence on what
 * changed since; Enter resumes it. Beside it, what needs you, one line each: the button does the thing and clears it.
 * Then two rows of your projects, each a render you can scrub through. New project starts something new. Switching
 * the organization switches the projects. Agents, settings and help sit in the account menu.
 */
export const Home: Story = { render: () => <StartStory context="home" /> }

/**
 * A new tab: one field to go anywhere, then your projects. Picking a project opens it in this tab, or switches to the
 * tab it's already in. Home's tab shows a dot while something waits for you.
 */
export const NewTab: Story = { render: () => <StartStory context="new-tab" /> }

/**
 * The first time, signed in with nothing yet: templates by stack are the main way in, with ways to bring a project you
 * have, a finished sample to look around, and your agents to connect.
 */
export const FirstRun: Story = { render: () => <StartStory context="first-run" /> }

/**
 * New project, from a template: stacks on the left, then the stack's templates, each drawn from its first design and
 * listing what it adds. A blank app is always there too. Create opens the new project in a tab.
 */
export const NewProjectTemplates: Story = {
  render: () => <StartStory context="home" dialog={{ tab: "template" }} />
}

/**
 * A template picked: its designs as the canvas will open them, beside only the questions the template still asks.
 * Who it's for picks sign-in and billing, as the stack guide recommends; the footer sums up what gets added.
 */
export const NewProjectSetUp: Story = {
  render: () => <StartStory context="home" dialog={{ tab: "template", template: "saas" }} />
}

/**
 * New project from one of yours: it keeps the stack, components and tokens, and you choose what else comes along.
 * Comments and history stay with the original.
 */
export const NewProjectFromAProject: Story = {
  render: () => <StartStory context="home" dialog={{ tab: "existing", source: "projects", project: "dashboard" }} />
}

/**
 * New project from a repository: the connected account's repositories, with the stack Parity found in each. Ones
 * without a React app can't be opened, and ones already in Parity just open.
 */
export const NewProjectFromARepository: Story = {
  render: () => <StartStory context="home" dialog={{ tab: "existing", source: "github" }} />
}

/**
 * Search, from the field or Ctrl K: designs with their renders, projects, components by their code names, people,
 * templates and commands, in one list. Picking one opens it.
 */
export const Search: Story = { render: () => <StartStory context="home" search="bill" /> }
