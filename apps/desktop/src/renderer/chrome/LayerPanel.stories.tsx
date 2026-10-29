import { insertNode, mapNode } from "@parity/core"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { userEvent, within } from "storybook/test"
import { layersSelection } from "../selection.ts"
import { design, example, node } from "../stories/fixtures.tsx"
import { DesignTab } from "./DesignPanel.tsx"
import { inspecting, InspectorStage, slowly, typing } from "./inspector-stories.tsx"
import { Inspector } from "./Inspector.tsx"

/**
 * The Design tab with one layer selected: its name and kind, which state edits go to, then what it holds (text, a
 * component's props, an instance's params, an image), whether it shows, and its style.
 */
const meta = {
  title: "Parity/Inspector/Layer",
  component: DesignTab,
  render: () => <Inspector />,
  decorators: [
    (Story) => (
      <InspectorStage>
        <Story />
      </InspectorStage>
    )
  ]
} satisfies Meta<typeof DesignTab>

export default meta
type Story = StoryObj<typeof meta>

/** Selects one layer of an example design, by its name or its component, as the canvas or Layers would. */
const pick = (designName: string, layerName: string, state?: string) =>
  inspecting("design", () =>
    layersSelection(design(designName), [node(designName, layerName)], state ? { state } : undefined)
  )

/** A text layer, Pricing's headline: its text to edit, then visibility, and its type set large and centered. */
export const TextLayer: Story = { loaders: [pick("Pricing", "Headline")] }

/** A component layer, Plan card's call to action: its label, Button's props, a link to its stories, and its style. */
export const ComponentLayer: Story = { loaders: [pick("Plan card", "Call to action")] }

/** A component whose content is layers in its slot rather than a label: Sign in's submit button. */
export const ComponentWithLayersInside: Story = { loaders: [pick("Sign in", "Sign in button")] }

/** An icon from Lucide: its props aren't read from source, so only the ones it sets show. */
export const IconLayer: Story = { loaders: [pick("Plan card", "lucide/Check")] }

/** A layout, Pricing's hero: no content section, and a Layout section first among its styles. */
export const LayoutLayer: Story = { loaders: [pick("Pricing", "Hero")] }

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

/** An image layer: its file, alt text for screen readers, how it fills its box, and who took it. */
export const ImageLayer: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Pricing")
      example().store.updateContainer(key, "Add image", (container) => ({
        ...container,
        root: insertNode(
          container.root,
          node("Pricing", "Hero"),
          {
            id: "hero-photo",
            type: "image",
            name: "Team photo",
            src: "/images/team-at-work.jpg",
            alt: "Four people around a laptop, planning a launch",
            fit: "contain",
            credit: { name: "Brooke Cagle", url: "https://unsplash.com/@brookecagle", source: "Unsplash" },
            style: { width: "fill", height: 60, radius: "radius-xl" }
          },
          { index: 3 }
        )
      }))
      return layersSelection(key, ["hero-photo"])
    })
  ]
}

/** A layer hidden in the base design, Sign in's error alert: the Visible switch is off. */
export const HiddenLayer: Story = { loaders: [pick("Sign in", "Sign in error")] }

/**
 * A layer picked in another state, Sign in's password field in Wrong password: the editing bar turns the agent color
 * and says edits change only this state, and the props that state changes can each be reset.
 */
export const EditingAState: Story = { loaders: [pick("Sign in", "Password input", "wrong-password")] }

/** The state picker opened from the editing bar: every state of the design, to send edits to another. */
export const ChoosingTheState: Story = {
  loaders: [pick("Sign in", "Password input")],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getAllByRole("combobox")[0]!)
    await within(document.body).findByRole("listbox", undefined, slowly)
  }
}

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
