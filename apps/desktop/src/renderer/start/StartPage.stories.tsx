import { SonnerToaster } from "@buildkitgg/shadcn-baseui-kit"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { type ReactNode, useMemo, useState } from "react"
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test"
import type { PictureFrame, PictureScreen, ProjectPicture } from "../../shared/protocol.ts"
import { setStoryAccount } from "../stories/host.ts"
import { useResolvedTheme } from "../theme.ts"
import { examplePicture } from "./example-picture.ts"
import dashboardDesktop from "./example-pictures/dashboard-desktop.webp?inline"
import dashboardMobile from "./example-pictures/dashboard-mobile.webp?inline"
import pricingDesktop from "./example-pictures/pricing-desktop.webp?inline"
import pricingMobile from "./example-pictures/pricing-mobile.webp?inline"
import settingsDesktop from "./example-pictures/settings-desktop.webp?inline"
import settingsMobile from "./example-pictures/settings-mobile.webp?inline"
import signInDesktop from "./example-pictures/sign-in-desktop.webp?inline"
import signInMobile from "./example-pictures/sign-in-mobile.webp?inline"
import teamMembersDesktop from "./example-pictures/team-members-desktop.webp?inline"
import teamMembersMobile from "./example-pictures/team-members-mobile.webp?inline"
import { Home } from "./HomePage.tsx"
import { NewTab } from "./NewTabPage.tsx"
import { type PictureSource, PictureSourceProvider } from "./pictures.ts"
import { type KnownProject, knownProjects, type ProjectNote } from "./projects.ts"
import { type StartActions, StartActionsProvider } from "./start-actions.ts"

/**
 * The start page as the window shows it, built from the explorations (Parity/Explorations/Start page/Start page): Home, pinned
 * first in the tab strip, and a new tab. Each project shows its picture, its first screens as last saved, or a
 * placeholder until it's opened (PAR-607); the pictures here are the example project's. What Parity can't do yet is in
 * place and says so when used: For you and Shared with you are empty, and New project, cloning, links and
 * organizations say they're coming. Starring and removing work here as in the window.
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

const sampleNotes = {
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
} satisfies Record<string, ProjectNote>

const desktop = (src: string, width = 1280): PictureFrame => ({ src, mode: "Desktop Light", width, height: 800 })
const mobile = (src: string): PictureFrame => ({ src, mode: "Mobile Light", width: 390, height: 844 })

/** The example project's first screens, as its picture keeps them. */
const teamMembers = { name: "Team members", main: desktop(teamMembersDesktop, 1243), phone: mobile(teamMembersMobile) }
const dashboard = { name: "Dashboard", main: desktop(dashboardDesktop), phone: mobile(dashboardMobile) }
const signIn = { name: "Sign in", main: desktop(signInDesktop), phone: mobile(signInMobile) }
const settings = { name: "Settings", main: desktop(settingsDesktop), phone: mobile(settingsMobile) }
const pricing = { name: "Pricing", main: desktop(pricingDesktop), phone: mobile(pricingMobile) }

const picture = (...screens: PictureScreen[]): ProjectPicture => ({ taken: minutes(12), screens })

/** Where the example lives, as a copy of Parity that has it would give it. */
const exampleRoot = "D:\\canvas\\examples\\shadcn-vite"

/**
 * Pictures for most of the sample projects: several screens to flip through, one screen, one without a phone frame,
 * and a phone alone. The rest haven't opened since pictures were kept, so they show the placeholder.
 */
const samplePictures = {
  "D:\\apps\\kestrel-website": picture(teamMembers, dashboard, signIn, settings, pricing),
  "D:\\apps\\cloud-console": picture(dashboard, settings, pricing),
  "D:\\apps\\walkies": picture(signIn, settings),
  "D:\\apps\\ember-caves": picture(pricing),
  "D:\\apps\\pocket-vet": picture({ name: "Settings", main: settings.main }),
  "D:\\apps\\team-chat": picture({ name: "Sign in", main: signIn.phone })
} satisfies Record<string, ProjectPicture>

/** The pictures a story shows, as the service would give them. */
function staticPictures(pictures: Record<string, ProjectPicture>): PictureSource {
  return { subscribe: () => () => undefined, get: (root) => pictures[root] ?? null, ask: () => undefined }
}

/**
 * The page with projects that star, unstar and leave the recent list as they would in the window. Opening one, or a
 * folder, does nothing here.
 */
