import type { Meta, StoryObj } from "@storybook/react-vite"
import { AppWindow } from "../App.tsx"
import { workspace } from "../workspace.ts"
import { frameDesigns, openProjects } from "./fixtures.tsx"

/** The whole window, as people see it: the tab bar, then the active project's panels, canvas and status bar. */
const meta = {
  title: "Parity/App",
  component: AppWindow,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-screen">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof AppWindow>

export default meta
type Story = StoryObj<typeof meta>

/** The shadcn example open: layers and assets on the left, its designs on the canvas, the inspector on the right. */
export const ExampleProject: Story = {
  loaders: [() => openProjects("example")],
  play: () => frameDesigns("Dashboard", "Pricing", "Sign in", "Settings")
}

/** Two projects in their own tabs; the second has no designs yet. */
export const TwoProjects: Story = { loaders: [() => openProjects("example", "empty")] }

/** A project with no `.par` file yet: an empty canvas, ready for its first design. */
export const BlankProject: Story = { loaders: [() => openProjects("empty")] }

/** While the project's builder starts and its components load. */
export const Opening: Story = { loaders: [() => openProjects("slow")] }

/** A project that couldn't be opened, with the service's reason. */
export const FailedToOpen: Story = { loaders: [() => openProjects("broken")] }

/** Every tab closed, after opening two projects: the ways to open one, and those two at the top of the recent ones. */
export const NoProjectOpen: Story = {
  loaders: [
    async () => {
      await openProjects("empty", "example")
      for (const tab of workspace.getTabs()) await workspace.close(tab.id)
    }
  ]
}

/** Every tab closed, with nothing opened before: just the ways to open a project. */
export const NothingOpenedYet: Story = {
  loaders: [
    async () => {
      await openProjects()
      workspace.forgetRecent()
    }
  ]
}
