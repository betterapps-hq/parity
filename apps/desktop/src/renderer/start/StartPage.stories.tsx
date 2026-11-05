import { SonnerToaster } from "@buildkitgg/shadcn-baseui-kit"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { type ReactNode, useState } from "react"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { useResolvedTheme } from "../theme.ts"
import { Home } from "./HomePage.tsx"
import { NewTab } from "./NewTabPage.tsx"
import { type KnownProject, knownProjects, type ProjectNote } from "./projects.ts"
import { StartActionsProvider } from "./start-actions.ts"

/**
 * The start page as the window shows it, built from the explorations (Parity/Explorations/Start page): Home, pinned
 * first in the tab strip, and a new tab. What Parity can't do yet is in place and says so when used: project pictures
 * are placeholders, For you and Shared with you are empty, and New project, cloning, links and organizations say
 * they're coming. Starring and removing work here as in the window.
 */
const meta = {
  title: "Parity/Start page",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const minutes = (count: number) => Date.now() - count * 60_000

const sampleRecent = [
  "D:\\apps\\kestrel-website",
  "D:\\apps\\cloud-console",
  "D:\\apps\\walkies",
  "D:\\apps\\ember-caves",
  "D:\\apps\\help-center",
  "D:\\apps\\pocket-vet",
  "D:\\apps\\market-square",
  "D:\\apps\\design-system",
  "D:\\apps\\team-chat",
  "D:\\apps\\notebook"
]

const sampleNotes: Record<string, ProjectNote> = {
  "D:\\apps\\kestrel-website": { opened: minutes(12) },
  "D:\\apps\\cloud-console": { opened: minutes(180), starred: true },
  "D:\\apps\\walkies": { opened: minutes(60 * 22) },
  "D:\\apps\\ember-caves": { opened: minutes(60 * 24 * 3) },
  "D:\\apps\\help-center": { opened: minutes(60 * 24 * 9), starred: true },
  "D:\\apps\\pocket-vet": { opened: minutes(60 * 24 * 30) },
  "D:\\apps\\market-square": { opened: minutes(60 * 24 * 60) },
  "D:\\apps\\design-system": {},
  "D:\\apps\\team-chat": { opened: minutes(60 * 24 * 400) },
  "D:\\apps\\notebook": { opened: minutes(60 * 24 * 420) },
  "D:\\archive\\old-portal": { opened: minutes(60 * 24 * 500), starred: true }
}

/**
 * The page with projects that star, unstar and leave the recent list as they would in the window. Opening one, or a
 * folder, does nothing here.
 */
function Sample({
  recent = sampleRecent,
  notes = sampleNotes,
  children
}: {
  recent?: readonly string[]
  notes?: Record<string, ProjectNote>
  children: (projects: readonly KnownProject[]) => ReactNode
}) {
  const [listed, setListed] = useState(recent)
  const [kept, setKept] = useState(notes)
  const theme = useResolvedTheme()
  const ignore = () => undefined
  return (
    <StartActionsProvider
      value={{
        open: ignore,
        openFolder: ignore,
        openFile: ignore,
        search: ignore,
        star: (root, starred) => setKept((current) => ({ ...current, [root]: { ...current[root], starred } })),
        forget: (root) => setListed((current) => current.filter((candidate) => candidate !== root))
      }}
    >
      <div className="flex h-screen flex-col bg-background text-foreground">
        {children(knownProjects(listed, kept))}
      </div>
      {/* The kit follows the system's theme unless told, which in a light story is the wrong one. */}
      <SonnerToaster theme={theme} position="bottom-right" />
    </StartActionsProvider>
  )
}

/** Home: the project you were last in, then the rest. For you is empty until something can need you. */
export const HomePage: Story = {
  render: () => <Sample>{(projects) => <Home projects={projects} />}</Sample>
}

/** Home before any project has opened: the ways to open one. */
export const HomeFirstTime: Story = {
  render: () => (
    <Sample recent={[]} notes={{}}>
      {(projects) => <Home projects={projects} />}
    </Sample>
  )
}

/** Home's Starred list, which keeps a starred project even after it leaves the recent list. */
export const HomeStarred: Story = {
  render: () => <Sample>{(projects) => <Home projects={projects} />}</Sample>,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Starred" }))
    await expect(within(canvasElement).getByRole("button", { name: "old-portal" })).toBeInTheDocument()
  }
}

/** Shared with you, empty until projects can be shared. */
export const HomeSharedWithYou: Story = {
  render: () => <Sample>{(projects) => <Home projects={projects} />}</Sample>,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Shared with you" }))
    await expect(within(canvasElement).getByText("Nothing has been shared with you yet.")).toBeInTheDocument()
  }
}

/** A project's menu: open it, star it, start a new project from it, copy its link, or take it off the list. */
export const ProjectMenu: Story = {
  render: () => <Sample>{(projects) => <Home projects={projects} />}</Sample>,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "More for cloud-console" }))
    await within(document.body).findByRole("menuitem", { name: "Unstar" })
  }
}

/** New project says it isn't ready yet, and offers to open a folder instead. */
export const NewProjectNotReady: Story = {
  render: () => <Sample>{(projects) => <Home projects={projects} />}</Sample>,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "New project" }))
    await waitFor(() => expect(within(document.body).getByText("New project isn't ready yet")).toBeInTheDocument())
  }
}

/** The Open menu: a folder or a project file, or a repository to clone, which isn't ready yet. */
export const OpenMenu: Story = {
  render: () => <Sample>{(projects) => <Home projects={projects} />}</Sample>,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Open" }))
    await within(document.body).findByRole("menuitem", { name: "Clone from GitHub" })
  }
}

/** A new tab: search, New project and Open, then your projects. */
export const NewTabPage: Story = {
  render: () => <Sample>{(projects) => <NewTab projects={projects} />}</Sample>
}

/** A new tab before any project has opened. */
export const NewTabFirstTime: Story = {
  render: () => (
    <Sample recent={[]} notes={{}}>
      {(projects) => <NewTab projects={projects} />}
    </Sample>
  )
}
