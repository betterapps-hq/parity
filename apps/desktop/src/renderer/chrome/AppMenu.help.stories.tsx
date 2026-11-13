import type { Meta } from "@storybook/react-vite"
import { expect, userEvent, waitFor } from "storybook/test"
import { AppWindow } from "../App.tsx"
import { body, menuStories, type MenuStory, openMenu, opened, openSubmenu } from "./app-menu-stories.tsx"
import type { AppMenu } from "./AppMenu.tsx"
import { exampleOpen } from "./chrome-fixtures.tsx"

/** Help: finding things, reporting a problem, upkeep under Developer, then updates and About. */
const meta = {
  title: "Parity/Chrome/App menu/Help",
  ...menuStories
} satisfies Meta<typeof AppMenu>

export default meta

/** Searching actions, the keyboard shortcuts, reporting a problem, the Developer submenu, updates and About. */
export const Default = opened("Help")

/** Developer: developer tools, performance stats, the bitmap cache and the Parity CLI. */
export const Developer = opened("Help", exampleOpen, async () => {
  await openSubmenu("Developer")
  await body().findByRole("menuitemcheckbox", { name: "Performance stats" })
})

/**
 * Developer > Install the Parity CLI on Windows, where the folder just joined PATH: a new terminal finds it (PAR-906).
 * The whole window, which shows the toast.
 */
export const InstallTheCli: MenuStory = {
  render: () => <AppWindow />,
  loaders: [exampleOpen],
  play: async () => {
    await openMenu("Help")
    await openSubmenu("Developer")
    await userEvent.click(body().getByRole("menuitem", { name: "Install the Parity CLI…" }))
    await body().findByText("Installed the Parity CLI")
    // The toast slides in, so its description shows once it has.
    await waitFor(() => expect(body().getByText("Open a new terminal to run it.")).toBeVisible())
  }
}
