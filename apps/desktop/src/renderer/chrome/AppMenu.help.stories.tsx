import type { Meta } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { preferring } from "../stories/fixtures.tsx"
import { menuStories, opened, openSubmenu } from "./app-menu-stories.tsx"
import type { AppMenu } from "./AppMenu.tsx"
import { exampleOpen } from "./chrome-fixtures.tsx"
import { getPreferences } from "./preferences.ts"

/** Help: finding things, reporting a problem, upkeep under Developer, then updates, the Parity CLI and About. */
const meta = {
  title: "Parity/Chrome/Menus/App menu/Help",
  ...menuStories
} satisfies Meta<typeof AppMenu>

export default meta

const body = () => within(document.body)

/** Searching actions, the keyboard shortcuts, reporting a problem, the Developer submenu, updates, the CLI and About. */
export const Default = opened("Help")

/** Where an item's own icon sits, past the checkbox indicator a toggle hides. */
const icon = (item: HTMLElement) => item.querySelector(":scope > svg")!.getBoundingClientRect()

/**
 * Developer: developer tools, performance stats, and the bitmap cache. The performance stats' gauge lines up with the
 * icons beside it, at their size, and choosing it turns the stats on.
 */
export const Developer = opened(
  "Help",
  async () => {
    preferring({ performanceStats: false })
    await exampleOpen()
  },
  async () => {
    await openSubmenu("Developer")
    const stats = await body().findByRole("menuitemcheckbox", { name: "Performance stats" })
    const tools = body().getByRole("menuitem", { name: /Developer tools/ })
    await expect(icon(stats).left).toBeCloseTo(icon(tools).left, 0)
    await expect(icon(stats).width).toBeCloseTo(icon(tools).width, 0)
    await userEvent.click(stats)
    await expect(getPreferences().performanceStats).toBe(true)
  }
)
