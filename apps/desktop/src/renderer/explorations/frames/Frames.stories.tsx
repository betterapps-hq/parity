import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test"
import { openProjects, ProjectStage } from "../../stories/fixtures.tsx"
import { Explainer } from "./canvas.tsx"
import { primaryMode } from "./data.ts"
import { type Design, FramesWorkspace, type Start } from "./workspace.tsx"

/**
 * Frames, the light weight beside screens and components (docs/proposals/new-user-experience.md, "Three weights" and
 * "Making something is always one visible step"). A frame is drawn once, at its own size, in the primary mode: no
 * states, no previews in other modes, and never written to code. It holds anything a screen holds, and becomes a
 * component or a screen when it's ready. The frame tool (F) draws one, and T in empty space on the canvas makes text in
 * one. Notes aren't part of this yet.
 *
 * Every story is the same canvas, started in a different place, and all of it works: click a design or its row in
 * Layers to select it, drag to move it, F and a drag to draw a frame, T and a click to type, and right-click a name or use the inspector's kind to convert. Ctrl+Z undoes. The app's theme follows the toolbar's
 * Theme switch; the designs keep the project's own light theme, as the primary mode draws them.
 */
const meta = {
  title: "Parity/Explorations/Frames",
  parameters: { layout: "fullscreen" },
  loaders: [() => openProjects("example")]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function workspace(start: Start) {
  return () => (
    <ProjectStage>
      <FramesWorkspace start={start} />
    </ProjectStage>
  )
}

const pricing: Design = {
  id: "pricing",
  kind: "screen",
  name: "Pricing",
  x: 0,
  y: 0,
  width: 1280,
  content: "pricing",
  modes: ["desktop-light", "mobile-light"],
  example: "Pricing"
}

const planCard: Design = {
  id: "plan-card",
  kind: "component",
  name: "Plan card",
  x: 1820,
  y: 0,
  width: 320,
  content: "plan-card",
  modes: [primaryMode.id],
  example: "Plan card"
}

const welcome: Design = {
  id: "welcome",
  kind: "frame",
  name: "Welcome",
  x: 2240,
  y: 0,
  width: 640,
  height: 400,
  content: "welcome",
  modes: []
}

const plansText: Design = {
  id: "plans-text",
  kind: "frame",
  name: "Plans for every team",
  x: 0,
  y: 0,
  width: 0,
  content: "text",
  text: "Plans for every team",
  named: true,
  modes: []
}

/** Pricing off to the left, as a project opens on a screen, leaving empty space to its right at 100%. */
const besidePricing: Design = { ...pricing, x: -1900, y: -200 }

/** The canvas element, which takes the pointer for the tools. */
function canvasOf(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("application", { name: "Canvas" })
}

/** The Layers panel, whose rows select what's on the canvas. */
function layersOf(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("complementary", { name: "Layers" })
}

// Three weights

/**
 * A screen, a component and a frame side by side, zoomed out as a project opens. The screen's board holds a preview
 * for each mode it shows, with its state and modes menus while it's hovered or selected; the component's board hugs
 * its one preview; the frame has no board at all, only its quiet name above the design at its own size.
 */
export const ThreeWeights: Story = {
  render: workspace({
    designs: [pricing, planCard, welcome],
    zoom: 0.3,
    pan: { x: 48, y: 230 },
    overlay: (
      <div className="flex gap-6">
        <Explainer title="Screen, the heavy one" width={260}>
          A page of your app. A preview in each mode it shows, its states, and it&apos;s written to code.
        </Explainer>
        <Explainer title="Component, the middle weight" width={260}>
          Reusable, with params and variants, and written to code. Its board hugs one preview until you turn on more
          modes.
        </Explainer>
        <Explainer title="Frame, the light weight" width={260}>
          A sketch, drawn once at its own size in the primary mode. No board, states or modes, and never written to
          code.
        </Explainer>
      </div>
    )
  })
}

/**
 * The three titles, to check at any zoom. Up close, a board's gutter stays 12px at the sides and bottom with a 36px
 * band for the captions, whatever the zoom; past 40% it shrinks with the canvas, so boards zoomed far out don't run
 * into each other, and its captions stay until they're too small to read, at 10%. Captions drop their chips, then the
 * mode's name, before anything is cut off, and a title drops its menus before its name.
 */
export const Titles: Story = {
  render: workspace({
    designs: [pricing, { ...planCard, x: 0, y: 1800 }, { ...welcome, x: 1000, y: 1800 }],
    zoom: 0.5,
    pan: { x: 48, y: 96 },
    overlay: (
      <div className="rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
        <Explainer title="Zoom to check each zoom">
          Hold Ctrl or ⌘ and scroll, or pinch, to zoom around the pointer. Scroll to pan.
        </Explainer>
      </div>
    )
  })
}

/**
 * Click a design, on the canvas or in Layers, and the inspector follows: Plan card's kind and params, from the
 * example's real component. A click on empty space selects nothing again.
 */
export const ClickToSelect: Story = {
  render: workspace({ designs: [pricing, planCard, welcome], zoom: 0.35, pan: { x: 48, y: 120 } }),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement)
    await userEvent.click(within(layersOf(canvasElement)).getByRole("button", { name: "Plan card" }))
    await expect(await body.findByRole("textbox", { name: "Component name" })).toHaveValue("Plan card")
    await userEvent.click(within(layersOf(canvasElement)).getByRole("button", { name: "Welcome" }))
    await expect(await body.findByRole("textbox", { name: "Frame name" })).toHaveValue("Welcome")
  }
}

