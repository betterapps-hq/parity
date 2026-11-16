import type { Meta, StoryObj } from "@storybook/react-vite"
import { openProjects, ProjectStage } from "../../stories/fixtures.tsx"
import { group, lensWindow } from "./model.ts"
import { LensesPrototype } from "./workspace.tsx"

/**
 * One project per window, with its lenses down the window's left edge, as VS Code lists its views. Each lens is one of
 * today's Layers groups made a canvas of its own: Pages for the app's routes, Screens for its designs, Components,
 * Stories, and Data for its database. The left panel, the inspector, the canvas's colors, titles and floating bars,
 * the status bar and the menus are the app's own; the asset tabs, Modes and the status bar show the example project.
 *
 * - Click a lens, or press Ctrl and its number. Clicking the lens already shown hides or shows the left panel.
 * - Each canvas has a tab with its lens's name. The button at its end moves the lens to a window of its own, and back;
 *   dragging the tab off the window, onto the desktop around it, does the same, as a browser's tab does. The story then
 *   shows a screen for each window. Drop a tab or a lens on a canvas to show it there, or on its right side, beside it.
 * - A link in the inspector shows its lens with it selected; Show beside, at the row's end, splits it right.
 * - The wheel pans each canvas and Ctrl with the wheel zooms; each lens keeps its own view and selection.
 * - The project's name, in the middle of the title bar, opens another project in this one's place or closes it, which
 *   leaves the window on Home.
 */
const meta = {
  title: "Parity/Explorations/Lenses",
  component: LensesPrototype,
  parameters: { layout: "fullscreen" },
  loaders: [() => openProjects("example")],
  decorators: [
    (Story) => (
      <ProjectStage project="example" className="block">
        <Story />
      </ProjectStage>
    )
  ]
} satisfies Meta<typeof LensesPrototype>

export default meta

type Story = StoryObj<typeof meta>

/** The project on Pages, Billing selected: its route, and what it's linked to in the other lenses. */
export const Pages: Story = {
  args: { initial: { windows: [lensWindow([group("pages")])], selected: { pages: "billing" } } }
}

/** Screens, today's designs, each in the project's modes, with the asset tabs in the left panel. */
export const Screens: Story = {
  args: { initial: { windows: [lensWindow([group("screens")])], selected: { screens: "billing-screen" } } }
}

/** Components on their boards, each state side by side. */
export const Components: Story = {
  args: { initial: { windows: [lensWindow([group("components")])], selected: { components: "plan" } } }
}

/** Pages and Data side by side: Billing reads the plans and subscriptions tables. */
export const SideBySide: Story = {
  args: {
    initial: {
      windows: [lensWindow([group("pages"), group("data")], 1)],
      selected: { pages: "billing", data: "subscriptions" }
    }
  }
}

/** Data moved to a window of its own, on a second display, beside the main window. */
export const OwnWindow: Story = {
  args: {
    initial: {
      windows: [lensWindow([group("pages")]), lensWindow([group("data")])],
      selected: { pages: "profile", data: "users" }
    }
  }
}
