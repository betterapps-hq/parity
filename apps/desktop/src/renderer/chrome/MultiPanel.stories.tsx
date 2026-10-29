import { findNode } from "@parity/core"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { userEvent, within } from "storybook/test"
import { designsSelection, layersSelection } from "../selection.ts"
import { design, example, node } from "../stories/fixtures.tsx"
import { DesignTab } from "./DesignPanel.tsx"
import { inspecting, InspectorStage, slowly } from "./inspector-stories.tsx"
import { Inspector } from "./Inspector.tsx"

/**
 * The Design tab with several things selected: designs to line up, copy or delete together, or layers of one design
 * whose shared look is edited at once, with the values they don't share marked as mixed.
 */
const meta = {
  title: "Parity/Inspector/Multiple",
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

/** Two designs selected: how many, their names, the align buttons, then duplicate and delete. */
export const TwoDesigns: Story = {
  loaders: [inspecting("design", () => designsSelection([design("Pricing"), design("Dashboard")]))]
}

/** Five designs selected: distribute buttons join the align ones, and the list of names truncates. */
export const ManyDesigns: Story = {
  loaders: [
    inspecting("design", () =>
      designsSelection(["Pricing", "Dashboard", "Sign in", "Settings", "Plan card"].map(design))
    )
  ]
}

/** Hovering an align button: its tooltip names it and its shortcut. */
export const AlignTooltip: Story = {
  loaders: [inspecting("design", () => designsSelection([design("Pricing"), design("Dashboard")]))],
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole("button", { name: "Align left" }))
    await within(document.body).findByRole("tooltip", undefined, slowly)
  }
}

/**
 * Three layers of Pricing's hero with different looks: the count, the arrange tools, a note naming what differs, and
 * those fields showing Mixed.
 */
export const LayersWithMixedValues: Story = {
  loaders: [
    inspecting("design", () =>
      layersSelection(design("Pricing"), [
        node("Pricing", "Headline"),
        node("Pricing", "Lede"),
        node("Pricing", "Billing period")
      ])
    )
  ]
}

/** Four nav buttons that look the same: no mixed values, every field shows what they share. */
export const LayersAlike: Story = {
  loaders: [inspecting("design", () => layersSelection(design("Pricing"), childrenOf("Pricing", "Nav links")))]
}

/** Layers in two different layouts: without one parent, there's no position or self alignment to set. */
export const LayersInDifferentLayouts: Story = {
  loaders: [
    inspecting("design", () =>
      layersSelection(design("Sign in"), [node("Sign in", "Brand"), node("Sign in", "Remember")])
    )
  ]
}

/** Layers picked in a state other than the base: the header says which state the edits go to. */
export const LayersInAState: Story = {
  loaders: [
    inspecting("design", () =>
      layersSelection(design("Sign in"), [node("Sign in", "Email input"), node("Sign in", "Password input")], {
        state: "signing-in"
      })
    )
  ]
}

/** Several layers selected, one of which was deleted: only the ones left count. */
export const SomeLayersGone: Story = {
  loaders: [
    inspecting("design", () =>
      layersSelection(design("Pricing"), [node("Pricing", "Headline"), "deleted-layer", node("Pricing", "Lede")])
    )
  ]
}

/** Every selected layer was deleted, by an agent or another window: the panel says they no longer exist. */
export const LayersGone: Story = {
  loaders: [inspecting("design", () => layersSelection(design("Pricing"), ["deleted-layer", "another-deleted-layer"]))]
}

/** The ids of a layout's children in the example. */
function childrenOf(designName: string, layoutName: string): string[] {
  const entry = example().store.getEntry(design(designName))
  const layout = entry && findNode(entry.container.root, node(designName, layoutName))
  return layout?.type === "layout" ? layout.children.map((child) => child.id) : []
}
