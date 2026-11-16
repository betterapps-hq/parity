import type { Meta, StoryObj } from "@storybook/react-vite"
import { group, lensWindow } from "./model.ts"
import { LensesPrototype } from "./workspace.tsx"

/**
 * One project per window, with no project tabs: the project's name in the window's bar opens another in its place. The
 * app's lenses, Pages, Components, Stories and Data, are listed down the window's left edge, as VS Code lists its
 * views, each with its own canvas, left panel and selection, so opening a project draws only the lens shown.
 *
 * - Click a lens to show it. The left panel and the inspector follow the canvas in focus.
 * - Right-click a lens to split it to the right, or to move it to a window of its own: the story then shows two
 *   screens. In that window, Move to main window brings it back.
 * - Drag a lens onto a canvas to show it there, onto the right of one to split, or to the window's edge for a window of
 *   its own.
 * - A lens with nothing to read from, such as API without an OpenAPI document, is listed but can't be shown.
 * - A link in the inspector shows its lens with it selected, in place or to the side: Billing uses PlanCard and reads
 *   the plans table.
 *
 * The pictures are the example app's pages and components.
 */
const meta = {
  title: "Parity/Explorations/Lenses",
  component: LensesPrototype,
  parameters: { layout: "fullscreen" }
} satisfies Meta<typeof LensesPrototype>

export default meta

type Story = StoryObj<typeof meta>

/** The project on Pages, with Billing selected. */
export const Pages: Story = {
  args: { initial: { windows: [lensWindow([group("pages")])], selected: { pages: "billing" } } }
}

/** Pages and Data side by side: Billing reads the plans table. */
export const SideBySide: Story = {
  args: {
    initial: {
      windows: [lensWindow([group("pages"), group("data")])],
      selected: { pages: "billing", data: "plans" }
    }
  }
}

/** Data moved to a window of its own, on a second screen, beside the main window. */
export const OwnWindow: Story = {
  args: {
    initial: {
      windows: [lensWindow([group("pages")]), lensWindow([group("data")])],
      selected: { pages: "profile", data: "users" }
    }
  }
}

/** Stories on their own canvas, PlanCard's Popular story selected. */
export const Stories: Story = {
  args: { initial: { windows: [lensWindow([group("stories")])], selected: { stories: "plan-popular" } } }
}
