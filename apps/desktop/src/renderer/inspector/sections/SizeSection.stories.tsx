import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { expectWhole, opens, renderStyleSection, styled, styleStage } from "../../chrome/style-stories.tsx"

/**
 * A layer's width and height, how each sizes (fixed, hug or fill) and its limits, with Spacing inside it as the box
 * around the layer. A length is any number of pixels, or a container size token.
 */
const meta = {
  title: "Parity/Inspector/Sections/Size",
  render: renderStyleSection("size"),
  decorators: [styleStage]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** A fixed size, Pricing's brand mark: 8 steps square. */
export const FixedSize: Story = { loaders: [styled("Pricing", "Brand mark")] }

/**
 * A 96 by 48 brand mark with the inspector at its narrowest, 260 pixels: Width and Height show 96 and 48 whole
 * (PAR-496).
 */
export const SizeAtNarrowest: Story = {
  parameters: { panelWidth: 260 },
  loaders: [styled("Pricing", "Brand mark", { width: { step: 24 }, height: { step: 12 } })],
  play: async ({ canvasElement }) => {
    await expectWhole(canvasElement, "Width", "96")
    await expectWhole(canvasElement, "Height", "48")
  }
}

/** A 1440 by 900 brand mark at the inspector's usual width: four digits fit whole (PAR-496). */
export const LargeSize: Story = {
  loaders: [styled("Pricing", "Brand mark", { width: { step: 360 }, height: { step: 225 } })],
  play: async ({ canvasElement }) => {
    await expectWhole(canvasElement, "Width", "1440")
    await expectWhole(canvasElement, "Height", "900")
  }
}

/** A button that fills its parent's width, Plan card's call to action. */
export const FillWidth: Story = { loaders: [styled("Plan card", "Call to action")] }

/** A separator that grows along its row, written the older way, shown and replaced as fill. */
export const GrowsAsFill: Story = { loaders: [styled("Sign in", "Separator")] }

/** Min and max limits set, Pricing's lede: the limits open by themselves, with a button to hide them. */
export const MinAndMax: Story = { loaders: [styled("Pricing", "Lede", { minWidth: { step: 80 } })] }

/** A length given as a token rather than a step: the container size names show in a code font. */
export const LengthTokens: Story = {
  loaders: [
    styled("Sign in", "Sign in card", { width: { token: "container-sm" }, maxWidth: { token: "container-md" } })
  ]
}

/** Width's sizing menu open: hug, fill, and limits to add. */
export const PickingASizing: Story = {
  loaders: [styled("Plan card", "Call to action")],
  play: async ({ canvasElement }) => opens(canvasElement, "Width sizing")
}

/**
 * A width off the spacing scale, the brand mark at 281px: kept as it is. A length can be any number of pixels; only
 * values `NodeStyle` holds as tokens, such as a font size, land on the nearest token.
 */
export const OffScaleSize: Story = {
  loaders: [styled("Pricing", "Brand mark", { width: { step: 70.25 }, height: { step: 12 } })],
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("textbox", { name: "Width" })).toHaveValue("281")
  }
}

/** 281 typed into Width stays 281px rather than landing on a step. */
export const TypingOffScale: Story = {
  loaders: [styled("Pricing", "Brand mark")],
  play: async ({ canvasElement }) => {
    const width = within(canvasElement).getByRole("textbox", { name: "Width" })
    await userEvent.clear(width)
    await userEvent.type(width, "281{Enter}")
    await expect(width).toHaveValue("281")
  }
}
