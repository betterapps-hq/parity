import { insertNode, setSlot } from "@parity-app/core"
import { designsSelection, layersSelection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { AppWindow } from "../App.tsx"
import { setPreferences } from "../chrome/preferences.ts"
import { design, example, layerElement, node, onCanvas } from "../stories/fixtures.tsx"
import { insertMime } from "./insert.ts"
import { setTabOrderShown } from "./tab-order.ts"

/**
 * What the canvas draws over designs as people work: selection and hover outlines in each kind's color, the selected
 * layer's name and size, the space inside a layout, resize handles, redlines, and the in-place text editor.
 */
const meta = {
  title: "Parity/Canvas/Selection",
  component: AppWindow,
  decorators: [
    (Story) => (
      <div className="h-screen">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof AppWindow>

export default meta
type Story = StoryObj<typeof meta>

const select = (selection: Parameters<ReturnType<typeof example>["selection"]["set"]>[0]) => () =>
  example().selection.set(selection)

/** A screen selected: its board in the screen color, with resize handles around each of its frames. */
export const DesignSelected: Story = onCanvas(["Pricing"], () => select({ design: design("Pricing") })())

/** A component selected: the same, in the component color. */
export const ComponentSelected: Story = onCanvas(["Plan card", "Stat card"], () =>
  select({ design: design("Plan card") })()
)

/**
 * A component with a slot selected (PAR-83): Plan card's features are a slot, outlined in dashes with the
 * slot's name, so it's clear where instances put their own layers.
 */
export const ComponentSlots: Story = onCanvas(["Plan card"], () => {
  const key = design("Plan card")
  example().store.updateContainer(key, "Make slot", (container) =>
    setSlot(container, node("Plan card", "Features"), "features")
  )
  select({ design: key })()
})

/**
 * An instance filling a slot (PAR-84): Pricing's Starter plan fills Plan card's `features` with a line of its own, drawn
 * in place of the placeholder's four, while the other plans show the placeholder. The instance is selected.
 */
export const FilledSlot: Story = onCanvas(["Pricing"], () => {
  const card = design("Plan card")
  example().store.updateContainer(card, "Make slot", (container) =>
    setSlot(container, node("Plan card", "Features"), "features")
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
  select(layersSelection(page, [starter]))()
})

/** Several designs selected together, to move, align or export at once. */
export const SeveralDesigns: Story = onCanvas(["Dashboard", "Pricing"], () =>
  select(designsSelection([design("Dashboard"), design("Pricing")]))()
)

/** One of a design's modes selected on its own, a column to resize or remove. */
export const ModeSelected: Story = onCanvas(["Dashboard"], () =>
  select({ design: design("Dashboard"), mode: "mobile-light" })()
)

/** A text layer selected inside a design: outlined, with its name above and its size below. */
export const LayerSelected: Story = onCanvas(["Pricing"], () =>
  select(layersSelection(design("Pricing"), [node("Pricing", "Headline")]))()
)

/** A layout selected: its padding and the gaps between its children are shaded. */
export const LayoutSpacing: Story = onCanvas(["Pricing"], () =>
  select(layersSelection(design("Pricing"), [node("Pricing", "Hero")]))()
)

/** Several layers selected, outlined together with their count and the size of the whole. */
export const SeveralLayers: Story = onCanvas(["Pricing"], () =>
  select(
    layersSelection(design("Pricing"), [
      node("Pricing", "Headline"),
      node("Pricing", "Lede"),
      node("Pricing", "Billing period")
    ])
  )()
)

/** Another layer under the pointer while one is selected: a thinner outline shows what a click would pick. */
export const Hovered: Story = onCanvas(
  ["Pricing"],
  () => select(layersSelection(design("Pricing"), [node("Pricing", "Hero")]))(),
  () => example().selection.setHover({ design: design("Pricing"), node: node("Pricing", "Plans") })
)

/** Holding Alt over another layer measures the distances between it and the selected one, in red. */
export const Measuring: Story = onCanvas(
  ["Pricing"],
  () => select(layersSelection(design("Pricing"), [node("Pricing", "Headline")]))(),
  () => {
    example().selection.setHover({ design: design("Pricing"), node: node("Pricing", "Billing period") })
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", altKey: true }))
  }
)

/** Editing a text layer in place, after double-clicking it: the text is typed straight into the design. */
export const EditingText: Story = onCanvas(["Pricing"], () => {
  const target = { design: design("Pricing"), node: node("Pricing", "Headline") }
  example().selection.set(target)
  example().selection.setEditing(target)
})

/** The layout grid turned on from the View menu: columns sized for each frame's width. */
export const LayoutGrid: Story = onCanvas(["Dashboard"], () => {
  setPreferences({ layoutGrid: true })
  select({ design: design("Dashboard") })()
})

/** The keyboard's tab order through the selected design, numbered, to check it reads in a sensible order. */
export const TabOrder: Story = onCanvas(["Sign in"], () => {
  setTabOrderShown(true)
  select({ design: design("Sign in") })()
})

/** The interact tool: designs take the pointer and keyboard themselves, to try their real components. */
export const Interacting: Story = onCanvas(["Sign in"], () => example().selection.setTool("interact"))

/** Dragging a component from the Components panel over a layout: a line shows where it will land. */
export const DroppingAComponent: Story = onCanvas(["Pricing"], undefined, () => {
  const plans = layerElement("Pricing", "Hero").getBoundingClientRect()
  const data = new DataTransfer()
  data.setData(insertMime, JSON.stringify({ kind: "component", component: "Button" }))
  document.querySelector(".canvas-area")?.dispatchEvent(
    new DragEvent("dragover", {
      bubbles: true,
      cancelable: true,
      clientX: plans.left + plans.width / 2,
      clientY: plans.top + plans.height * 0.7,
      dataTransfer: data
    })
  )
})
