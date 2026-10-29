import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect, useState } from "react"
import type { MockTab } from "../parts.tsx"
import type { Template } from "./data.ts"
import { FirstRunPage } from "./first-run.tsx"
import { NewProjectDialog, type NewProjectStart } from "./new-project.tsx"
import { HomePage, NewTabPage, StartWindow } from "./page.tsx"
import { SearchPalette } from "./search.tsx"

/**
 * The second pass at the start page: what the app shows when it opens, on the Home tab and in a new tab. Every
 * project shows a live render of its canvas, with whoever is working there; moving across a project flips through its
 * designs. New projects start from a template on a stack, as the Scaffolder builds them, or from a project, repository
 * or folder you already have. Everything here can be clicked through: New project, the templates, Open and search
 * (Ctrl K).
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
  "new-tab": [{ id: "home", title: "Home", home: true, badge: 3 }, ...openProjects, { id: "new", title: "New tab" }],
  "first-run": [{ id: "home", title: "Home", home: true }]
}

/** A start page with its dialogs wired up, so the flows can be tried. */
function StartStory({ context, dialog, search }: { context: Context; dialog?: NewProjectStart; search?: string }) {
  const [start, setStart] = useState(dialog)
  const [searching, setSearching] = useState(search !== undefined)
  useEffect(() => {
    const open = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      setSearching(true)
    }
    window.addEventListener("keydown", open)
    return () => window.removeEventListener("keydown", open)
  }, [])
  const actions = {
    onNewProject: () => setStart({ tab: "template" }),
    onSearch: () => setSearching(true),
    onPickTemplate: (template: Template) => setStart({ tab: "template", stack: template.stack, template: template.id }),
    onPickExisting: () => setStart({ tab: "existing" })
  }
  return (
    <StartWindow
      tabs={tabsFor[context]}
      active={context === "new-tab" ? "new" : "home"}
      unread={context === "first-run" ? 0 : 3}
    >
      {context === "home" && <HomePage {...actions} />}
      {context === "new-tab" && <NewTabPage {...actions} />}
      {context === "first-run" && (
        <FirstRunPage onPickTemplate={actions.onPickTemplate} onPickExisting={actions.onPickExisting} />
      )}
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
  )
}

/**
 * Home, when Parity opens. Where you left off comes first, as a live render of the board you were on with what changed
 * since. Beside it, what needs you: an agent waiting on an answer, a mention and a review. Then your projects, each a
 * render of its canvas you can scrub through, and something new: templates on the stack you pick, a blank app, or an
 * existing project. The agents you've connected and help sit at the bottom.
 */
export const Home: Story = { render: () => <StartStory context="home" /> }

/**
 * A new tab: one field to go anywhere, then your projects and something new. Projects already open in a tab say so,
 * and picking one switches to its tab. Where you left off and what needs you stay on Home, whose tab shows a dot.
 */
export const NewTab: Story = { render: () => <StartStory context="new-tab" /> }

/**
 * The first time, signed in with nothing yet: templates by stack are the main way in, with ways to bring a project you
 * have, a finished sample to look around, and your agents to connect.
 */
export const FirstRun: Story = { render: () => <StartStory context="first-run" /> }

/**
 * New project, from a template: stacks on the left, then the stack's templates, each drawn from its first design and
 * listing what it adds. A blank app is always there too.
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
 * templates and commands, in one list.
 */
export const Search: Story = { render: () => <StartStory context="home" search="bill" /> }
