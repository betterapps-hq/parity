import { insertNode } from "@parity-app/core"
import { layersSelection } from "@parity-app/editor"
import { updateContainer } from "@parity-app/multiplayer"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"
import { design, example, node } from "../stories/fixtures.tsx"
import { DesignTab } from "./DesignPanel.tsx"
import { inspecting, slowly } from "./inspector-stories.tsx"
import { inspectorStage, renderInspector } from "./layer-stories.tsx"

/**
 * A layer read from a component's element (read-only viewer): its type's sections, then Spacing and Position after Size,
 * as every box has them, and Effects, Motion and CSS folded last. A structure element folds Typography for the text
 * inside it, as a layout does.
 */
const meta = {
  title: "Parity/Inspector/Layers/Element",
  component: DesignTab,
  render: renderInspector,
  decorators: [inspectorStage]
} satisfies Meta<typeof DesignTab>

export default meta

type Story = StoryObj<typeof meta>

/** Adds a layer read from an element to Pricing's hero and selects it. */
const element = (tag: string, type: "layout" | "text") =>
  inspecting("design", () => {
    const key = design("Pricing")
    updateContainer(example().doc, key, `Add ${tag}`, (container) => ({
      ...container,
      root: insertNode(
        container.root,
        node("Pricing", "Hero"),
        type === "text"
          ? { type: "text", id: "read-element", name: tag, text: "Start free", element: { tag } }
          : { type: "layout", id: "read-element", name: tag, children: [], element: { tag } },
        { index: 0 }
      )
    }))

    return layersSelection(key, ["read-element"])
  })

/** The section titles, top to bottom. */
async function titles(canvasElement: HTMLElement) {
  const found = await within(canvasElement).findAllByRole("heading", { level: 3 }, slowly)

  return found.map((title) => title.textContent)
}

/** A `<button>`, an input: its size with the box around it and where it sits, as any layer has. */
export const Button: Story = {
  loaders: [element("button", "text")],
  play: async ({ canvasElement }) => {
    const names = await titles(canvasElement)
    await expect(names).toEqual(expect.arrayContaining(["Typography", "Size", "Spacing", "Position", "Appearance"]))
  }
}

/** A `<section>`, structure: Layout, with Typography for the text inside it. */
export const Section: Story = {
  loaders: [element("section", "layout")],
  play: async ({ canvasElement }) => {
    const names = await titles(canvasElement)
    await expect(names).toEqual(expect.arrayContaining(["Layout", "Size", "Spacing", "Position", "Typography"]))
  }
}