// The frame tool

/**
 * The frame tool picked with F (or A, as in Figma), beside Text. The pointer is a crosshair over
 * the canvas, and the arrow beside the tool opens its sizes. Drag on the canvas to draw a frame.
 */
export const FrameTool: Story = {
  render: workspace({ designs: [pricing], tool: "frame", tooltip: "frame", zoom: 0.35, pan: { x: 48, y: 120 } }),
  play: async () => {
    await expect(await within(document.body).findByRole("tooltip")).toHaveTextContent("Frame")
  }
}

/**
 * Dragging out a frame: its size shows underneath as it grows, in the canvas's pixels, and it snaps to the edges of
 * the designs around it, here Pricing's top. Drag again to draw a real one.
 */
export const DrawingAFrame: Story = {
  render: workspace({
    designs: [pricing],
    tool: "frame",
    zoom: 0.35,
    pan: { x: 48, y: 120 },
    drawing: { from: { x: 1900, y: 0 }, to: { x: 2620, y: 440 } }
  })
}

/**
 * F, then a drag on the canvas: a frame named Frame 1, selected, with the move tool back, as in Figma. Layers lists it
 * under Frames, and the inspector shows its size.
 */
export const DrawAFrame: Story = {
  render: workspace({ designs: [pricing], zoom: 0.35, pan: { x: 48, y: 120 } }),
  play: async ({ canvasElement }) => {
    const canvas = canvasOf(canvasElement)
    await userEvent.keyboard("f")
    const box = canvas.getBoundingClientRect()
    const from = { clientX: box.left + 760, clientY: box.top + 160, pointerId: 1, button: 0 }
    const to = { clientX: box.left + 1000, clientY: box.top + 320, pointerId: 1, button: 0 }
    await fireEvent.pointerDown(canvas, from)
    await fireEvent.pointerMove(canvas, to)
    await fireEvent.pointerUp(canvas, to)
    await expect(await within(layersOf(canvasElement)).findByRole("button", { name: "Frame 1" })).toBeVisible()
    await expect(within(canvasElement).getByRole("textbox", { name: "Frame name" })).toHaveValue("Frame 1")
  }
}

/** Let go, and it's a frame named Frame 1, selected, filled with the project's background in the primary mode. */
export const FrameDrawn: Story = {
  render: workspace({
    designs: [
      pricing,
      {
        id: "frame-1",
        kind: "frame",
        name: "Frame 1",
        x: 1900,
        y: 0,
        width: 720,
        height: 440,
        content: "blank",
        modes: []
      }
    ],
    selected: "frame-1",
    zoom: 0.35,
    pan: { x: 48, y: 120 }
  })
}

/**
 * The frame tool's menu: a frame at each of the viewports the project's modes use, once each, with the modes that use
 * it. A viewport with only a width takes the nearest device's height. With a frame selected, a size resizes it. Below
 * them, New screen and New component, so every kind starts from the same place.
 */
export const FrameSizes: Story = {
  render: workspace({ designs: [pricing], tool: "frame", menuOpen: true, zoom: 0.35, pan: { x: 48, y: 120 } }),
  play: async () => {
    const menu = await within(document.body).findByRole("menu")
    await expect(within(menu).getByText("New screen")).toBeVisible()
  }
}

/**
 * A frame selected, with the inspector. Its name, then which kind it is with Frame picked, where it's drawn and that it
 * isn't written to code. Then its own layout, size and fill straight away, since selecting a frame selects its root
 * layout: no states, modes or params, which a frame doesn't have. Change its width or height and it resizes.
 */
export const SelectedFrame: Story = {
  render: workspace({ designs: [{ ...welcome, x: 0, y: 0 }], selected: "welcome", zoom: 0.75, pan: { x: 80, y: 140 } })
}

/**
 * Right-clicking a frame's name: Convert to component and Convert to screen, beside Rename, Duplicate and Delete.
 * Convert to screen puts it on a screen's board, in Layers' Screens.
 */
