import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { DesignTab } from "./DesignPanel.tsx"
import { slowly } from "./inspector-stories.tsx"
import { inspectorStage, pick, renderInspector } from "./layer-stories.tsx"

/**
 * A component design's own layer whose text or visibility can use one of the component's props: the field is the prop's
 * name, which goes to it in Props, or the field with a button beside it to use a prop or make one from it.
 */
const meta = {
  title: "Parity/Inspector/Layer/Props",
  component: DesignTab,
  render: renderInspector,
  decorators: [inspectorStage]
} satisfies Meta<typeof DesignTab>

export default meta
type Story = StoryObj<typeof meta>

/** Plan card's price, which uses the `price` prop: its text field is the prop's name, with × to stop using it. */
export const TextUsingAProp: Story = { loaders: [pick("Plan card", "Price")] }

/** Plan card's Popular badge, shown only when `showPopular` is on: its Visible switch is the prop's name. */
export const VisibilityUsingAProp: Story = { loaders: [pick("Plan card", "Popular")] }

/**
 * Plan card's period, its own text: the button beside it offers the component's text props, and making a new one from
 * it, `period`, with "per user/month" as its default, so the card looks the same.
 */
export const MakingAPropFromText: Story = {
  loaders: [pick("Plan card", "Period")],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    const use = await panel.findByRole("button", { name: "Use a prop for this text" }, slowly)
    use.focus()
    await userEvent.keyboard("{Enter}")
    await userEvent.click(
      await within(document.body).findByRole("menuitem", { name: "New prop from this text" }, slowly)
    )
    await expect(
      await panel.findByRole("button", { name: "Uses the period prop. Go to it in Plan card's props" }, slowly)
    ).toBeVisible()
  }
}
