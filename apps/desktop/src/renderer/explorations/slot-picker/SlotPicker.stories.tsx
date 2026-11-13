import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { slowly } from "../../chrome/inspector-stories.tsx"
import { filledInstance } from "../../chrome/layer-stories.tsx"
import { SlotPickerWorkspace } from "./workspace.tsx"

/**
 * The slot picker as an autocomplete (PAR-1046). Pricing's Starter plan is selected: an instance of Plan card, whose
 * `features` slot holds a line of text and whose `pricing` slot is empty. Focusing a slot's box lists what can go in,
 * under Components, the project's components, and On this screen, the layers of Pricing, nested as Layers nests them.
 * Typing searches both, and picking one fills the slot: a component as a new instance of it, a layer moved in. Dragging
 * a layer from Layers onto the box fills it too. The shipped Layers selects a row as it starts dragging it, which would
 * swap the inspector away from the instance, so here a drag keeps the selection.
 *
 * The list stays within the screen: it leaves out Pricing's root, Starter plan's ancestors (Plans area and Plans),
 * Starter plan itself and what's in it, and Plan card, which can't hold itself. Layers and the Component instance
 * section are the shipped ones, and every pick changes the design, so Layers shows the layer moving into the slot.
 */
const meta = {
  title: "Parity/Explorations/Pick what fills a slot",
  parameters: { layout: "fullscreen" },
  args: { dragOver: undefined },
  argTypes: { dragOver: { control: "select", options: [undefined, "features", "pricing"] } },
  render: (args) => <SlotPickerWorkspace dragOver={args.dragOver} />,
  loaders: [filledInstance()]
} satisfies Meta<{ dragOver?: string }>

export default meta

type Story = StoryObj<typeof meta>

/** Focuses a slot's box, which opens its list. */
async function open(canvasElement: HTMLElement, slot: string): Promise<void> {
  const input = await within(canvasElement).findByRole("combobox", { name: `Add to ${slot}` }, slowly)
  input.scrollIntoView({ block: "center" })
  await userEvent.click(input)
}

/** Starter plan selected: `features` holds Unlimited viewers, and `pricing` is empty, with the box's prompt. */
export const Closed: Story = {}

/**
 * The empty `pricing` slot's box focused: Components lists the project's components but Plan card, and On this
 * screen lists Pricing's layers, nested, without its root, Plans area, Plans or Starter plan.
 */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    await open(canvasElement, "Pricing")
    const list = await within(document.body).findByRole("listbox", undefined, slowly)
    // The list fades in, so it's checked for what it holds rather than for being seen yet.
    await expect(await within(list).findByRole("option", { name: "Stat card" }, slowly)).toBeInTheDocument()
    await expect(within(list).getByRole("option", { name: "Pro plan" })).toBeInTheDocument()
    await expect(within(list).queryByRole("option", { name: "Plan card" })).toBeNull()
    await expect(within(list).queryByRole("option", { name: "Plans area" })).toBeNull()
    await expect(within(list).queryByRole("option", { name: "Starter plan" })).toBeNull()
  }
}

/**
 * “button” typed: the Button component, and the six buttons in Pricing's nav, flat now that they're matches, each after
 * the layer it's in, Nav links or Nav actions.
 */
export const Searching: Story = {
  play: async ({ canvasElement }) => {
    await open(canvasElement, "Pricing")
    await userEvent.keyboard("button")
    const list = await within(document.body).findByRole("listbox", undefined, slowly)
    await expect(within(list).getAllByRole("option", { name: /Button$/ })).toHaveLength(7)
  }
}

/** Picking Hero's Badge from On this screen moves it into `pricing`: it's a chip there, and Layers shows it moved. */
export const Picked: Story = {
  play: async ({ canvasElement }) => {
    await open(canvasElement, "Pricing")
    await userEvent.keyboard("badge")
    const list = await within(document.body).findByRole("listbox", undefined, slowly)
    await userEvent.click(within(list).getByRole("option", { name: /^Hero.*Badge$/ }))
    await userEvent.keyboard("{Escape}")
    await expect(
      await within(canvasElement).findByRole("button", { name: "Remove Badge from Pricing" }, slowly)
    ).toBeVisible()
  }
}

/**
 * A layer from Layers dragged over the `pricing` slot's box, which lights up to take it. Dropping it moves the layer
 * in, as picking it does; a layer that can't go in, as Plans, is refused with a toast.
 */
export const Dragging: Story = { args: { dragOver: "pricing" } }

/** Open, as in Open, in the light theme. */
export const OpenInLight: Story = { ...Open, globals: { theme: "light" } }
