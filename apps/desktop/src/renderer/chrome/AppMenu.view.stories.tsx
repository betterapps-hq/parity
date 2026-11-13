import type { Meta } from "@storybook/react-vite"
import { preferring } from "../stories/fixtures.tsx"
import { menuStories, opened, pricing, selecting } from "./app-menu-stories.tsx"
import type { AppMenu } from "./AppMenu.tsx"
import { setLayout } from "./layout.ts"
import { setPreferences } from "./preferences.ts"

/** View: Home, zoom, moving between designs, and what the window shows. */
const meta = {
  title: "Parity/Chrome/App menu/View",
  ...menuStories
} satisfies Meta<typeof AppMenu>

export default meta

/** With a design selected: panels shown, snapping on, and the layout grid off. */
export const DesignSelected = opened("View", async () => {
  await selecting(pricing)()
  preferring({ performanceStats: false })
})

/** With the panels hidden, snapping off, and the layout grid on. */
export const PanelsHidden = opened("View", async () => {
  await selecting(pricing)()
  setLayout({ left: false, right: false })
  setPreferences({ snapping: false, layoutGrid: true })
})
