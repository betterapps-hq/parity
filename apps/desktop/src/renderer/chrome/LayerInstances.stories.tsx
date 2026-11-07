import { mapNode } from "@parity-app/core"
import { layersSelection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { design, example, node } from "../stories/fixtures.tsx"
import { DesignTab } from "./DesignPanel.tsx"
import { inspecting } from "./inspector-stories.tsx"
import { inspectorStage, pick, renderInspector } from "./layer-stories.tsx"

/** An instance of a component design selected: which state of its component it shows, and each of its params. */
const meta = {
  title: "Parity/Inspector/Layer/Instances",
  component: DesignTab,
  render: renderInspector,
  decorators: [inspectorStage]
} satisfies Meta<typeof DesignTab>

export default meta
type Story = StoryObj<typeof meta>

/** An instance of a component design, Pricing's Pro plan: which state of Plan card it shows, and each of its params. */
export const InstanceLayer: Story = { loaders: [pick("Pricing", "Pro plan")] }

/** The Pro plan picked in Pricing's Yearly state, which changes its price and billing: those params can be reset. */
export const InstanceChangedInAState: Story = { loaders: [pick("Pricing", "Pro plan", "yearly")] }

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
