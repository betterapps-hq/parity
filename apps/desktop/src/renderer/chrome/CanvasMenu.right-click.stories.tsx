import { layersSelection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { AppWindow } from "../App.tsx"
import { design, example, layerElement, node, onCanvas } from "../stories/fixtures.tsx"
import { body, items } from "./canvas-menu-stories.tsx"

/**
 * Right-clicking the canvas, over the whole window: what a right-click selects before the canvas menu opens, what its
 * items do where it was opened, and where it opens nothing. Each story presses and releases the right button as the
 * mouse does, so tldraw opens the menu as it does in the app. What the menu lists is in Canvas menu/Items.
 */
const meta = {
  title: "Parity/Chrome/Canvas menu/Right-click",
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

/** A point in the window, in CSS pixels from its top left, as pointer events give one. */
interface ClientPoint {
  x: number
  y: number
}

const selected = () => example().selection.get()

/** Presses and releases the right button at a point, as the mouse does. */
function pressRight(point: ClientPoint): void {
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
async function rightClick(point: ClientPoint): Promise<HTMLElement> {
  pressRight(point)

  return body().findByRole("menu", { name: "Canvas" })
}

/** The middle of a layer of the example, as its first frame draws it. */
function middleOf(designName: string, layerName: string): ClientPoint {
  const box = layerElement(designName, layerName).getBoundingClientRect()

  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

/** A point on the canvas left of a design, clear of every design. */
function leftOf(designName: string): ClientPoint {
  const board = document.querySelector(`[data-design="${CSS.escape(design(designName))}"]`)?.getBoundingClientRect()
  const canvas = document.querySelector(".canvas-area")?.getBoundingClientRect()

  if (!board || !canvas) {
    throw new Error(`${designName} isn't on the canvas`)
  }

  return { x: (canvas.left + board.left) / 2, y: board.top + board.height / 2 }
}

/** On a layer with nothing selected: the top-level layer under the pointer is selected, as a click selects it. */
export const SelectsWhatAClickWould: Story = onCanvas(["Pricing"], undefined, async () => {
  await rightClick(middleOf("Pricing", "Headline"))
  await expect(selected()).toMatchObject({ design: design("Pricing"), node: node("Pricing", "Hero") })
})

/** On an instance beside the one selected: it's selected instead, and the menu goes to its component. */
export const SelectsAnotherInstance: Story = onCanvas(
  ["Pricing"],
  () => example().selection.set(layersSelection(design("Pricing"), [node("Pricing", "Starter plan")])),
  async () => {
    const menu = await rightClick(middleOf("Pricing", "Pro plan"))
    await expect(selected().node).toBe(node("Pricing", "Pro plan"))
    await expect(items(menu)).toContain("Go to Plan card")
  }
)

/** On one of several selected layers: the selection stays, so the menu acts on all of them. */
export const KeepsSeveralLayers: Story = onCanvas(
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
    await rightClick(middleOf("Pricing", "Lede"))
    await expect(selected().nodes).toHaveLength(3)
  }
)

/** Inside a selected design: it stays selected, rather than the layer under the pointer. */
export const KeepsADesign: Story = onCanvas(
  ["Pricing"],
  () => example().selection.set({ design: design("Pricing") }),
  async () => {
    await rightClick(middleOf("Pricing", "Headline"))
    await expect(selected()).toEqual({ design: design("Pricing") })
  }
)

/**
 * New screen, chosen from the menu around the designs: an untitled screen is made with its top left where the canvas
 * was right-clicked, and selected.
 */
export const NewScreenHere: Story = onCanvas(["Pricing"], undefined, async () => {
  const point = leftOf("Pricing")
  const menu = await rightClick(point)
  // Where the right-click was on the page, as the item reads it; the camera may still be settling from framing Pricing.
  const page = example().editor!.screenToPage(point)
  await userEvent.click(within(menu).getByRole("menuitem", { name: /^New screen/ }))

  const made = await waitFor(() => {
    const found = example().store.getEntry(selected().design ?? "")?.container

    if (found?.name !== "Untitled screen") {
      throw new Error("No new screen is selected")
    }

    return found
  })

  await expect(Math.abs(made.position.x - page.x)).toBeLessThan(8)
  await expect(Math.abs(made.position.y - page.y)).toBeLessThan(8)
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

/** The email field of Sign in, right-clicked: the menu ends with Open in editor, at the line the input is written on. */
export const OpenInEditor: Story = onCanvas(["Sign in"], undefined, async () => {
  const input = layerElement("Sign in", "Sign in card").querySelector("input")

  if (!input) {
    throw new Error("The sign in card draws no input")
  }

  const box = input.getBoundingClientRect()
  const menu = await rightClick({ x: box.left + box.width / 2, y: box.top + box.height / 2 })
  const open = within(menu).getByRole("menuitem", { name: /^Open in editor/ })
  await expect(open).toHaveTextContent(/input\.tsx:\d+$/)
})
