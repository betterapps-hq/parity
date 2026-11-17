import type { Meta, StoryObj } from "@storybook/react-vite"
import { openProject, ProjectStage } from "../../stories/fixtures.tsx"
import { LensesPrototype } from "./prototype.tsx"

/**
 * One project per window, with its lenses down the window's left edge, as VS Code lists its views, and each lens open
 * as a tab over its canvas, as VS Code opens files, laid out by Dockview (PAR-1237). Each lens is one of today's Layers
 * groups made a canvas of its own: Pages for the app's routes, Screens for its designs, Components, Stories, and Data
 * for its database. The left panel, the inspector, the canvas, the status bar and the menus are the app's own.
 *
 * - Click a lens, or press Ctrl and its number, to show it in the tab in focus, as a link opens in its tab; a lens open
 *   in another tab or window is shown there. Clicking the lens in front hides or shows the left panel.
 * - Ctrl+click or middle-click a lens, or drag it onto a group's tabs or canvas, to open it in a new tab.
 * - Drag a tab: onto another group's tabs to join them, onto a canvas's side to split, or off the window to open it in a
 *   window of its own. The button at the end of the tabs does the same in one click, and in that window takes it back.
 * - Close every tab, with its button or a middle click, to leave the window empty.
 * - A link in the inspector shows its lens with it selected; Show beside, at the row's end, splits it right.
 * - The project's name, in the middle of the title bar, opens another project in this one's place or closes it.
 */
const meta = {
  title: "Parity/Explorations/Lenses",
  component: LensesPrototype,
  parameters: { layout: "fullscreen" },
  loaders: [() => openProject("example")],
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
  args: { initial: { groups: [["pages"]], selected: { pages: "billing" } } }
}

/** Pages, Screens and Data as tabs of one group, Screens in front with the asset tabs in the left panel. */
export const Tabs: Story = {
  args: {
    initial: {
      groups: [["screens", "pages", "data"]],
      selected: { screens: "billing-screen", pages: "billing", data: "subscriptions" }
    }
  }
}

/** Components on their boards, each state side by side. */
export const Components: Story = {
  args: { initial: { groups: [["components"]], selected: { components: "plan" } } }
}

/** Pages and Data side by side: Billing reads the plans and subscriptions tables. */
export const SideBySide: Story = {
  args: {
    initial: {
      groups: [["pages"], ["data"]],
      focused: 1,
      selected: { pages: "billing", data: "subscriptions" }
    }
  }
}

/** Every tab closed: the window is empty until a lens is shown. */
export const Empty: Story = {
  args: { initial: { groups: [], selected: {} } }
}
