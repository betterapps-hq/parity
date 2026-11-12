import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { DesignTab } from "./DesignPanel.tsx"
import { slowly } from "./inspector-stories.tsx"
import { filledInstance, inspectorStage, pick, renderInspector, renderPart, slotted } from "./layer-stories.tsx"

/**
 * A layout of a component design selected (PAR-83): Make slot beside Make component, the other thing a layer can
 * become, and once it's a slot, its name, which opens it in the component's Props. Each shows the part of the panel
 * it's about: the header Make slot is in, an instance's slots, or a slot's own panel (PAR-1022).
 */
const meta = {
  title: "Parity/Inspector/Layer/Slots",
  component: DesignTab,
  render: renderPart("header"),
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

/**
 * An instance of a component with slots, Pricing's Starter plan (PAR-84): after its params, each slot says what fills
 * it, `features` its one layer and `pricing` Empty, with a picture of what shows there on hover. Clicking one selects
 * it; × clears a filled one.
 */
export const InstanceSlots: Story = { loaders: [filledInstance()], render: renderPart("instance") }

/**
 * One of Starter plan's slots selected: its name, the instance it's in, a picture of what shows there, Clear, and that
 * a click in Components adds into it.
 */
export const SlotSelected: Story = {
  loaders: [filledInstance("slot")],
  // A selected slot has a panel of its own, which is the whole of what it shows.
  render: renderInspector,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("Click a component in Components to add it here.", undefined, slowly)
    ).toBeVisible()
  }
}
