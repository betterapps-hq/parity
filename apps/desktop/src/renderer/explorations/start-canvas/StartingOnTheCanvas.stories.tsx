import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { openDialog } from "../../chrome/app-dialogs.ts"
import { design, example, frameDesigns, openProjects, ProjectStage } from "../../stories/fixtures.tsx"
import { StartInspectorPanel, StartLeftPanel, StartWindow } from "./StartWindow.tsx"

/**
 * Starting on an empty canvas, as the new-user audit proposes (PAR-529, "Making something is always one visible
 * step"): the canvas says how to start in its middle; New screen and New component are in File, Object, the canvas's
 * right-click menu and Search actions, each with its keys; Layers' + always shows and its empty rows make the first
 * one; and the inspector says how to start rather than asking for a selection. Everything is the app's own but the
 * proposed parts, and they work: New screen makes a real one, and the start goes.
 */
const meta = {
  title: "Parity/Explorations/Starting on the canvas",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const body = () => within(document.body)

/** Opens one of the title bar's menus, as a click on its name does. */
async function openMenu(name: string): Promise<HTMLElement> {
  await userEvent.click(await body().findByRole("menuitem", { name }))
  return body().findByRole("menu")
}

/** Presses and releases the right button at a point, as the mouse does, so tldraw opens the menu as it does in the app. */
async function rightClick(point: { x: number; y: number }): Promise<HTMLElement> {
  const target = document.elementFromPoint(point.x, point.y) ?? document.body
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: point.x,
    clientY: point.y,
    button: 2,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true
  }
  target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 2 }))
  target.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0 }))
  return body().findByRole("menu", { name: "Canvas" })
}

/** The canvas's box, once it's drawn. */
async function canvasBox(): Promise<DOMRect> {
  const area = await waitFor(() => {
    const found = document.querySelector(".canvas-area .tl-container")
    if (!found) throw new Error("The canvas isn't drawn yet")
    return found
  })
  return area.getBoundingClientRect()
}

/**
 * An empty canvas, in a project with nothing on it yet. In its middle, a tile each for New screen and New component,
 * with what each is and its keys, then Insert and dropping an image with theirs. Layers' + shows beside both groups,
 * and each empty row makes the first one. The inspector says how to start. Try a tile, a row or the keys: the start
 * goes once something is on the canvas.
 */
export const EmptyCanvas: Story = {
  loaders: [() => openProjects("empty")],
  render: () => <StartWindow />
}

/**
 * Once frames exist (PAR-540 designs them), Draw a frame joins the tiles with its key, F. The tiles share the row, so
 * nothing else moves; the tool itself is PAR-540's.
 */
export const EmptyCanvasOnceFramesExist: Story = {
  loaders: [() => openProjects("empty")],
  render: () => <StartWindow frames />
}

/**
 * After New screen, from the start: the screen is made and selected, the start goes, Layers lists it under Screens
 * beside its +, and the inspector shows it.
 */
export const AfterNewScreen: Story = {
  loaders: [() => openProjects("empty")],
  render: () => <StartWindow />,
  play: async () => {
    const start = await body().findByRole("region", { name: "Start with a screen or a component" })
    await userEvent.click(within(start).getByRole("button", { name: /^New screen/ }))
    await waitFor(() => expect(body().queryByRole("region", { name: /^Start with/ })).toBeNull())
  }
}

/** File, on the empty canvas: New screen and New component first, with their keys, above opening and saving. */
export const FileMenu: Story = {
  loaders: [() => openProjects("empty")],
  render: () => <StartWindow />,
  play: async () => {
    const menu = await openMenu("File")
    await expect(within(menu).getByRole("menuitem", { name: /^New screen/ })).toBeEnabled()
  }
}

/**
 * Object, with nothing selected: New screen, New component and Insert are what can be done, and the hint says what
 * to select for the rest, in the glossary's words.
 */
export const ObjectMenu: Story = {
  loaders: [() => openProjects("empty")],
  render: () => <StartWindow />,
  play: async () => {
    await openMenu("Object")
  }
}

/**
 * Right-click on the empty canvas: New screen and New component, made where you right-clicked, then Insert and Paste
 * here. Select all and Zoom to fit are unavailable until something's on the canvas.
 */
export const CanvasMenu: Story = {
  loaders: [() => openProjects("empty")],
  render: () => <StartWindow />,
  play: async () => {
    const box = await canvasBox()
    await rightClick({ x: box.left + box.width * 0.12, y: box.top + box.height * 0.12 })
  }
}

/** Right-click on the canvas around screens and components: the same menu, with Select all and Zoom to fit available. */
export const CanvasMenuAroundDesigns: Story = {
  loaders: [() => openProjects("example")],
  render: () => <StartWindow />,
  play: async () => {
    await frameDesigns("Pricing")
    const board = document.querySelector(`[data-design="${CSS.escape(design("Pricing"))}"]`)?.getBoundingClientRect()
    const box = await canvasBox()
    if (!board) throw new Error("Pricing isn't on the canvas")
    await rightClick({ x: (box.left + board.left) / 2, y: board.top + board.height / 2 })
  }
}

/** Search actions (Ctrl K), searched for "new": New screen and New component, with their keys, in the Object group. */
export const SearchActions: Story = {
  loaders: [() => openProjects("empty")],
  render: () => <StartWindow search="new" />,
  play: async () => {
    openDialog("actions")
    const dialog = await body().findByRole("dialog", { name: "Search actions" })
    await expect(within(dialog).getByRole("option", { name: /^New screen/ })).toBeVisible()
  }
}

/**
 * Layers on its own, in a project with nothing yet: each group's + shows without hovering, and its empty row is a
 * button that makes the first one. The count is left out at none, since the row says so.
 */
export const Layers: Story = {
  loaders: [() => openProjects("empty")],
  render: () => (
    <ProjectStage project="empty">
      <StartLeftPanel />
    </ProjectStage>
  )
}

/** Layers' + focused from the keyboard: its tooltip names it and gives its keys. */
export const LayersPlusFocused: Story = {
  loaders: [() => openProjects("empty")],
  render: () => (
    <ProjectStage project="empty">
      <StartLeftPanel />
    </ProjectStage>
  ),
  play: async () => {
    const screens = await body().findByRole("region", { name: "Screens" })
    within(screens).getByRole("button", { name: "New screen" }).focus()
    await body().findByRole("tooltip")
  }
}

/** Layers with screens and components: the + still shows beside each heading, after the count. */
export const LayersWithScreensAndComponents: Story = {
  loaders: [() => openProjects("example")],
  render: () => (
    <ProjectStage project="example">
      <StartLeftPanel />
    </ProjectStage>
  )
}

/**
 * The inspector on its own, on an empty canvas: nothing to select, so it says how to start and what it will show,
 * with New screen and New component and their keys.
 */
export const Inspector: Story = {
  loaders: [() => openProjects("empty")],
  render: () => (
    <ProjectStage project="empty" className="flex h-screen justify-end bg-background text-foreground">
      <StartInspectorPanel />
    </ProjectStage>
  )
}

/**
 * The inspector once there's something on the canvas, with nothing selected: it asks for a screen or component, in
 * the glossary's words, rather than a design.
 */
export const InspectorNothingSelected: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      example().selection.set({})
    }
  ],
  render: () => (
    <ProjectStage project="example" className="flex h-screen justify-end bg-background text-foreground">
      <StartInspectorPanel />
    </ProjectStage>
  )
}
