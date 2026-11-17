import type { Meta, StoryObj } from "@storybook/react-vite"
import { DesignTab } from "./DesignPanel.tsx"
import { inspectorStage, pick, renderInspector } from "./layer-stories.tsx"

/**
 * The Design tab with one layer of each kind selected, one story each, named as its header names the kind: the
 * sections that kind gets. Layouts, text layers, images, videos and icons have their own panels in Layers. Each section's own cases are in Sections, and a whole design's panel in Layers › Designs.
 */
const meta = {
  title: "Parity/Inspector/Layers/Kinds",
  component: DesignTab,
  render: renderInspector,
  decorators: [inspectorStage]
} satisfies Meta<typeof DesignTab>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A component instance, Plan card's call to action: Button's props under its name, the attributes it passes on, its
 * header's links, and its style.
 */
export const ComponentInstance: Story = { name: "Component instance", loaders: [pick("Plan card", "Call to action")] }
