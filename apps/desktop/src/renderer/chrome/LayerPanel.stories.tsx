import { type ImageNode, insertNode, type VideoNode } from "@parity-app/core"
import { layersSelection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { design, example, node } from "../stories/fixtures.tsx"
import { answering } from "../stories/host.ts"
import { DesignTab } from "./DesignPanel.tsx"
import { inspecting, slowly } from "./inspector-stories.tsx"
import { inspectorStage, pick, renderInspector } from "./layer-stories.tsx"

/**
 * The Design tab with one layer of each kind selected: what it holds (text, a component's props, an image), then whether
 * it shows, and its style. The other Layer folders hold its name and header, states, instances and slots.
 */
const meta = {
  title: "Parity/Inspector/Layer/Kinds",
  component: DesignTab,
  render: renderInspector,
  decorators: [inspectorStage]
} satisfies Meta<typeof DesignTab>

export default meta

type Story = StoryObj<typeof meta>

/** A text layer, Pricing's headline: its text to edit, then visibility, and its type set large and centered. */
export const TextLayer: Story = { loaders: [pick("Pricing", "Headline")] }

/** A component layer, Plan card's call to action: its label, Button's props, a link to its stories, and its style. */
export const ComponentLayer: Story = { loaders: [pick("Plan card", "Call to action")] }

/** A component whose content is layers in its slot rather than a label: Sign in's submit button. */
export const ComponentWithLayersInside: Story = { loaders: [pick("Sign in", "Sign in button")] }

/** An icon from Lucide: its props aren't read from source, so only the ones it sets show. */
export const IconLayer: Story = { loaders: [pick("Plan card", "lucide/Check")] }

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

/** A layout, Pricing's hero: no content section, and a Layout section first among its styles. */
export const LayoutLayer: Story = { loaders: [pick("Pricing", "Hero")] }

/** A grid, Pricing's plans: its header says Grid layout, with the grid icon the Layout section uses. */
export const GridLayer: Story = { loaders: [pick("Pricing", "Plans")] }

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
          style: { width: "fill", height: 60, radius: "radius-xl" },
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
  await expect(panel.getByRole("switch", { name: "Visible" })).toBeChecked()

  return panel
}

/** An image layer: its file, alt text for screen readers, how it fills its box, and who took it. */
export const ImageLayer: Story = {
  loaders: [media({ type: "image", src: "/images/team-at-work.jpg" })],
  play: async ({ canvasElement }) => {
    const panel = await mediaFields(canvasElement)
    await expect(panel.getByRole("textbox", { name: "File" })).toHaveValue("/images/team-at-work.jpg")
  }
}

/** A video layer: an image's fields, and whether it shows the browser's controls. */
export const VideoLayer: Story = {
  loaders: [media({ type: "video", src: "/videos/team-at-work.mp4", controls: true })],
  play: async ({ canvasElement }) => {
    const panel = await mediaFields(canvasElement)
    await expect(panel.getByRole("switch", { name: "Controls" })).toBeChecked()
  }
}