function Sample({
  recent = sampleRecent,
  notes = sampleNotes,
  pictures = samplePictures,
  missing = [],
  example = false,
  children
}: {
  recent?: readonly string[]
  notes?: Record<string, ProjectNote>
  pictures?: Record<string, ProjectPicture>
  /** Folders that aren't there any more. */
  missing?: readonly string[]
  /** Whether this copy of Parity has the example to offer. */
  example?: boolean
  children: (projects: readonly KnownProject[]) => ReactNode
}) {
  const [listed, setListed] = useState(recent)
  const [kept, setKept] = useState(notes)
  const source = useMemo(() => staticPictures(pictures), [pictures])
  const theme = useResolvedTheme()
  const ignore = () => undefined

  const actions: StartActions = {
    open: ignore,
    openFolder: ignore,
    openFile: ignore,
    search: ignore,
    star: (root, starred) => setKept((current) => ({ ...current, [root]: { ...current[root], starred } })),
    forget: (root) => setListed((current) => current.filter((candidate) => candidate !== root))
  }

  if (example) {
    actions.example = { root: exampleRoot, name: "Acme", picture: examplePicture }
  }

  return (
    <PictureSourceProvider value={source}>
      <StartActionsProvider value={actions}>
        <div className="flex h-screen flex-col bg-background text-foreground">
          {children(
            knownProjects(listed, kept).map((project) =>
              missing.includes(project.root) ? { ...project, missing: true } : project
            )
          )}
        </div>
        {/* The kit follows the system's theme unless told, which in a light story is the wrong one. */}
        <SonnerToaster theme={theme} position="bottom-right" />
      </StartActionsProvider>
    </PictureSourceProvider>
  )
}

/** Home: the project you were last in, then the rest. For you is empty until something can need you. */
export const HomePage: Story = {
  render: () => <Sample>{(projects) => <Home projects={projects} />}</Sample>
}

/** Home signed in: For you sits beside Continue, empty until something can need you. */
export const HomeSignedIn: Story = {
  loaders: [
    () =>
      setStoryAccount({
        account: { email: "andrew@kestrel.dev", name: "Andrew Craswell", untilQuit: false },
        accounts: [{ email: "andrew@kestrel.dev", name: "Andrew Craswell", provider: "GoogleOAuth" }],
        attempt: null,
        ended: null
      })
  ],
  render: () => <Sample>{(projects) => <Home projects={projects} />}</Sample>
}

/**
 * A card flips through its project's screens as the pointer moves across its picture, naming each, and shows the first
 * again once the pointer leaves.
 */
export const CardFlipsThroughScreens: Story = {
  render: () => <Sample>{(projects) => <Home projects={projects} />}</Sample>,
  play: async ({ canvasElement }) => {
    const card = within(canvasElement).getByRole("button", { name: "cloud-console" }).closest("article")!
    const art = card.firstElementChild!

    const across = async (share: number) => {
      const box = art.getBoundingClientRect()
      await fireEvent.pointerMove(card, { clientX: box.left + box.width * share, clientY: box.top + box.height / 2 })
    }

    await userEvent.hover(card)
    await across(0.9)
    await expect(within(card).getByText("Pricing")).toBeInTheDocument()
    await across(0.5)
    await expect(within(card).getByText("Settings")).toBeInTheDocument()
    await userEvent.unhover(card)
    await expect(within(card).getByText("Dashboard")).toBeInTheDocument()
  }
}

/** Home's projects before their pictures are kept: each shows a placeholder in a color of its own until it's opened. */
export const HomeWithoutPictures: Story = {
  render: () => <Sample pictures={{}}>{(projects) => <Home projects={projects} />}</Sample>
}

/**
 * Home before any project has opened, where this copy of Parity has the example: Acme where Continue will be, the ways
 * to bring your own app beside it, and what each list will show.
 */
export const HomeFirstTime: Story = {
  render: () => (
    <Sample recent={[]} notes={{}} example>
      {(projects) => <Home projects={projects} />}
    </Sample>
  )
}

/** Home before any project has opened, without the example: what Parity does with your app, and how to open it. */
export const HomeFirstTimeWithoutExample: Story = {
  render: () => (
    <Sample recent={[]} notes={{}}>
      {(projects) => <Home projects={projects} />}
    </Sample>
  )
}

/**
 * Projects whose folders aren't there any more: moved, renamed, deleted, or on a drive that isn't plugged in. Each is
 * greyed and says so, Continue offers the next one, and opening one says where it was and offers to remove it.
 */
export const HomeMissingFolders: Story = {
  render: () => (
    <Sample missing={["D:\\apps\\kestrel-website", "D:\\apps\\walkies", "D:\\apps\\design-system"]}>
      {(projects) => <Home projects={projects} />}
    </Sample>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "walkies" }))
    await waitFor(() => expect(within(document.body).getByText("Parity can't find walkies")).toBeInTheDocument())
  }
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
    await expect(within(canvasElement).getByText("Nothing shared with you")).toBeInTheDocument()
  }
}

/** A project's menu: open it, star it, copy its link, or take it off the list. */
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
