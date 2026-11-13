import type { Meta, StoryObj } from "@storybook/react-vite"
import { opens, renderStyleSection, styled, styleStage } from "../../chrome/style-stories.tsx"

/** A layout's direction, alignment, gap and wrapping, or a grid's tracks. Values are steps of the spacing scale. */
const meta = {
  title: "Parity/Inspector/Sections/Layout",
  render: renderStyleSection("layout"),
  decorators: [styleStage]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** A vertical layout, Pricing's hero: children centered, and a gap. */
export const VerticalLayout: Story = { loaders: [styled("Pricing", "Hero")] }

/** A horizontal layout, Pricing's nav: space between its children. */
export const HorizontalLayout: Story = { loaders: [styled("Pricing", "Nav")] }

/** A grid, Pricing's three plans: its tracks, and a gap for columns and rows. */
export const GridLayout: Story = { loaders: [styled("Pricing", "Plans")] }

/** A horizontal layout that wraps: the wrap toggle on, and a gap for each axis. */
export const WrappingLayout: Story = {
  loaders: [styled("Pricing", "Nav links", { flexWrap: "wrap", rowGap: { step: 2 } })]
}

/** The gap's options open: the project's spacing tokens, with each one's size. */
export const PickingASpacing: Story = {
  loaders: [styled("Pricing", "Hero")],
  play: async ({ canvasElement }) => opens(canvasElement, "Gap options")
}
