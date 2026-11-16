import type { Meta, StoryObj } from "@storybook/react-vite"
import { renderStyleSection, styled, styleStage } from "../../chrome/style-stories.tsx"

/** How a layer looks apart from its paint: its radius, opacity and clipping. */
const meta = {
  title: "Parity/Inspector/Sections/Appearance",
  render: renderStyleSection("appearance"),
  decorators: [styleStage]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** Sign in's card with a radius token, 80% opacity and its overflow clipped. */
export const Appearance: Story = {
  loaders: [
    styled("Sign in", "Sign in card", {
      borderRadius: { token: "radius-2xl" },
      opacity: { step: 80 },
      overflow: "hidden"
    })
  ]
}
