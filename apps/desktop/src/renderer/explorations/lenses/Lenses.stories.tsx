import type { Meta, StoryObj } from "@storybook/react-vite"
import { openProjects, ProjectStage } from "../../stories/fixtures.tsx"
import { LensesPrototype } from "./workspace.tsx"

/**
 * One project per window, with its lenses down the window's left edge, as VS Code lists its views, laid out by Dockview
 * (PAR-1237). The lens bar picks what the canvas shows, as VS Code's activity bar picks its side bar's view. Each lens is
 * one of today's Layers groups made a canvas of its own: Pages for the app's routes, Screens for its designs,
 * Components, Stories, and Data for its database. The left panel, the inspector, the canvas, the status bar and the
 * menus are the app's own.
 *
 * - Click a lens, or press Ctrl and its number, to show it in the canvas in focus. Clicking the lens in focus hides or
 *   shows the left panel.
 * - Drag a lens from the lens bar, or a canvas by its title, onto a canvas's side to show the two side by side, or off
 *   the window to open it in a window of its own. The button at the title's end does the same in one click, and in that
 *   window takes it back.
 * - A link in the inspector shows its lens with it selected; Show beside, at the row's end, opens it in a canvas to the
 *   right.
 * - The project's name, in the middle of the title bar, opens another project in this one's place or closes it.
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
  args: { initial: { canvases: ["pages"], selected: { pages: "billing" } } }
}

/** Screens, with the asset tabs in the left panel. */
export const Screens: Story = {
  args: {
    initial: {
      canvases: ["screens"],
      selected: { screens: "billing-screen", pages: "billing", data: "subscriptions" }
    }
  }
}

/** Components on their boards, each state side by side. */
export const Components: Story = {
  args: { initial: { canvases: ["components"], selected: { components: "plan" } } }
}

/** Pages and Data side by side: Billing reads the plans and subscriptions tables. */
export const SideBySide: Story = {
  args: {
    initial: {
      canvases: ["pages", "data"],
      focused: 1,
      selected: { pages: "billing", data: "subscriptions" }
    }
  }
}
