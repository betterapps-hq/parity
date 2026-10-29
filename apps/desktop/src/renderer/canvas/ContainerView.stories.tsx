import type { Meta, StoryObj } from "@storybook/react-vite"
import { Box } from "tldraw"
import { AppWindow } from "../App.tsx"
import { design, example, onCanvas } from "../stories/fixtures.tsx"
import { shapeIdFor } from "./CanvasEditor.tsx"

/**
 * Designs on the canvas, each on its board: the title above it, then a frame for each mode it shows, side by side, and
 * for each state when it shows them all. Boards hold the project's real components, rendered by the project itself.
 */
const meta = {
  title: "Parity/Canvas/Boards",
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

/** Screens in the modes they show beside their main one: dark desktop and light mobile next to light desktop. */
export const Screens: Story = onCanvas(["Dashboard", "Sign in"])

/** Components, each on a smaller board in the component color, sized to its content. */
export const Components: Story = onCanvas(["Stat card", "Plan card", "Activity item", "Member row"])

/** A design showing every one of its states at once, each frame labelled with its state. */
export const EveryState: Story = onCanvas(["Button"], () =>
  example().store.updateView(design("Button"), (view) => ({ ...view, allStates: true }))
)

/** A design showing one state, the one picked on its board, rather than all of them. */
export const OneState: Story = onCanvas(["Sign in"], () =>
  example().store.updateView(design("Sign in"), (view) => ({ ...view, state: "wrong-password" }))
)

/** Zoomed far out: boards are small, and their titles shrink with them but stay above every board. */
export const ZoomedOut: Story = onCanvas([], undefined, () => example().editor?.zoomToFit())

/** Free text notes beside a design, for comments and to-dos on the canvas. */
export const Notes: Story = onCanvas(["Pricing"], undefined, async () => {
  const { store, editor } = example()
  const bounds = editor?.getShapePageBounds(shapeIdFor(design("Pricing")))
  if (!editor || !bounds) return
  const notes = [
    store.addNote(store.mainPath, {
      id: "story-note-plans",
      text: "Plans: should Business say 'Contact us' instead of a price?",
      position: { x: bounds.maxX + 80, y: bounds.y + 40 },
      width: 280
    }),
    store.addNote(store.mainPath, {
      id: "story-note-faq",
      text: "FAQ answers still need legal review",
      position: { x: bounds.maxX + 80, y: bounds.y + 260 }
    })
  ]
  await new Promise((resolve) => setTimeout(resolve, 300))
  const boxes = [bounds, ...notes.flatMap((key) => editor.getShapePageBounds(shapeIdFor(key)) ?? [])]
  editor.zoomToBounds(Box.Common(boxes), { inset: 48 })
})

/**
 * A design using components the project doesn't have, such as one from a library that was removed: each shows as a
 * placeholder naming it, and the rest of the design still renders.
 */
export const MissingComponents: Story = onCanvas(["Gallery"], () => {
  const { store } = example()
  store.addContainer(store.mainPath, {
    id: "story-gallery",
    name: "Gallery",
    kind: "screen",
    position: { x: -2400, y: -800 },
    root: {
      id: "story-gallery-page",
      type: "layout",
      style: { padding: 32, gap: 16 },
      children: [
        { id: "story-gallery-title", type: "text", tag: "h1", text: "Gallery" },
        { id: "story-gallery-carousel", type: "component", component: "Carousel", props: { items: 6 } },
        { id: "story-gallery-picker", type: "component", component: "nova/DateRangePicker" },
        { id: "story-gallery-button", type: "component", component: "Button", props: { children: "Load more" } }
      ]
    },
    states: [{ id: "default", name: "Default" }]
  })
})