export const FrameMenu: Story = {
  render: workspace({
    designs: [{ ...welcome, x: 0, y: 0 }],
    selected: "welcome",
    zoom: 0.75,
    pan: { x: 240, y: 160 }
  }),
  play: async ({ canvasElement }) => {
    const title = within(canvasOf(canvasElement)).getByRole("button", { name: "Welcome" })
    const box = title.getBoundingClientRect()
    await fireEvent.contextMenu(title, { clientX: box.left + 24, clientY: box.bottom - 4 })
    await userEvent.click(await within(document.body).findByRole("menuitem", { name: "Convert to screen" }))
    const screens = within(layersOf(canvasElement)).getByRole("region", { name: "Screens" })
    await waitFor(() => expect(within(screens).getByRole("button", { name: "Welcome" })).toBeVisible())
  }
}

// Text in empty space

/**
 * T, then a click in empty space beside a screen: a text layer, being typed, in a frame that hugs it. The frame is named after
 * its text, never "Pasted", and it's a frame like any other, so the text has styles and can be built on.
 */
export const TextOnTheEmptyCanvas: Story = {
  render: workspace({
    designs: [besidePricing, plansText],
    selected: "plans-text",
    editing: "plans-text",
    zoom: 1,
    pan: { x: 560, y: 300 },
    overlay: (
      <Explainer title="Text makes a frame">
        In empty space, Text makes a text layer in a frame that hugs it, as a layout, an image or a paste make a frame
        there too.
      </Explainer>
    )
  })
}

/** T, a click in empty space and some typing: the frame takes the text's name as it's typed, in Layers and the inspector. */
export const TypeOnTheEmptyCanvas: Story = {
  render: workspace({ designs: [besidePricing], zoom: 1, pan: { x: 560, y: 300 } }),
  play: async ({ canvasElement }) => {
    const canvas = canvasOf(canvasElement)
    await userEvent.keyboard("t")
    const box = canvas.getBoundingClientRect()
    await fireEvent.pointerDown(canvas, { clientX: box.left + 700, clientY: box.top + 300, pointerId: 1, button: 0 })
    await userEvent.keyboard("Hello there")
    await expect(await within(layersOf(canvasElement)).findByRole("button", { name: "Hello there" })).toBeVisible()
  }
}

/**
 * Done typing, the frame is selected: it hugs its text both ways, and the inspector shows a frame with its padding and
 * fill. Enter types into it again.
 */
export const TextFrameSelected: Story = {
  render: workspace({
    designs: [besidePricing, plansText],
    selected: "plans-text",
    zoom: 1,
    pan: { x: 560, y: 300 }
  })
}

// Making it something heavier, and back

const welcomeHere = { ...welcome, x: 0, y: 0 }

/**
 * After Convert to component: the frame is on a component's board, hugging its one preview in the primary mode, with
 * the component's menus. Nothing was lost, so it just happens, and the toast's Undo makes it a frame again.
 */
export const MadeAComponent: Story = {
  render: workspace({
    designs: [{ ...welcomeHere, kind: "component", modes: [primaryMode.id] }],
    past: [{ designs: [welcomeHere] }],
    selected: "welcome",
    zoom: 0.75,
    pan: { x: 240, y: 160 },
    toast: { title: "Welcome is a component", description: "Place it in screens from Components." }
  })
}

/**
 * After Convert to screen: a screen's board with its preview in the primary mode, at the size the frame had, and the
 * state and modes menus to show it in more. The toast's Undo makes it a frame again.
 */
export const MadeAScreen: Story = {
  render: workspace({
    designs: [{ ...welcomeHere, kind: "screen", modes: [primaryMode.id] }],
    past: [{ designs: [welcomeHere] }],
    selected: "welcome",
    zoom: 0.75,
    pan: { x: 240, y: 160 },
    toast: { title: "Welcome is a screen", description: "Show it in more modes from its board's menu." }
  })
}

/**
 * Frame picked for a screen asks first, and says what goes: its other states and the previews beside its main one.
 * Its layers stay, as its first state shows them in the primary mode. The lists come from the example's real Pricing
 * screen. Convert to frame makes it one.
 */
export const ScreenToFrame: Story = {
  render: workspace({
    designs: [pricing],
    selected: "pricing",
    confirm: "pricing",
    zoom: 0.35,
    pan: { x: 48, y: 120 }
  }),
  play: async () => {
    await expect(await within(document.body).findByRole("dialog")).toHaveTextContent("Yearly")
  }
}

/**
 * The same for a component, which also loses its params, and whose instances can't point at a frame: each becomes
 * plain layers where it's placed, as Detach instance makes it. The lists come from the example's real Plan card.
 */
export const ComponentToFrame: Story = {
  render: workspace({
    designs: [{ ...planCard, x: 0, y: 0 }],
    selected: "plan-card",
    confirm: "plan-card",
    zoom: 1,
    pan: { x: 320, y: 160 }
  }),
  play: async () => {
    await expect(await within(document.body).findByRole("dialog")).toHaveTextContent("instances in Pricing")
  }
}
