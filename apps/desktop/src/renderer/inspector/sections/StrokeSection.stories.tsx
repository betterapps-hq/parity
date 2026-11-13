import type { Meta, StoryObj } from "@storybook/react-vite"
import { renderStyleSection, styled, styleStage } from "../../chrome/style-stories.tsx"

/** A layer's stroke: its color, width and style. */
const meta = {
  title: "Parity/Inspector/Sections/Stroke",
  render: renderStyleSection("stroke"),
  decorators: [styleStage]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** A stroke: its color, width and dashed style, and a button to remove it. */
export const Stroke: Story = {
  loaders: [
    styled("Sign in", "Sign in card", {
      borderColor: { token: "primary" },
      borderWidth: { step: 2 },
      borderStyle: "dashed"
    })
  ]
}
