import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { AppWindow } from "../App.tsx"
import { layersSelection } from "../selection.ts"
import { design, example, layerElement, node, onCanvas } from "../stories/fixtures.tsx"
import { formatKeys } from "./keys.ts"

/**
 * The canvas's right-click menu (`CanvasMenu`), over the whole window. A right-click on a design selects what's under
 * the pointer first, unless it's inside the selection, then lists what can be done with the selection, each item with
 * its keys; on the canvas around the designs it's short. Each story presses and releases the right button as the mouse
 * does, so tldraw opens the menu as it does in the app.
 */
const meta = {
  title: "Parity/Chrome/Canvas menu",
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

const body = () => within(document.body)
const selected = () => example().selection.get()

/** Presses and releases the right button at a point, as the mouse does. */
function pressRight(point: { x: number; y: number }): void {
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
}

/** Right-clicks at a point, and waits for the menu tldraw opens once the button comes up. */
async function rightClick(point: { x: number; y: number }): Promise<HTMLElement> {
  pressRight(point)
  return body().findByRole("menu", { name: "Canvas" })
}

/** The middle of a layer of the example, as its first frame draws it. */
function middleOf(designName: string, layerName: string): { x: number; y: number } {
  const box = layerElement(designName, layerName).getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

/** A point on the canvas left of a design, clear of every design. */
function leftOf(designName: string): { x: number; y: number } {
  const board = document.querySelector(`[data-design="${CSS.escape(design(designName))}"]`)?.getBoundingClientRect()
  const canvas = document.querySelector(".canvas-area")?.getBoundingClientRect()
  if (!board || !canvas) throw new Error(`${designName} isn't on the canvas`)
  return { x: (canvas.left + board.left) / 2, y: board.top + board.height / 2 }
}

/** What a menu lists: each item's name, `(unavailable)` after one that is, and `---` between sections. */
function items(menu: HTMLElement): string[] {
  return [...menu.querySelectorAll(":scope > [role=menuitem], :scope > [role=separator]")].map((item) => {
    if (item.getAttribute("role") === "separator") return "---"
    const name = [...item.childNodes]
      .filter((child) => !(child instanceof Element && child.matches("[data-slot=context-menu-shortcut], svg")))
      .map((child) => child.textContent)
      .join("")
      .trim()
    return item.hasAttribute("data-disabled") ? `${name} (unavailable)` : name
  })
}

/** The keys an item of a menu shows. */
function keysOf(menu: HTMLElement, name: string): string | undefined {
  const item = within(menu).getByRole("menuitem", { name: new RegExp(`^${name}`) })
  return item.querySelector("[data-slot=context-menu-shortcut]")?.textContent ?? undefined
}

/**
 * A layer, right-clicked with nothing selected: the top-level layer under the pointer is selected, as a click selects
 * it, and the menu acts on it, in the order Figma's does, each item with its keys from the keymap.
 */
export const Layer: Story = onCanvas(["Pricing"], undefined, async () => {
  const menu = await rightClick(middleOf("Pricing", "Headline"))
  await expect(selected()).toMatchObject({ design: design("Pricing"), node: node("Pricing", "Hero") })
  await expect(items(menu)).toEqual([
    "Select layer",
    "---",
    "Copy",
    "Paste here",
    "Paste over selection",
    "Paste to replace",
    "Duplicate",
    "---",
    "Bring to front",
    "Bring forward",
    "Send backward",
    "Send to back",
    "---",
    "Wrap in layout",
    "Make component",
    "---",
    "Hide"
  ])
  await expect(keysOf(menu, "Copy")).toBe(formatKeys("Ctrl C"))
  await expect(keysOf(menu, "Paste to replace")).toBe(formatKeys("Ctrl Shift R"))
  await expect(keysOf(menu, "Paste here")).toBeUndefined()
})

/** An instance, right-clicked beside the one selected: it's selected instead, and the menu goes to its component. */
export const Instance: Story = onCanvas(
  ["Pricing"],
  () => example().selection.set(layersSelection(design("Pricing"), [node("Pricing", "Starter plan")])),
  async () => {
    const menu = await rightClick(middleOf("Pricing", "Pro plan"))
    await expect(selected().node).toBe(node("Pricing", "Pro plan"))
    await expect(items(menu)).toContain("Go to Plan card")
  }
)

/** Several layers, right-clicked on one of them: the selection stays, and what acts on one layer is unavailable. */
export const SeveralLayers: Story = onCanvas(
  ["Pricing"],
  () =>
    example().selection.set(
      layersSelection(design("Pricing"), [
        node("Pricing", "Headline"),
        node("Pricing", "Lede"),
        node("Pricing", "Billing period")
      ])
    ),
  async () => {
    const menu = await rightClick(middleOf("Pricing", "Lede"))
    await expect(selected().nodes).toHaveLength(3)
    await expect(items(menu)).toEqual(
      expect.arrayContaining(["Wrap in layout", "Bring forward (unavailable)", "Make component (unavailable)"])
    )
  }
)

/** A selected design, right-clicked inside: it stays selected, and the menu leaves out what acts on layers. */
export const Design: Story = onCanvas(
  ["Pricing"],
  () => example().selection.set({ design: design("Pricing") }),
  async () => {
    const menu = await rightClick(middleOf("Pricing", "Headline"))
    await expect(selected()).toEqual({ design: design("Pricing") })
    await expect(items(menu)).toEqual([
      "Select layer",
      "---",
      "Copy",
      "Paste here",
      "Paste over selection",
      "Duplicate",
      "---",
      "Make it a component"
    ])
  }
)

/** The canvas around the designs: pasting there, selecting everything and fitting it all in view. */
export const EmptyCanvas: Story = onCanvas(["Pricing"], undefined, async () => {
  const menu = await rightClick(leftOf("Pricing"))
  await expect(items(menu)).toEqual(["Paste here", "---", "Select all", "Zoom to fit"])
})

/**
 * Select layer, on the Pro plan: every layer under the pointer, from the design down into the instance, and the one
 * pointed at outlined on the canvas.
 */
export const SelectLayer: Story = onCanvas(["Pricing"], undefined, async () => {
  const pro = layerElement("Pricing", "Pro plan").getBoundingClientRect()
  await rightClick({ x: pro.left + pro.width / 2, y: pro.top + pro.height * 0.3 })
  await userEvent.click(body().getByRole("menuitem", { name: "Select layer" }))
  const submenu = await body().findByRole("menu", { name: "Select layer" })
  const entries = within(submenu).getAllByRole("menuitem")
  await expect(entries.slice(0, 4).map((entry) => entry.textContent)).toEqual([
    "Pricing",
    "Plans area",
    "Plans",
    "Pro plan"
  ])
  await userEvent.hover(entries[3]!)
  await waitFor(() => expect(example().selection.getHover()?.node).toBe(node("Pricing", "Pro plan")))
})

/** Interacting, a right-click is the design's, and on the canvas around it nothing opens either. */
export const Interacting: Story = onCanvas(
  ["Pricing"],
  () => example().selection.setTool("interact"),
  async () => {
    pressRight(middleOf("Pricing", "Headline"))
    pressRight(leftOf("Pricing"))
    await new Promise((resolve) => setTimeout(resolve, 300))
    await expect(body().queryByRole("menu", { name: "Canvas" })).toBeNull()
  }
)
