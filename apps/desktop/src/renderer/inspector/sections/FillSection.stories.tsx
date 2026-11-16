import type { Meta, StoryObj } from "@storybook/react-vite"
import { opens, renderStyleSection, styled, styleStage } from "../../chrome/style-stories.tsx"

/** A layer's fills, each a color from the project's tokens, a gradient or an image. */
const meta = {
  title: "Parity/Inspector/Sections/Fill",
  render: renderStyleSection("fill"),
  decorators: [styleStage]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** Pricing's brand mark, filled with the primary color. */
export const Fill: Story = { loaders: [styled("Pricing", "Brand mark")] }

/** Sign in's card, filled with the card token. */
export const TokenFill: Story = {
  loaders: [styled("Sign in", "Sign in card", { fills: [{ type: "solid", color: { token: "card" } }] })]
}

/** The fill picker open: the project's colors with swatches, searchable, and None. */
export const PickingAColor: Story = {
  loaders: [styled("Pricing", "Brand mark")],
  play: async ({ canvasElement }) => opens(canvasElement, "Fill 1 picker")
}
