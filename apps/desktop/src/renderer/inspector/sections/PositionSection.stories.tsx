import type { Meta, StoryObj } from "@storybook/react-vite"
import { renderStyleSection, styled, styleStage } from "../../chrome/style-stories.tsx"

/** Where a layer sits: in its layout, in a grid's cells, or placed absolutely with insets from each edge. */
const meta = {
  title: "Parity/Inspector/Sections/Position",
  render: renderStyleSection("placement"),
  decorators: [styleStage]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** A layer in a grid, the Pro plan: how many columns and rows it spans, instead of self alignment. */
export const InAGrid: Story = { loaders: [styled("Pricing", "Pro plan", { colSpan: 2 })] }

/** Placed absolutely in its layout: the insets from each edge. */
export const Absolute: Story = {
  loaders: [styled("Pricing", "Billing period", { position: "absolute", top: { step: 2 }, right: { step: 4 } })]
}

/** Insets off the scale on an absolutely placed layer, 3px from the top and 281px from the left. */
export const OffScaleInsets: Story = {
  loaders: [styled("Pricing", "Billing period", { position: "absolute", top: { step: 0.75 }, left: { step: 70.25 } })]
}
