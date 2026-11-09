import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { AppWindow } from "../App.tsx"
import { clearNotifications, design, example, frameDesigns, openProjects, tooltip } from "../stories/fixtures.tsx"
import { Window } from "./chrome-fixtures.tsx"
import { ZoomControls } from "./ZoomControls.tsx"

/**
 * Zoom at the top right of the canvas (PAR-795): zoom out, the level, zoom in and zoom to fit. It reads the canvas, so
 * each story shows the whole window with designs framed.
 */
const meta = {
  title: "Parity/Chrome/Zoom controls",
  component: ZoomControls,
  render: () => <AppWindow />,
  decorators: [Window],
  loaders: [clearNotifications]
} satisfies Meta<typeof ZoomControls>

export default meta

type Story = StoryObj<typeof meta>

const body = () => within(document.body)

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
    const level = await body().findByRole("button", { name: /^Zoom to 100%, now \d+%$/ })
    await userEvent.click(level)
    await waitFor(() => expect(level).toHaveAccessibleName("Zoom to 100%, now 100%"))
    await userEvent.unhover(level)
    await userEvent.hover(level)
    await waitFor(() => expect(tooltip()).toHaveTextContent("Zoom to 100%"))
  }
}
