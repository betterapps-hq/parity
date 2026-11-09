import type { ReviewTool } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { AppWindow } from "../../App.tsx"
import type { Tool } from "../../selection.ts"
import { clearNotifications, example, frameDesigns, openProjects, tooltip } from "../../stories/fixtures.tsx"
import { Window } from "../chrome-fixtures.tsx"
import { FloatingToolbar } from "./FloatingToolbar.tsx"

/**
 * The toolbar floating at the bottom of the canvas (PAR-780, PAR-795): what the pointer does, Frame, Text and Insert,
 * the review button, and Search actions, warping into a review tool's bar while one is picked. It needs the canvas, so
 * each story shows the whole window with designs framed.
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

/** Opens the example with a review tool picked, as its menu would. */
const reviewing = (tool: ReviewTool) => async () => {
  await openProjects("example")
  example().selection.startReviewing(tool)
}

/** Points at a control until its tooltip shows, moving away first, since a click hides the tooltip until then. */
async function pointAt(label: string): Promise<void> {
  const control = await body().findByRole("button", { name: label })
  await userEvent.unhover(control)
  await userEvent.hover(control)
  await waitFor(() => expect(tooltip()).toHaveTextContent(label))
}

const toolbar = (name: string) => body().findByRole("toolbar", { name })

/** The window as it opens: Move and select picked, with Frame in the layer blue and Text in text's green. */
export const SelectTool: Story = {
  loaders: [withTool("select")],
  play: () => frameDesigns("Pricing", "Dashboard")
}

/** The hand tool picked, for panning the canvas by dragging. It shares Move and select's button, which shows it. */
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
    await pointAt("Text")
  }
}

/** Annotating accessibility: the toolbar has warped into Accessibility's bar, its options as stamps. */
export const Annotating: Story = {
  loaders: [reviewing("accessibility")],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    await toolbar("Accessibility annotations")
  }
}

/** Commenting: the toolbar has warped into Comment's bar, which says what a click does. */
export const Commenting: Story = {
  loaders: [reviewing("comment")],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    await toolbar("Comments")
  }
}

/**
 * Picking a kind of annotation in the review menu warps the toolbar into its bar, with the canvas on Move and select so
 * a click can't add text underneath. Esc warps it back, onto the tool picked before.
 */
export const AnnotateAndBack: Story = {
  loaders: [withTool("text")],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    // Enter opens the menu, since user-event's simulated press doesn't open a menu inside the canvas's right-click
    // area, though a real click does, as `e2e/frames.e2e.ts` does with Frame's.
    const arrow = await body().findByRole("button", { name: "Comment or annotate" })
    arrow.focus()
    await userEvent.keyboard("{Enter}")
    await userEvent.click(await body().findByRole("menuitemradio", { name: "Behaviour" }))

    await toolbar("Behaviour annotations")
    await expect(example().selection.getTool()).toBe("select")

    await userEvent.keyboard("{Escape}")

    const home = await toolbar("Toolbar")
    await expect(example().selection.getTool()).toBe("text")
    // The review button keeps the kind.
    await expect(within(home).getByRole("button", { name: "Behaviour annotation" })).toBeInTheDocument()
  }
}

/** C comments, and Shift+T annotates in the kind picked last; picking another tool puts the review tool down. */
export const ReviewKeys: Story = {
  loaders: [withTool("select")],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")

    await userEvent.keyboard("c")
    await toolbar("Comments")

    await userEvent.keyboard("{Shift>}T{/Shift}")
    await toolbar("Behaviour annotations")

    await userEvent.keyboard("f")
    await toolbar("Toolbar")
    await expect(example().selection.getTool()).toBe("frame")
  }
}
