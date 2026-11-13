import type { Meta, StoryObj } from "@storybook/react-vite"
import { openProjects, preferring } from "../stories/fixtures.tsx"
import { dialogStories, openOverExample } from "./chrome-fixtures.tsx"
import { setPreferences } from "./preferences.ts"
import { SettingsDialog } from "./SettingsDialog.tsx"

/** Settings, from File > Settings or Ctrl+,, over the window. */
const meta = {
  title: "Parity/Chrome/Settings",
  component: SettingsDialog,
  ...dialogStories
} satisfies Meta<typeof SettingsDialog>

export default meta

type Story = StoryObj<typeof meta>

/** As they start: the dark theme, saving only when asked, snapping on, and exporting at 2x. */
export const AsTheyStart: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      preferring({ theme: "dark", performanceStats: false })
    }
  ],
  play: async () => {
    await openOverExample("settings", "Settings")
  }
}

/** Changed: the theme following the system, saving automatically, the layout grid on and 3x exports. */
export const Changed: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      preferring({ theme: "system", autosave: true, performanceStats: false })
      setPreferences({ layoutGrid: true, exportScale: 3 })
    }
  ],
  play: async () => {
    await openOverExample("settings", "Settings")
  }
}
