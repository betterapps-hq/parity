import { newDesign, turnInto } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { Box } from "tldraw"
import { AppWindow } from "../App.tsx"
import { showConsole } from "../chrome/ConsolePanel.tsx"
import { setLayout } from "../chrome/layout.ts"
import { design, example, onCanvas } from "../stories/fixtures.tsx"
import { canvasIdFor } from "./CanvasEditor.tsx"

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
  example().store.updateView(design("Button"), "Show every state", (view) => ({ ...view, allStates: true }))
)

/**
 * Every state, zoomed out to a third: the labels beside the states shrink with the canvas as the title does, and stay
 * beside rows tall enough to hold them, while the captions above the frames shrink and fade, and are gone by a quarter.
 */
export const EveryStateZoomedOut: Story = onCanvas(
  ["Button"],
  () => example().store.updateView(design("Button"), "Show every state", (view) => ({ ...view, allStates: true })),
  () => {
    const { editor } = example()
    const bounds = editor?.getShapePageBounds(canvasIdFor(design("Button")))

    if (editor && bounds) {
      editor.zoomToBounds(bounds, { targetZoom: 1 / 3 })
    }
  }
)

/** Every state of a design with only one: a single frame, with no label beside it, since there's nothing to tell apart. */
export const EveryStateOfOne: Story = onCanvas(["Plan card"], () =>
  example().store.updateView(design("Plan card"), "Show every state", (view) => ({ ...view, allStates: true }))
)

/** A design showing one state, the one picked on its board, rather than all of them. */
export const OneState: Story = onCanvas(["Sign in"], () =>
  example().store.updateView(design("Sign in"), "Show Wrong password", (view) => ({ ...view, state: "wrong-password" }))
)

/**
 * Zoomed far out: boards are small, and their titles shrink with them, running into the free canvas beside each board up
 * to the next one, and stay above every board at least 24 pixels wide on screen. Frame captions have faded out, and state labels show only beside rows tall enough
 * on screen to hold them, so they don't crowd the boards around them.
 */
export const ZoomedOut: Story = onCanvas(
  [],
  () => {
    for (const name of ["Button", "Sign in"]) {
      example().store.updateView(design(name), "Show every state", (view) => ({ ...view, allStates: true }))
    }
  },
  () => example().editor?.zoomToFit()
)

/** Adds two frames: a new one at 480 by 320, and the Sign in screen turned into one. */
function addFrames(): void {
  const { store } = example()
  const taken = store.getEntries().map((entry) => entry.container.id)
  const blank = newDesign("frame", taken, { x: -1400, y: -900 }, { size: { width: 480, height: 320 } })

  const root =
    blank.root.type === "layout"
      ? {
          ...blank.root,
          children: [
            {
              id: "fp-title",
              type: "text" as const,
              tag: "h2" as const,
              text: "Pricing ideas",
              style: { fontSize: { token: "text-xl" }, fontWeight: 600 }
            },
            { id: "fp-body", type: "text" as const, text: "Three tiers, yearly discount up front?" },
            { id: "fp-cta", type: "component" as const, component: "Button", props: { children: "Compare plans" } }
          ]
        }
      : blank.root

  store.addContainer(store.mainPath, { ...blank, id: "pricing-ideas", name: "Pricing ideas", root })
  const signIn = store.getEntries().find((entry) => entry.container.name === "Sign in")!.container
  const { design: turned } = turnInto(signIn, "frame", store.getModes())
  store.addContainer(store.mainPath, {
    ...turned,
    id: "sign-in-sketch",
    name: "Sign in sketch",
    position: { x: -1400, y: -300 }
  })
}

/**
 * Frames, the light kind (PAR-539, PAR-545): no board, just the name above, smaller than a board's title, and the
 * design at its own size in the primary mode.
 */
export const Frames: Story = onCanvas(["Pricing ideas", "Sign in sketch"], addFrames)

/** A frame selected: its name and icon in the layer color, its size under it, and handles on the right and bottom. */
export const SelectedFrame: Story = onCanvas(["Pricing ideas", "Sign in sketch"], addFrames, () =>
  example().selection.set({ design: design("Pricing ideas") })
)

/** Free text notes beside a design, for comments and to-dos on the canvas. */
export const Notes: Story = onCanvas(["Pricing"], undefined, async () => {
  const { store, editor } = example()
  const bounds = editor?.getShapePageBounds(canvasIdFor(design("Pricing")))

  if (!editor || !bounds) {
    return
  }

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
  const boxes = [bounds, ...notes.flatMap((key) => editor.getShapePageBounds(canvasIdFor(key)) ?? [])]
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
      style: { padding: { step: 32 }, gap: { step: 16 } },
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

/**
 * A layer whose component fails to draw (PAR-165): a tab list placed outside its tabs, which Radix refuses. It draws a
 * striped box in its place, naming the component and its error, and the rest of the screen draws around it. Layers
 * marks it, and the console, opened from the board's badge or that mark, lists it as an error with why it fails, how
 * to fix it and a button that selects it.
 */
export const FailingLayer: Story = onCanvas(
  ["Team settings"],
  () => {
    const { store } = example()
    store.addContainer(store.mainPath, {
      id: "story-team",
      name: "Team settings",
      kind: "screen",
      position: { x: -2400, y: -800 },
      root: {
        id: "story-team-page",
        type: "layout",
        name: "Page",
        style: { padding: { step: 32 }, gap: { step: 16 } },
        children: [
          { id: "story-team-title", type: "text", tag: "h1", text: "Team settings" },
          { id: "story-team-tabs", type: "component", name: "Sections", component: "TabsList" },
          { id: "story-team-save", type: "component", component: "Button", props: { children: "Save changes" } }
        ]
      },
      states: [{ id: "default", name: "Default" }]
    })
  },
  () => {
    example().selection.set({ design: design("Team settings"), node: "story-team-tabs" })
    setLayout({ consoleHeight: 220 })
    showConsole(design("Team settings"))
  }
)
