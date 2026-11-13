import type { Meta, StoryObj } from "@storybook/react-vite"
import { opens, renderStyleSection, styled, styleStage } from "../../chrome/style-stories.tsx"

/** A text layer's color, font, size, weight, spacing, alignment and decorations, or those of the text inside a layout. */
const meta = {
  title: "Parity/Inspector/Sections/Text",
  render: renderStyleSection("text"),
  decorators: [styleStage]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** A text layer, Pricing's headline: color, size, weight, letter spacing, centered, and its max lines. */
export const Text: Story = { loaders: [styled("Pricing", "Headline")] }

/** Text decorations: underlined and italic, in title case. */
export const TextDecorations: Story = {
  loaders: [styled("Sign in", "Create an account", { fontStyle: "italic", textTransform: "capitalize" })]
}

/** Text styles on a layout, Pricing's footer: they apply to the text inside, which says so. */
export const TextInside: Story = { loaders: [styled("Pricing", "Footer")] }

/** Styles a state changes, Stat card's label in Loading: each control with the change dot, and a reset. */
export const ChangedInAState: Story = {
  loaders: [styled("Stat card", "Label", { color: { token: "primary" }, fontWeight: { value: 700 } }, "loading")]
}

/** The weight list open on the headline. */
export const PickingAWeight: Story = {
  loaders: [styled("Pricing", "Headline")],
  play: async ({ canvasElement }) => opens(canvasElement, "Weight picker")
}
