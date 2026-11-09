import type { Meta, StoryObj } from "@storybook/react-vite"
import { Window } from "../../chrome/chrome-fixtures.tsx"
import { clearNotifications, frameDesigns, openProjects } from "../../stories/fixtures.tsx"
import { ToolbarComparison } from "./bars.tsx"
import { ToolbarStage } from "./stage.tsx"

/**
 * A refresh of the floating toolbar (PAR-780), not in the app yet. Bars has the chosen toolbar and zoom bar on their
 * own; Warp tries them on the real canvas, beside Today.
 */
const meta = {
  title: "Parity/Explorations/Toolbar",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** The whole window on the example, with Pricing and Dashboard framed. */
const onCanvas = {
  decorators: [Window],
  loaders: [clearNotifications, () => openProjects("example")],
  play: () => frameDesigns("Pricing", "Dashboard")
} satisfies Story

/** The toolbar as the app has it, for comparison. */
export const Today: Story = {
  ...onCanvas,
  render: () => <ToolbarStage />
}

/**
 * The chosen toolbar on the real canvas, with an experiment: pick Accessibility in the review menu and the toolbar warps into Accessibility's own bar,
 * its options as stamps, from the Accessibility annotations exploration. Done or Esc warps it back. The other kinds
 * still show the bar above, until PAR-184 gives them options of their own.
 */
export const Warp: Story = {
  ...onCanvas,
  render: () => <ToolbarStage warp />
}

/** The chosen toolbar and zoom bar on their own, and the bars a review tool shows. */
export const Bars: Story = {
  loaders: [() => openProjects("example")],
  render: () => <ToolbarComparison />
}
