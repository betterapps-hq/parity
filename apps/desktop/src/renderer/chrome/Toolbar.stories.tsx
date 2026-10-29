import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { AppWindow } from "../App.tsx"
import type { Tool } from "../selection.ts"
import { clearNotifications, design, example, frameDesigns, openProjects } from "../stories/fixtures.tsx"
import { renameDesign, Window } from "./chrome-fixtures.tsx"
import { FloatingToolbar } from "./Toolbar.tsx"

/**
 * The controls floating on the canvas: the tools at the bottom, and history and zoom at the top right. They need the
 * canvas, so each story shows the whole window with designs framed.
 */
const meta = {
  title: "Parity/Chrome/Toolbar",
  component: FloatingToolbar,
  render: () => <AppWindow />,
  decorators: [Window],
  loaders: [clearNotifications]
} satisfies Meta<typeof FloatingToolbar>

export default meta
type Story = StoryObj<typeof meta>

const body = () => within(document.body)

/** Opens the example with a tool picked, as its shortcut would. */
const withTool = (tool: Tool) => async () => {
  await openProjects("example")
  example().selection.setTool(tool)
}

/** Points at a control until its tooltip shows, moving away first, since a click hides the tooltip until then. */
async function pointAt(label: string, role: "button" | "radio" = "button"): Promise<void> {
  const control = await body().findByRole(role, { name: label })
  await userEvent.unhover(control)
  await userEvent.hover(control)
  await waitFor(() => expect(body().getByRole("tooltip")).toHaveTextContent(label))
}

/**
 * The window as it opens: the move and select tool picked, nothing to undo or redo yet, and the zoom level the designs
 * were framed at.
 */
export const SelectTool: Story = {
  loaders: [withTool("select")],
  play: () => frameDesigns("Pricing", "Dashboard")
}

/** The hand tool picked, for panning the canvas by dragging. */
export const HandTool: Story = {
  loaders: [withTool("hand")],
  play: () => frameDesigns("Pricing", "Dashboard")
}

/** The text tool picked, for clicking on the canvas to add a note; the pointer becomes a text cursor over it. */
export const TextTool: Story = {
  loaders: [withTool("text")],
  play: () => frameDesigns("Pricing", "Dashboard")
}

/** The interact tool picked, which hands the pointer to the designs' real components to try them. */
export const InteractTool: Story = {
  loaders: [withTool("interact")],
  play: () => frameDesigns("Pricing", "Dashboard")
}

/** A tool's tooltip, with its shortcut, as when pointing at it. */
export const ToolTooltip: Story = {
  loaders: [withTool("select")],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    await pointAt("Hand", "radio")
  }
}

/** Zoomed out to fit every design: the zoom level is small and the designs tiny. */
export const ZoomedToFit: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    await frameDesigns("Pricing")
    const editor = example().editor!
    const framed = editor.getZoomLevel()
    editor.zoomToFit()
    await waitFor(() => expect(editor.getZoomLevel()).toBeLessThan(framed))
  }
}

/** At 100% after clicking the zoom level, which resets it; its tooltip says so. */
export const ActualSize: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      example().selection.set({ design: design("Sign in") })
    }
  ],
  play: async () => {
    await frameDesigns("Sign in")
    await userEvent.click(await body().findByRole("button", { name: /^\d+%$/ }))
    await waitFor(() => expect(body().getByRole("button", { name: "100%" })).toBeVisible())
    await pointAt("100%")
  }
}

/** After renaming a design: Undo is available and its tooltip names the rename; Redo still isn't. */
export const AfterAnEdit: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      renameDesign("Pricing", "Pricing (annual)")
    }
  ],
  play: async () => {
    await frameDesigns("Pricing (annual)", "Dashboard")
    await pointAt("Undo rename design")
  }
}

/** After renaming a design and undoing it: Redo is available and its tooltip names the rename; Undo isn't. */
export const AfterUndo: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      renameDesign("Pricing", "Pricing (annual)")
      example().store.undo()
    }
  ],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    await pointAt("Redo rename design")
  }
}
