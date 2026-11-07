import { insertNode, setSlot } from "@parity-app/core"
import { layersSelection } from "@parity-app/editor"
import type { Decorator } from "@storybook/react-vite"
import { design, example, node } from "../stories/fixtures.tsx"
import { answerPreviews } from "../stories/previews.ts"
import { inspecting, InspectorStage } from "./inspector-stories.tsx"
import { Inspector } from "./Inspector.tsx"

/*
 * What the Parity/Inspector/Layer stories share: the Design tab with one layer selected, drawn as the inspector draws
 * it, in folders by what they show (Kinds, Basics, States, Instances and Slots).
 */

export const renderInspector = () => <Inspector />

export const inspectorStage: Decorator = (Story) => (
  <InspectorStage>
    <Story />
  </InspectorStage>
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
