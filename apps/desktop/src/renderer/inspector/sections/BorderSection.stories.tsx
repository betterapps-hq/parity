import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { slowly } from "../../chrome/inspector-stories.tsx"
import { renderStyleSection, styled, styleStage } from "../../chrome/style-stories.tsx"

/** A layer's border (PAR-932): its width, one or each side's, its style and its color. */
const meta = {
  title: "Parity/Inspector/Sections/Border",
  render: renderStyleSection("border"),
  decorators: [styleStage]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** A 2px dashed border in the primary color, and − to take it off. */
export const Border: Story = {
  loaders: [
    styled("Sign in", "Sign in card", {
      borderColor: { token: "primary" },
      borderWidth: { step: 2 },
      borderStyle: "dashed"
    })
  ]
}

/** A divider: a border along the bottom alone, so Width opens on each side. */
export const BottomOnly: Story = {
  name: "Bottom only",
  loaders: [
    styled("Sign in", "Sign in card", {
      borderColor: { token: "border" },
      borderWidth: [{ step: 0 }, { step: 0 }, { step: 1 }, { step: 0 }]
    })
  ],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    await expect(await panel.findByRole("textbox", { name: "Bottom width" }, slowly)).toBeVisible()
  }
}

/** No border yet: Border is a title with +, which adds the project's usual one. */
export const Empty: Story = {
  loaders: [styled("Sign in", "Sign in card", {})],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    await userEvent.click(await panel.findByRole("button", { name: "Add border" }, slowly))
    await expect(await panel.findByRole("combobox", { name: "Border style" }, slowly)).toBeVisible()
  }
}
