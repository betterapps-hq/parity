import { mapNode } from "@parity-app/core"
import { layersSelection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { userEvent, within } from "storybook/test"
import { design, example, node } from "../stories/fixtures.tsx"
import { answering } from "../stories/host.ts"
import { DesignTab } from "./DesignPanel.tsx"
import { inspecting, slowly } from "./inspector-stories.tsx"
import { inspectorStage, pick, renderInspector } from "./layer-stories.tsx"

/** Instances beyond the two in Kinds: a code component's content and style, and a design instance's edge cases. */
const meta = {
  title: "Parity/Inspector/Layer/Instances",
  component: DesignTab,
  render: renderInspector,
  decorators: [inspectorStage]
} satisfies Meta<typeof DesignTab>

export default meta

type Story = StoryObj<typeof meta>

/** A component whose content is layers in its slot rather than a label: Sign in's submit button. */
export const ComponentWithLayersInside: Story = { loaders: [pick("Sign in", "Sign in button")] }

/**
 * A component whose props have no `style`, as an app's `MemberRow({ member })` hasn't, shown here as Pricing's badge:
 * the panel says the size and styles don't change it, and Wrap in layout puts a layout around it to size instead.
 */
export const ComponentWithoutStyle: Story = {
  loaders: [
    async () => {
      answering({
        "project.components": async (_params, usual) => {
          const components = await usual()

          return { ...components, Badge: { ...components.Badge!, takesStyle: false } }
        }
      })
      await pick("Pricing", "Badge")()
    }
  ],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    await panel.findByText(/doesn't take a/, undefined, slowly)
    await userEvent.click(panel.getByRole("button", { name: /Wrap in layout/ }))
    await panel.findByText(/^(Horizontal|Vertical) layout$/, undefined, slowly)
  }
}

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
