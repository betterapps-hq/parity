import { findNode } from "@parity-app/core"
import { designsSelection, layersSelection } from "@parity-app/editor"
import { containerEntry } from "@parity-app/multiplayer"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"
import { design, example, node } from "../stories/fixtures.tsx"
import { DesignTab } from "./DesignPanel.tsx"
import { inspecting, InspectorStage, slowly } from "./inspector-stories.tsx"
import { Inspector } from "./Inspector.tsx"

/**
 * The Design tab with several things selected: designs to line up, copy or delete together, or layers of one design
 * whose shared look is edited at once, with the values they don't share marked as mixed.
 */
const meta = {
  title: "Parity/Inspector/Layers/Several layers",
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
      layersSelection(design("Stat card"), [node("Stat card", "Label"), node("Stat card", "Value")], {
        state: "loading"
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

/** The section titles, top to bottom. */
async function titles(canvasElement: HTMLElement) {
  const found = await within(canvasElement).findAllByRole("heading", { level: 3 }, slowly)

  return found.map((title) => title.textContent)
}

/** Pricing's headline and lede, two text layers: their sections come in a text layer's order, Typography first. */
export const LayersOfOneKind: Story = {
  loaders: [
    inspecting("design", () =>
      layersSelection(design("Pricing"), [node("Pricing", "Headline"), node("Pricing", "Lede")])
    )
  ],
  play: async ({ canvasElement }) => {
    const names = await titles(canvasElement)
    await expect(names.indexOf("Typography")).toBeLessThan(names.indexOf("Size"))
  }
}

/** Pricing's headline and its nav, a text layer and a layout: only what they share, so no Layout and no Content. */
export const LayersOfDifferentKinds: Story = {
  loaders: [
    inspecting("design", () =>
      layersSelection(design("Pricing"), [node("Pricing", "Headline"), node("Pricing", "Nav")])
    )
  ],
  play: async ({ canvasElement }) => {
    const names = await titles(canvasElement)
    await expect(names).toEqual(expect.arrayContaining(["Arrange", "Size", "Appearance"]))
    await expect(names).not.toContain("Layout")
    await expect(names).not.toContain("Content")
  }
}

/** The ids of a layout's children in the example. */
function childrenOf(designName: string, layoutName: string): string[] {
  const entry = containerEntry(example().doc, design(designName))
  const layout = entry && findNode(entry.container.root, node(designName, layoutName))

  return layout?.type === "layout" ? layout.children.map((child) => child.id) : []
}
