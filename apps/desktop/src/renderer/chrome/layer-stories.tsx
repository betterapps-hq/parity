import { type ImageNode, insertNode, setSlot, type VideoNode } from "@parity-app/core"
import { layersSelection } from "@parity-app/editor"
import { updateContainer } from "@parity-app/multiplayer"
import type { Decorator } from "@storybook/react-vite"
import type { ComponentType } from "react"
import { expect, within } from "storybook/test"
import { useProject } from "../canvas/context.ts"
import { type ContainerEntry, useContainerEntry } from "../project-doc.ts"
import { useSelection } from "../selection.ts"
import { design, example, node } from "../stories/fixtures.tsx"
import { answerPreviews } from "../stories/previews.ts"
import { DesignTabFields } from "./DesignPanel.tsx"
import { inspecting, InspectorStage, SectionStage, slowly } from "./inspector-stories.tsx"
import { Inspector } from "./Inspector.tsx"

/*
 * What the inspector's Layers and Sections stories share: the Design tab with one layer selected, drawn as the inspector
 * draws it, or one section of it alone.
 */

export const renderInspector = () => <Inspector />

/**
 * One section of the selected layer's panel alone, for `sectionStage`: what a story demos, without the sections it
 * isn't about. Each section takes the selection itself (PAR-1031).
 */
export const renderSection = (Section: ComponentType) =>
  function Part() {
    return (
      <DesignTabFields>
        <Section />
      </DesignTabFields>
    )
  }

/** One of the selected design's sections alone, as `renderSection` draws a layer's. */
export const renderDesignSection = (Section: ComponentType<{ entry: ContainerEntry }>) =>
  renderSection(function Selected() {
    const session = useProject()
    const entry = useContainerEntry(session, useSelection(session.selection).design)

    return entry ? <Section entry={entry} /> : null
  })

export const inspectorStage: Decorator = (Story) => (
  <InspectorStage>
    <Story />
  </InspectorStage>
)

/** A Sections story's stage: the section alone, at the inspector's width, without the panel around it. */
export const sectionStage: Decorator = (Story) => (
  <SectionStage>
    <Story />
  </SectionStage>
)

/** Selects one layer of an example design, by its name or its component, as the canvas or Layers would. */
export const pick = (designName: string, layerName: string, state?: string) =>
  inspecting("design", () =>
    layersSelection(design(designName), [node(designName, layerName)], state ? { state } : undefined)
  )

/** Marks layouts of an example component design as slots, then selects `layerName`, which may be another layout. */
export const slotted = (designName: string, slots: Record<string, string>, layerName: string) =>
  inspecting("design", () => {
    const key = design(designName)
    updateContainer(example().doc, key, "Make slot", (container) =>
      Object.entries(slots).reduce(
        (current, [layer, name]) => setSlot(current, node(designName, layer), name),
        container
      )
    )

    return layersSelection(key, [node(designName, layerName)])
  })

/**
 * Plan card with two slots, `features` and `pricing`, and Pricing's Starter plan filling `features` with a line of its
 * own, then selects the instance, or with `slot`, its `features` slot, as clicking its row does (PAR-84). A slot's
 * picture is drawn offscreen in the app; here it's still being drawn.
 */
export const filledInstance = (selected: "instance" | "slot" = "instance") =>
  inspecting("design", () => {
    answerPreviews()
    const card = design("Plan card")
    updateContainer(example().doc, card, "Make slots", (container) =>
      setSlot(
        setSlot(container, node("Plan card", "Features"), "features"),
        node("Plan card", "Price block"),
        "pricing"
      )
    )
    const page = design("Pricing")
    const starter = node("Pricing", "Starter plan")
    updateContainer(example().doc, page, "Fill features", (container) => ({
      ...container,
      root: insertNode(
        container.root,
        starter,
        { type: "text", id: "starter-extra", text: "Unlimited viewers" },
        { slot: "features" }
      )
    }))

    return layersSelection(page, [selected === "slot" ? `${starter}/${node("Plan card", "Features")}` : starter])
  })

/** Adds a picture or a clip to Pricing's hero and selects it. */
export const media = (layer: Pick<ImageNode, "type" | "src"> | Pick<VideoNode, "type" | "src" | "controls">) =>
  inspecting("design", () => {
    const key = design("Pricing")
    updateContainer(example().doc, key, `Add ${layer.type}`, (container) => ({
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

/** Checks a media layer's fields by their labels, as a screen reader names them. */
export async function mediaFields(canvasElement: HTMLElement): Promise<void> {
  const panel = within(canvasElement)
  await expect(await panel.findByRole("textbox", { name: "File" }, slowly)).toBeVisible()
  await expect(panel.getByRole("textbox", { name: "Alt text" })).toHaveValue(
    "Four people around a laptop, planning a launch"
  )
  await expect(panel.getByRole("combobox", { name: "Fit" })).toHaveTextContent("Contain, shown whole")
  await expect(panel.getByRole("button", { name: "Hide layer" })).toBeVisible()
}
