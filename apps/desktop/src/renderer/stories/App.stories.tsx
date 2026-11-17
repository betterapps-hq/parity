import type { Meta, StoryObj } from "@storybook/react-vite"
import { AppWindow } from "../App.tsx"
import { workspace } from "../workspace.ts"
import { frameDesigns, openProject } from "./fixtures.tsx"

/** The whole window, as people see it: the title bar, then the project's panels, canvas and status bar, or Home. */
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
  loaders: [() => openProject("example")],
  play: () => frameDesigns("Dashboard", "Pricing", "Sign in", "Settings")
}

/** A project with no `.par` file yet: it opens on a Home screen drawing the app's `App`, on desktop and mobile. */
export const BlankProject: Story = { loaders: [() => openProject("empty")] }

/** While the project's builder starts and its components load. */
export const Opening: Story = { loaders: [() => openProject("slow")] }

/** A project that couldn't be opened, with the service's reason. */
export const FailedToOpen: Story = { loaders: [() => openProject("broken")] }

/** The project closed, after opening two in turn: Home offers the last one to continue, and lists the other. */
export const NoProjectOpen: Story = {
  loaders: [
    async () => {
      await openProject("empty")
      await openProject("example")
      await workspace.close()
    }
  ]
}

/** Nothing opened before: Home with the ways to open a project. */
export const NothingOpenedYet: Story = {
  loaders: [
    async () => {
      await openProject()
      workspace.forgetRecent()
    }
  ]
}
