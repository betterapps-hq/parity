import type { Meta, StoryObj } from "@storybook/react-vite"
import { group, lensWindow } from "./model.ts"
import { LensesPrototype } from "./workspace.tsx"

/**
 * A tab for each lens of the app, Pages, Components, Stories and Data, each with its own canvas, left panel and
 * selection, so opening a project draws only the lens shown. Lens tabs work as VS Code's editor tabs do:
 *
 * - Click a tab to show its lens. The left panel and the inspector follow the lens in focus.
 * - Drag a tab along its row to reorder it, onto another row to move it there, or onto the right of a canvas to split
 *   the window and see two lenses side by side.
 * - Drag a tab to the window's edge, or right-click it and choose Move to new window, to give it a window of its own:
 *   the story then shows two screens. In that window, Move to main window brings it back.
 * - + opens another lens the project has. One with no source, such as API without an OpenAPI document, can't be opened.
 * - A linked item in the inspector opens its lens with it selected: Billing uses PlanCard and reads the plans table.
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

/** The project open on Pages, with Billing selected and Components, Stories and Data a tab away. */
export const Pages: Story = {
  args: {
    initial: {
      windows: [lensWindow([group(["pages", "components", "stories", "data"])])],
      selected: { pages: "billing" }
    }
  }
}

/** Pages and Data side by side: Billing reads the plans table. */
export const SideBySide: Story = {
  args: {
    initial: {
      windows: [lensWindow([group(["pages", "components", "stories"]), group(["data"])])],
      selected: { pages: "billing", data: "plans" }
    }
  }
}

/** Data moved to a window of its own, on a second screen, beside the main window. */
export const OwnWindow: Story = {
  args: {
    initial: {
      windows: [lensWindow([group(["pages", "components", "stories"])]), lensWindow([group(["data"])])],
      selected: { pages: "profile", data: "users" }
    }
  }
}

/** Stories on their own canvas, PlanCard's Popular story selected. */
export const Stories: Story = {
  args: {
    initial: {
      windows: [lensWindow([group(["pages", "components", "stories", "data"], "stories")])],
      selected: { stories: "plan-popular" }
    }
  }
}
