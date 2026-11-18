import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { slowly } from "../../chrome/inspector-stories.tsx"
import { renderStyleSection, styled, styleStage } from "../../chrome/style-stories.tsx"

/** A layer's outline (PAR-1308): its width, style, color and offset. */
const meta = {
  title: "Parity/Inspector/Sections/Outline",
  render: renderStyleSection("outline"),
  decorators: [styleStage]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** A focus ring: 2px in the ring color, 2px out from the edge. */
export const FocusRing: Story = {
  name: "Focus ring",
  loaders: [
    styled("Sign in", "Sign in card", {
      outlineColor: { token: "ring" },
      outlineWidth: { step: 2 },
      outlineOffset: { step: 2 }
    })
  ]
}

/** No outline yet: Outline is a title with +, which adds a 2px one. */
export const Empty: Story = {
  loaders: [styled("Sign in", "Sign in card", {})],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    await userEvent.click(await panel.findByRole("button", { name: "Add outline" }, slowly))
    await expect(await panel.findByRole("textbox", { name: "Outline offset" }, slowly)).toBeVisible()
  }
}
