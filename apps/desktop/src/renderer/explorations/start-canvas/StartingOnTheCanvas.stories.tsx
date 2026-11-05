import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { openDialog } from "../../chrome/app-dialogs.ts"
import { design, example, findTooltip, frameDesigns, openProjects, ProjectStage } from "../../stories/fixtures.tsx"
import { StartInspectorPanel, StartLeftPanel, StartWindow } from "./StartWindow.tsx"

/**
 * Making a screen or component in one visible step, as the new-user audit proposes (PAR-529, "Making something is
 * always one visible step"): New screen and New component are in File, Object, the canvas's right-click menu and
 * Search actions, each with its keys; Layers' + always shows and its empty rows make the first one; and the inspector
 * asks for a screen or component rather than a design. Everything is the app's own but the proposed parts, and they
 * work: New screen makes a real one. The start in the middle of an empty canvas was dropped (PAR-560), since every
 * project opens on a screen.
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

/** File: New screen and New component first, with their keys, above opening and saving. */
export const FileMenu: Story = {
  loaders: [() => openProjects("example")],
  render: () => <StartWindow />,
  play: async () => {
    await frameDesigns("Pricing")
    const menu = await openMenu("File")
    await expect(within(menu).getByRole("menuitem", { name: /^New screen/ })).toBeEnabled()
  }
}

/**
 * Object, with nothing selected: New screen, New component and Insert are what can be done, and the hint says what
 * to select for the rest, in the glossary's words.
 */
export const ObjectMenu: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      example().selection.set({})
    }
  ],
  render: () => <StartWindow />,
  play: async () => {
    await frameDesigns("Pricing")
    await openMenu("Object")
  }
}

/**
 * Right-click on the canvas around screens and components: New screen and New component, made where you
 * right-clicked, then Insert, Paste here, Select all and Zoom to fit.
 */
export const CanvasMenu: Story = {
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
  loaders: [() => openProjects("example")],
  render: () => <StartWindow search="new" />,
  play: async () => {
    openDialog("actions")
    const dialog = await body().findByRole("dialog", { name: "Search actions" })
    await expect(within(dialog).getByRole("option", { name: /^New screen/ })).toBeVisible()
  }
}

/**
 * Layers on its own, with no screens or components, as once they're all deleted: each group's + shows without
 * hovering, and its empty row is a button that makes the first one. The count is left out at none, since the row says
 * so.
 */
export const Layers: Story = {
  loaders: [() => openProjects("empty")],
  render: () => (
    <ProjectStage project="empty">
      <StartLeftPanel />
    </ProjectStage>
  )
}

/**
 * Layers' + under the pointer: its tooltip names it and gives its keys. Tabbing to it shows the same tooltip; a story
 * can't, as Base UI opens one on focus only when the browser shows focus, and a script's focus doesn't count.
 */
export const LayersPlusHovered: Story = {
  loaders: [() => openProjects("empty")],
  render: () => (
    <ProjectStage project="empty">
      <StartLeftPanel />
    </ProjectStage>
  ),
  play: async () => {
    const screens = await body().findByRole("region", { name: "Screens" })
    await userEvent.hover(within(screens).getByRole("button", { name: "New screen" }))
    await expect(await findTooltip({ timeout: 8000 })).toHaveTextContent("New screen")
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

/** The inspector with nothing selected: it asks for a screen or component, in the glossary's words, rather than a design. */
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
