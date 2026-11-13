import type { Meta } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { AppWindow } from "../App.tsx"
import { blankProjectAt, frameDesigns, openAlso, openProjects } from "../stories/fixtures.tsx"
import { pickingWith } from "../stories/host.ts"
import { workspace } from "../workspace.ts"
import {
  menuItems,
  menuStories,
  type MenuStory,
  openMenu,
  opened,
  openSubmenu,
  pricing,
  selecting,
  unavailable
} from "./app-menu-stories.tsx"
import type { AppMenu } from "./AppMenu.tsx"
import { formatKeys } from "./keys.ts"

/** File: a new tab, opening projects, saving, exporting, Settings, closing the tab and exiting. */
const meta = {
  title: "Parity/Chrome/App menu/File",
  ...menuStories
} satisfies Meta<typeof AppMenu>

export default meta

const body = () => within(document.body)

/** With a design selected. New screen and New component are Object's, not File's. */
export const DesignSelected = opened("File", selecting(pricing), async () => {
  await expect(menuItems()[0]).toHaveTextContent(`New tab${formatKeys("Ctrl T")}`)
  await expect(unavailable(["New screen", "Settings"])).toEqual({ "New screen": undefined, Settings: false })
})

/** With nothing selected: every design can be exported, but not a selected one. */
export const NothingSelected = opened("File")

/** With every project closed: saving, exporting and closing a tab are unavailable. */
export const NoProject = opened("File", () => openProjects())

/** Open recent: the open project first, then the others, most recent first; long paths are cut short. */
export const OpenRecent: MenuStory = {
  loaders: [
    async () => {
      await openProjects()
      workspace.forgetRecent()
      await openAlso(
        ...[
          "D:/clients/northwind/customer-onboarding-and-billing-portal-redesign-2026",
          "D:/projects/admin-console",
          "C:/Users/sam/Documents/side-projects/recipe-box",
          "D:/projects/marketing-site"
        ].map(blankProjectAt)
      )
      await openProjects("example")
    }
  ],
  play: async () => {
    await openMenu("File")
    await openSubmenu("Open recent")
  }
}

/** Open recent before any project was opened. */
export const OpenRecentEmpty: MenuStory = {
  loaders: [
    async () => {
      await openProjects()
      workspace.forgetRecent()
    }
  ],
  play: async () => {
    await openMenu("File")
    await openSubmenu("Open recent")
  }
}

/**
 * Export selected runs what Ctrl+Shift+E runs (PAR-976): both export the selected design at the Export section's
 * sizes, so both ask for the folder that export asks for. The whole window, whose keys Ctrl+Shift+E needs.
 */
export const ExportSelectedAsItsShortcutDoes: MenuStory = {
  render: () => <AppWindow />,
  loaders: [selecting(pricing)],
  play: async () => {
    const asked: (string | undefined)[] = []
    pickingWith({
      pickFolder: (title) => {
        asked.push(title)

        return Promise.resolve(undefined)
      }
    })
    await frameDesigns("Pricing")
    await openMenu("File")
    await userEvent.click(body().getByRole("menuitem", { name: /^Export selected…/ }))
    await waitFor(() => expect(asked).toEqual(["Export to"]))
    await userEvent.keyboard("{Control>}{Shift>}E{/Shift}{/Control}")
    await waitFor(() => expect(asked).toEqual(["Export to", "Export to"]))
  }
}
