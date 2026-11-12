import { mapNode } from "@parity-app/core"
import { layersSelection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { design, example, node } from "../stories/fixtures.tsx"
import { DesignTab } from "./DesignPanel.tsx"
import { inspecting } from "./inspector-stories.tsx"
import { inspectorStage, pick, renderInspector } from "./layer-stories.tsx"

/** An instance of a component design selected: each of its params. It always shows its component's base state. */
const meta = {
  title: "Parity/Inspector/Layer/Instances",
  component: DesignTab,
  render: renderInspector,
  decorators: [inspectorStage]
} satisfies Meta<typeof DesignTab>

export default meta

type Story = StoryObj<typeof meta>

/** An instance of a component design, Pricing's Pro plan: each of Plan card's params, and no State row (PAR-1002). */
export const InstanceLayer: Story = { loaders: [pick("Pricing", "Pro plan")] }

/** An instance whose component design was deleted: the panel says it doesn't exist. */
export const InstanceOfMissingComponent: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Pricing")
      const id = node("Pricing", "Business plan")
      example().store.updateContainer(key, "Break instance", (container) => ({
        ...container,
        root: mapNode(container.root, id, (current) =>
          current.type === "instance" ? { ...current, design: "enterprise-plan-card" } : current
        )
      }))

      return layersSelection(key, [id])
    })
  ]
}

/**
 * A layer inside an instance, the value in Dashboard's Users card: it belongs to Stat card, so its edits change only this
 * copy, and Edit in Stat card opens the component.
 */
export const LayerInsideAnInstance: Story = {
  loaders: [
    inspecting("design", () =>
      layersSelection(design("Dashboard"), [`${node("Dashboard", "Users card")}/${node("Stat card", "Value")}`])
    )
  ]
}
