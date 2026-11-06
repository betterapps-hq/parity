import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { DesignTab } from "./DesignPanel.tsx"
import { slowly } from "./inspector-stories.tsx"
import { inspectorStage, pick, renderInspector, slotted } from "./layer-stories.tsx"

/**
 * A layout of a component design selected (PAR-83): Make slot beside Make component, the other thing a layer can
 * become, and once it's a slot, its name, which opens it in the component's Props.
 */
const meta = {
  title: "Parity/Inspector/Layer/Slots",
  component: DesignTab,
  render: renderInspector,
  decorators: [inspectorStage]
} satisfies Meta<typeof DesignTab>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A layout in a component design, Plan card's features: clicking Make slot makes it a slot named after it, and the
 * button becomes the slot's name.
 */
export const LayoutInAComponent: Story = {
  loaders: [pick("Plan card", "Features")],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    await userEvent.click(await panel.findByRole("button", { name: "Make slot" }, slowly))
    await expect(
      await panel.findByRole("button", { name: "Edit the features slot in Plan card's props" }, slowly)
    ).toBeVisible()
  }
}

/**
 * A second slot: Plan card's features are already a slot, and Make slot on its price block makes another, named after
 * it, `priceBlock`. Each layout is at most one slot; the component lists them all in Props.
 */
export const SecondSlot: Story = {
  loaders: [slotted("Plan card", { Features: "features" }, "Price block")],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    await userEvent.click(await panel.findByRole("button", { name: "Make slot" }, slowly))
    await expect(
      await panel.findByRole("button", { name: "Edit the priceBlock slot in Plan card's props" }, slowly)
    ).toBeVisible()
  }
}

/** App top bar's actions as a slot: its name goes to it in App top bar's props, and × makes it a plain layout. */
export const SlotLayout: Story = {
  loaders: [slotted("App top bar", { "Top bar actions": "actions" }, "Top bar actions")]
}

/**
 * A layout inside a slot, one of Plan card's features: it's placeholder content, so Make slot is unavailable and says
 * why.
 */
export const LayoutInsideASlot: Story = { loaders: [slotted("Plan card", { Features: "features" }, "Feature 1")] }
