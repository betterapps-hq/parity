import { type ImageNode, insertNode, type VideoNode } from "@parity-app/core"
import { layersSelection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"
import { design, example, node } from "../stories/fixtures.tsx"
import { DesignTab } from "./DesignPanel.tsx"
import { inspecting, slowly } from "./inspector-stories.tsx"
import { inspectorStage, pick, renderInspector } from "./layer-stories.tsx"

/**
 * The Design tab with one layer of each kind selected, one story each, named as its header names the kind: the
 * sections that kind gets. A layout's and a text layer's own panels are Layers › Layout and Text. Each section's own cases are in Sections, and a whole design's panel in Layers › Designs.
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

/** An icon from Lucide: its props aren't read from source, so only the ones it sets show. */
export const Icon: Story = { loaders: [pick("Plan card", "lucide/Check")] }

/** Adds a picture or a clip to Pricing's hero and selects it. */
const media = (layer: Pick<ImageNode, "type" | "src"> | Pick<VideoNode, "type" | "src" | "controls">) =>
  inspecting("design", () => {
    const key = design("Pricing")
    example().store.updateContainer(key, `Add ${layer.type}`, (container) => ({
      ...container,
      root: insertNode(
        container.root,
        node("Pricing", "Hero"),
        {
          id: "hero-media",
          name: "Team photo",
          alt: "Four people around a laptop, planning a launch",
          fit: "contain",
          credit: { name: "Brooke Cagle", url: "https://unsplash.com/@brookecagle", source: "Unsplash" },
          style: { width: { size: "fill" }, height: { step: 60 }, borderRadius: { token: "radius-xl" } },
          ...layer
        },
        { index: 3 }
      )
    }))

    return layersSelection(key, ["hero-media"])
  })

/** Finds a media layer's fields by their labels, as a screen reader names them. */
async function mediaFields(canvasElement: HTMLElement) {
  const panel = within(canvasElement)
  await expect(await panel.findByRole("textbox", { name: "File" }, slowly)).toBeVisible()
  await expect(panel.getByRole("textbox", { name: "Alt text" })).toHaveValue(
    "Four people around a laptop, planning a launch"
  )
  await expect(panel.getByRole("combobox", { name: "Fit" })).toHaveTextContent("Contain, shown whole")
  await expect(panel.getByRole("button", { name: "Hide layer" })).toBeVisible()

  return panel
}

/** An image layer: its file, alt text for screen readers, how it fills its box, and who took it. */
export const Image: Story = {
  loaders: [media({ type: "image", src: "/images/team-at-work.jpg" })],
  play: async ({ canvasElement }) => {
    const panel = await mediaFields(canvasElement)
    await expect(panel.getByRole("textbox", { name: "File" })).toHaveValue("/images/team-at-work.jpg")
  }
}

/** A video layer: an image's fields, and whether it shows the browser's controls. */
export const Video: Story = {
  loaders: [media({ type: "video", src: "/videos/team-at-work.mp4", controls: true })],
  play: async ({ canvasElement }) => {
    const panel = await mediaFields(canvasElement)
    await expect(panel.getByRole("switch", { name: "Controls" })).toBeChecked()
  }
}
