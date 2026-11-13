import type { Meta } from "@storybook/react-vite"
import { within } from "storybook/test"
import { menuStories, opened, openSubmenu } from "./app-menu-stories.tsx"
import type { AppMenu } from "./AppMenu.tsx"
import { exampleOpen } from "./chrome-fixtures.tsx"

/** Help: finding things, reporting a problem, upkeep under Developer, then updates, the Parity CLI and About. */
const meta = {
  title: "Parity/Chrome/App menu/Help",
  ...menuStories
} satisfies Meta<typeof AppMenu>

export default meta

const body = () => within(document.body)

/** Searching actions, the keyboard shortcuts, reporting a problem, the Developer submenu, updates, the CLI and About. */
export const Default = opened("Help")

/** Developer: developer tools, performance stats, and the bitmap cache. */
export const Developer = opened("Help", exampleOpen, async () => {
  await openSubmenu("Developer")
  await body().findByRole("menuitemcheckbox", { name: "Performance stats" })
})
