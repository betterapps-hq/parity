import { layersSelection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { setLayout } from "../../chrome/layout.ts"
import { design, example, layerElement, node, onCanvas } from "../../stories/fixtures.tsx"
import { CodeExploration } from "./CodeExploration.tsx"
import { setPicking } from "./inspect.ts"

/**
 * The inspector's Code tab (PAR-167), set aside on 2026-11-12 with the rest of the code side (PAR-1027) and kept in
 * case it comes back. It stands where the inspector was: the selected component layer's component and file, the
 * elements it draws that the project's files wrote, each with its file and line, and the picked one's lines. Inspect
 * picks an element on the canvas instead, outlined with its file and line. The lines come from the project's dev
 * server, which tags each element its files write.
 */
const meta = {
  title: "Parity/Explorations/Code panel",
  component: CodeExploration
} satisfies Meta<typeof CodeExploration>

export default meta

type Story = StoryObj<typeof meta>

const panel = () => within(document.body)

/** The Code panel in the inspector's place, a layer of the Sign in screen selected, or nothing, and Sign in framed. */
const selecting = (layer: string | undefined, then?: () => Promise<void>) =>
  onCanvas(
    ["Sign in"],
    () => {
      setPicking(false)
      setLayout({ right: false })

      if (layer) {
        example().selection.set(layersSelection(design("Sign in"), [node("Sign in", layer)]))
      }
    },
    then
  )

/** The Code panel. */
async function codePanel(): Promise<HTMLElement> {
  return panel().findByRole("region", { name: "Code" }, { timeout: 10_000 })
}

/**
 * The sign in card, selected: its component and file, the elements it draws with the file and line each is written
 * on, as the code nests them, and the first one's lines, its own highlighted.
 */
export const ComponentLayer: Story = selecting("Sign in card", async () => {
  const section = within(await codePanel())
  await expect(await section.findByText("src/components/ui/card.tsx", undefined, { timeout: 10_000 })).toBeVisible()
  await section.findAllByText(/^card\.tsx:\d+$/, undefined, { timeout: 10_000 })
  await section.findAllByText(/^input\.tsx:\d+$/)
})

/** An element picked from the list, the email field's input: outlined on the canvas, with its lines below. */
export const ElementPicked: Story = selecting("Sign in card", async () => {
  const section = within(await codePanel())
  const row = (await section.findAllByRole("button", { name: /^input\s*input\.tsx:\d+$/ }, { timeout: 10_000 }))[0]!
  await userEvent.click(row)
  await waitFor(() => expect(row).toHaveAttribute("aria-current", "true"))
  await section.findByText(/^input\.tsx:\d+$/, { selector: "[data-slot=code-block-header] *" })
})

/**
 * Inspect on, with the pointer over the email field: the canvas outlines the input the project's `input.tsx` writes,
 * with its tag, file and line. A click would pick it and select the layer it's in.
 */
export const Inspecting: Story = selecting("Sign in card", async () => {
  await userEvent.click(within(await codePanel()).getByRole("button", { name: /Inspect/ }))
  const input = layerElement("Sign in", "Sign in card").querySelector("input")

  if (!input) {
    throw new Error("The sign in card draws no input")
  }

  const box = input.getBoundingClientRect()
  input.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      composed: true,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2
    })
  )
  const overlay = document.querySelector<HTMLElement>("[data-inspect-overlay]")!
  await within(overlay).findByText(/^input\.tsx:\d+$/, undefined, { timeout: 5000 })
})

/** A library's component, the sign in error's alert: it's from the library, so its elements have no lines here. */
export const LibraryComponent: Story = selecting("Sign in error", async () => {
  await within(await codePanel()).findByText(/so its elements have no lines in the project/)
})

/** Nothing selected: the panel says what to select, and Inspect picks an element on the canvas instead. */
export const NothingSelected: Story = selecting(undefined, async () => {
  await within(await codePanel()).findByText("Select a component")
})

/**
 * Picking with nothing selected: Inspect, then a click on the email field selects the layer the input is in and shows
 * where the input is written.
 */
export const PickedOnCanvas: Story = selecting(undefined, async () => {
  await userEvent.click(await within(await codePanel()).findByRole("button", { name: /Inspect/ }))
  const input = layerElement("Sign in", "Sign in card").querySelector("input")

  if (!input) {
    throw new Error("The sign in card draws no input")
  }

  const box = input.getBoundingClientRect()
  const at = { bubbles: true, cancelable: true, composed: true, button: 0, pointerId: 1, isPrimary: true }
  const point = { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }
  input.dispatchEvent(new PointerEvent("pointermove", { ...at, ...point }))
  input.dispatchEvent(new PointerEvent("pointerdown", { ...at, ...point, buttons: 1 }))
  const code = within(await codePanel())
  await code.findByText(/^input\.tsx:\d+$/, { selector: "[data-slot=code-block-header] *" }, { timeout: 5000 })
})

/** A text layer, the terms under the card: Parity's own layer, drawn from the design file, has no line to show. */
export const ParityLayer: Story = selecting("Terms", async () => {
  await within(await codePanel()).findByText(/is Parity's own layer/)
})
