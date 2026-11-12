import { type ImageNode, insertNode, type VideoNode } from "@parity-app/core"
import { layersSelection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"
import { design, example, node } from "../stories/fixtures.tsx"
import { DesignTab } from "./DesignPanel.tsx"
import { inspecting, slowly } from "./inspector-stories.tsx"
import { inspectorStage, pick, renderInspector } from "./layer-stories.tsx"

/**
 * The Design tab with one design or layer of each kind selected, one story each, named as its header names the kind.
 * The other Layer folders hold the cases beyond these: its name and header, states, instances and slots.
 */
const meta = {
  title: "Parity/Inspector/Layer/Kinds",
  component: DesignTab,
  render: renderInspector,
  decorators: [inspectorStage]
} satisfies Meta<typeof DesignTab>

export default meta

type Story = StoryObj<typeof meta>

/** A screen, Pricing: what it repeats, its modes, and Export. */
export const Screen: Story = { loaders: [inspecting("design", () => ({ design: design("Pricing") }))] }

/** A component, Plan card: its states, variants, props and modes, and the code an instance writes. */
export const Component: Story = { loaders: [inspecting("design", () => ({ design: design("Plan card") }))] }

/** A text layer, Pricing's headline: its text to edit, then visibility, and its type set large and centered. */
export const Text: Story = { loaders: [pick("Pricing", "Headline")] }

/** A horizontal layout, Pricing's nav: a Layout section first among its styles. */
export const HorizontalLayout: Story = { name: "Horizontal layout", loaders: [pick("Pricing", "Nav")] }

/** A vertical layout, Pricing's hero. */
export const VerticalLayout: Story = { name: "Vertical layout", loaders: [pick("Pricing", "Hero")] }

/** A grid, Pricing's plans: its header says Grid layout, with the grid icon the Layout section uses. */
export const Grid: Story = { loaders: [pick("Pricing", "Plans")] }

/** An instance of a code component, Plan card's call to action: Button's props, its header's links, and its style. */
export const CodeComponentInstance: Story = {
  name: "Code component instance",
  loaders: [pick("Plan card", "Call to action")]
}

/** An instance of a component design, Pricing's Pro plan: its props, Go to component in its header, and its style. */
export const DesignInstance: Story = { name: "Design instance", loaders: [pick("Pricing", "Pro plan")] }

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
