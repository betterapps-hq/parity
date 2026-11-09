import type { Meta, StoryObj } from "@storybook/react-vite"
import { AppWindow } from "../../App.tsx"
import { Window } from "../../chrome/chrome-fixtures.tsx"
import { clearNotifications, frameDesigns, openProjects } from "../../stories/fixtures.tsx"
import { ToolbarComparison } from "./bars.tsx"
import { WarpStage } from "./warp.tsx"

/**
 * A refresh of the floating toolbar (PAR-780), not in the app yet. Bars has the chosen toolbar and zoom bar on their
 * own, and Warp tries the toolbar warping into an annotation kind's bar. Today is the app as it is, for comparison.
 */
const meta = {
  title: "Parity/Explorations/Toolbar",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** The whole window on the example, with Pricing and Dashboard framed and today's toolbar. */
export const Today: Story = {
  decorators: [Window],
  loaders: [clearNotifications, () => openProjects("example")],
  play: () => frameDesigns("Pricing", "Dashboard"),
  render: () => <AppWindow />
}

/**
 * Pick Accessibility in the review menu and the toolbar warps into Accessibility's own bar, its options as stamps from
 * the Accessibility annotations exploration. Done or Esc warps it back. The other kinds still show the bar above, until
 * they have options of their own.
 */
export const Warp: Story = {
  loaders: [() => openProjects("example")],
  render: () => <WarpStage />
}

/** The chosen toolbar and zoom bar on their own, and the bars a review tool shows. */
export const Bars: Story = {
  loaders: [() => openProjects("example")],
  render: () => <ToolbarComparison />
}
