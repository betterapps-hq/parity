import { insertNode, setSlot } from "@parity-app/core"
import { layersSelection } from "@parity-app/editor"
import type { Decorator } from "@storybook/react-vite"
import type { ComponentType } from "react"
import { useProject } from "../canvas/context.ts"
import { type ContainerEntry, useContainerEntry } from "../design-store.ts"
import { useSelection } from "../selection.ts"
import { design, example, node } from "../stories/fixtures.tsx"
import { answerPreviews } from "../stories/previews.ts"
import { DesignTabFields } from "./DesignPanel.tsx"
import { inspecting, InspectorStage, SectionStage } from "./inspector-stories.tsx"
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
    const { store, selection } = useProject()
    const entry = useContainerEntry(store, useSelection(selection).design)

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
    example().store.updateContainer(key, "Make slot", (container) =>
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
    example().store.updateContainer(card, "Make slots", (container) =>
      setSlot(
        setSlot(container, node("Plan card", "Features"), "features"),
        node("Plan card", "Price block"),
        "pricing"
      )
    )
    const page = design("Pricing")
    const starter = node("Pricing", "Starter plan")
    example().store.updateContainer(page, "Fill features", (container) => ({
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
