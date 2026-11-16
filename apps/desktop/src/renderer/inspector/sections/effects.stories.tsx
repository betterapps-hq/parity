import type { Meta, StoryObj } from "@storybook/react-vite"
import { renderStyleSection, styled, styleStage } from "../../chrome/style-stories.tsx"

/** A layer's effects: its shadows and filters. */
const meta = {
  title: "Parity/Inspector/Sections/Effects",
  render: renderStyleSection("effects"),
  decorators: [styleStage]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** Sign in's card with a large drop shadow from the project's tokens. */
export const Shadow: Story = {
  loaders: [styled("Sign in", "Sign in card", { boxShadow: [{ type: "drop", token: "shadow-lg" }] })]
}
