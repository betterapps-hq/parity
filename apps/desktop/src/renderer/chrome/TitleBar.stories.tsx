import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import {
  blankProjectAt,
  clearNotifications,
  example,
  never,
  openInTurn,
  openProject,
  tooltip
} from "../stories/fixtures.tsx"
import { answering } from "../stories/host.ts"
import { workspace } from "../workspace.ts"
import { Chrome, renameDesign } from "./chrome-fixtures.tsx"
import { TitleBar } from "./TitleBar.tsx"

/**
 * The window's title bar: the app's menus, the open project's name in the middle, which opens the project's menu, and
 * your account at the end. Shown on its own, above an empty window.
 */
const meta = {
  title: "Parity/Chrome/Window/Title bar",
  component: TitleBar,
  decorators: [Chrome],
  loaders: [clearNotifications]
} satisfies Meta<typeof TitleBar>

export default meta

type Story = StoryObj<typeof meta>

const body = () => within(document.body)

/** Projects opened before the example, for its menu's Recent list. */
const recent = ["marketing-site", "admin-console", "design-system"].map((name) => `D:/projects/${name}`)

/** The example open: its name in the middle. */
export const OneProject: Story = { loaders: [() => openProject("example")] }

/** The project's menu: Open project folder, the projects opened before, most recent first, and Close project. */
export const ProjectMenu: Story = {
  loaders: [
    async () => {
      await openProject()
      workspace.forgetRecent()
      await openInTurn(...recent.map(blankProjectAt))
      await openProject("example")
    }
  ],
  play: async () => {
    await userEvent.click(body().getByRole("button", { name: "shadcn-vite" }))
    const menu = await body().findByRole("menu")
    const items = within(menu).getAllByRole("menuitem")
    await expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Open project folder…"),
      expect.stringContaining("design-system"),
      expect.stringContaining("admin-console"),
      expect.stringContaining("marketing-site"),
      expect.stringContaining("Close project")
    ])
  }
}

/** A project still opening while its builder starts: its folder's name. */
export const Opening: Story = { loaders: [() => openProject("slow")] }

/** How the window starts with the default project opening before the service has said which it is. */
export const StartingUp: Story = {
  loaders: [
    async () => {
      await openProject()
      answering({ "project.open": (params, usual) => (params.root ? usual() : never()) })
      void workspace.open(undefined)
    }
  ]
}

/** A project that couldn't be opened. Pointing at its name says why. */
export const FailedToOpen: Story = { loaders: [() => openProject("broken")] }

/** The project with unsaved changes: a dot after its name, which its hint and accessible name say too. */
export const UnsavedChanges: Story = {
  loaders: [
    async () => {
      await openProject("example")
      renameDesign("Pricing", "Pricing (annual)")
    }
  ],
  play: async () => {
    await userEvent.hover(await body().findByRole("button", { name: "shadcn-vite, unsaved changes" }))
    await waitFor(() => expect(tooltip()).toHaveTextContent("Unsaved changes"))
    await expect(example().saver.hasUnsaved()).toBe(true)
  }
}

/** A project whose folder name is long: the name is cut short, and its hint has the full path. */
export const LongName: Story = {
  loaders: [
    async () => {
      await openProject()
      await openInTurn(blankProjectAt("D:/clients/northwind/customer-onboarding-and-billing-portal-redesign-2026"))
    }
  ]
}

/** On Home, with no project open: the menus and your account. */
export const OnHome: Story = { loaders: [() => openProject()] }
