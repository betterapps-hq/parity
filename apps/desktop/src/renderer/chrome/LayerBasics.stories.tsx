import { mapNode } from "@parity-app/core"
import { layersSelection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { userEvent, within } from "storybook/test"
import { design, example, node } from "../stories/fixtures.tsx"
import { DesignTab } from "./DesignPanel.tsx"
import { inspecting, slowly, typing } from "./inspector-stories.tsx"
import { inspectorStage, pick, renderInspector } from "./layer-stories.tsx"

/** What every layer's panel has at its head: its name, Make component, and whether it shows, or that it's gone. */
const meta = {
  title: "Parity/Inspector/Layer/Basics",
  component: DesignTab,
  render: renderInspector,
  decorators: [inspectorStage]
} satisfies Meta<typeof DesignTab>

export default meta

type Story = StoryObj<typeof meta>

/** The design's outermost layer: everything a layout has, but no Make component, since it's the design itself. */
export const OutermostLayer: Story = { loaders: [pick("Pricing", "Page")] }

/** A layer without a name of its own: the name field shows what Layers calls it, as a placeholder. */
export const UnnamedLayer: Story = { loaders: [pick("Pricing", "Badge")] }

/** A layer with a very long name. */
export const LongLayerName: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Pricing")
      const id = node("Pricing", "Billing period")
      example().store.updateContainer(key, "Rename layer", (container) => ({
        ...container,
        root: mapNode(container.root, id, (current) => ({
          ...current,
          name: "Billing period switch with the yearly discount badge beside it"
        }))
      }))

      return layersSelection(key, [id])
    })
  ]
}

/** A layer hidden in the base design, Sign in's error alert: the Visible switch is off. */
export const HiddenLayer: Story = { loaders: [pick("Sign in", "Sign in error")] }

/** Make component clicked: a field for the new component's name, ready to type in. */
export const NamingAComponent: Story = {
  loaders: [pick("Pricing", "Billing period")],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    await userEvent.click(panel.getByRole("button", { name: "Make component" }))
    await userEvent.type(
      await panel.findByPlaceholderText("Component name", undefined, slowly),
      "Billing switch",
      typing
    )
  }
}

/** The selected layer was deleted, by an agent or another window: the panel says it no longer exists. */
export const LayerGone: Story = {
  loaders: [inspecting("design", () => layersSelection(design("Pricing"), ["deleted-layer"]))]
}
