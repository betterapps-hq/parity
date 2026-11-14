import type { Meta, StoryObj } from "@storybook/react-vite"
import { openProjects, preferring } from "../stories/fixtures.tsx"
import { dialogStories, openOverExample } from "./chrome-fixtures.tsx"
import { setPreferences } from "./preferences.ts"
import { openSettings, SettingsDialog } from "./SettingsDialog.tsx"

/**
 * Settings, from File > Settings or Ctrl+,, over the window with a project open: the person's settings, and the
 * project's page with what its file sets. Settings view's stories show every page and state with data of their own.
 */
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
      setPreferences({ layoutGrid: true, exportSizes: [{ format: "png", scale: 3 }] })
    }
  ],
  play: async () => {
    await openOverExample("settings", "Settings")
  }
}

/** The project's page, with what the example project's file sets: nothing yet, and a menu to change a setting for it. */
export const ProjectPage: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      preferring({ theme: "dark", performanceStats: false })
    }
  ],
  play: async () => {
    openSettings("project")
    await openOverExample("settings", "Settings")
  }
}
