import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import {
  blankProjectAt,
  clearNotifications,
  example,
  never,
  openAlso,
  openProjects,
  sessionAt
} from "../stories/fixtures.tsx"
import { answering, roots } from "../stories/host.ts"
import { workspace } from "../workspace.ts"
import { addNote, Chrome, renameDesign } from "./chrome-fixtures.tsx"
import { TabBar } from "./TabBar.tsx"

/**
 * The window's title bar: the app's menus, then a tab for each open project, then the button that opens another.
 * Shown on its own, above an empty window.
 */
const meta = {
  title: "Parity/Chrome/Tab bar",
  component: TabBar,
  decorators: [Chrome],
  loaders: [clearNotifications]
} satisfies Meta<typeof TabBar>

export default meta
type Story = StoryObj<typeof meta>

/** Folders of made-up projects, for stories with more tabs than the stand-in service knows. */
const folders = [
  "marketing-site",
  "admin-console",
  "design-system",
  "mobile-web",
  "docs-portal",
  "checkout-flow",
  "analytics-dashboard",
  "onboarding",
  "billing-portal",
  "support-center",
  "partner-portal",
  "careers-site",
  "status-page"
].map((name) => `D:/projects/${name}`)

/** One project open, its tab selected with its close button showing. */
export const OneProject: Story = { loaders: [() => openProjects("example")] }

/** Four projects open: the first selected, the others muted with their close buttons hidden until hovered or focused. */
export const SeveralProjects: Story = {
  loaders: [
    async () => {
      await openProjects("example", "empty")
      await openAlso(blankProjectAt(folders[0]!), blankProjectAt(folders[1]!))
    }
  ]
}

/** A project still opening while its builder starts, selected: a spinner before its folder's name. */
export const Opening: Story = {
  loaders: [
    async () => {
      await openProjects("example", "slow")
      workspace.activate(roots.slow)
    }
  ]
}

/**
 * How the window starts with nothing to restore: the default project opening before the service has said which it
 * is, so its tab has no name yet.
 */
export const StartingUp: Story = {
  loaders: [
    async () => {
      await openProjects()
      answering({ "project.open": (params, usual) => (params.root ? usual() : never()) })
      void workspace.open(undefined)
    }
  ]
}

/** A project that couldn't be opened, selected: a warning before its name. Hovering the tab shows why. */
export const FailedToOpen: Story = {
  loaders: [
    async () => {
      await openProjects("example", "broken")
      workspace.activate(roots.broken)
    }
  ]
}

/**
 * Two projects with unsaved changes, the selected one and one behind it: each shows a dot where its close button
 * would be, which turns back into the close button on hover.
 */
export const UnsavedChanges: Story = {
  loaders: [
    async () => {
      await openProjects("example", "empty")
      await openAlso(blankProjectAt(folders[0]!))
      renameDesign("Pricing", "Pricing (annual)")
      addNote(sessionAt(folders[0]!), "Hero copy needs a final pass")
    }
  ],
  play: async () => {
    const tabs = within(document.body)
    await expect(
      await tabs.findByRole("button", { name: /^Close shadcn-vite, which has unsaved changes/ })
    ).toBeVisible()
    await expect(example().store.hasUnsaved()).toBe(true)
  }
}

/** A project whose folder name is longer than a tab: the name is cut short, and the tab's tooltip has the full path. */
export const LongName: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      await openAlso(blankProjectAt("D:/clients/northwind/customer-onboarding-and-billing-portal-redesign-2026"))
      workspace.activate("D:/clients/northwind/customer-onboarding-and-billing-portal-redesign-2026")
    }
  ]
}

/**
 * More projects than fit the window: fourteen tabs shrink to a minimum width, then scroll sideways, with the last,
 * selected one scrolled into view. The wheel scrolls them too.
 */
export const ManyProjects: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      await openAlso(...folders.map(blankProjectAt))
      workspace.activate(folders.at(-1))
    }
  ]
}

/** Every project closed: just the menus and the button that opens one. */
export const NoProjects: Story = { loaders: [() => openProjects()] }

/** The open project button's tooltip, with its shortcut, as when pointing at it. */
export const OpenProjectTooltip: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    const body = within(document.body)
    await userEvent.hover(body.getByRole("button", { name: "Open project" }))
    await waitFor(() => expect(body.getByRole("tooltip")).toHaveTextContent("Open project"))
  }
}
