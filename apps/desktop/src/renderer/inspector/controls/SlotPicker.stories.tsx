import type { Meta, StoryObj } from "@storybook/react-vite"
import { Columns3, Diamond, Rows3, Type } from "lucide-react"
import { type ReactNode, useState } from "react"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"
import { kindColors } from "../../canvas/kinds.tsx"
import { slowly } from "../../chrome/inspector-stories.tsx"
import { layersMime } from "../../chrome/LayerTree.tsx"
import { Changed as MarkChanged } from "./field-parts.tsx"
import { Field, FieldGrid } from "./field-row.tsx"
import { TypeTile } from "./instance-section.tsx"
import { type OfferedLayer, SlotPickerField, type SlotLayer } from "./slot-picker.tsx"

const icon = (Icon: typeof Rows3, color: string): ReactNode => <Icon className="size-3 shrink-0" style={{ color }} />

const stack = icon(Rows3, kindColors.layer)
const row = icon(Columns3, kindColors.layer)
const text = icon(Type, kindColors.text)
const instance = icon(Diamond, kindColors.component)

const components = [
  { id: "activity-item", name: "Activity item" },
  { id: "app-top-bar", name: "App top bar" },
  { id: "button", name: "Button" },
  { id: "member-row", name: "Member row" },
  { id: "stat-card", name: "Stat card" }
]

/** A screen's layers, as Layers nests them, without the screen, the instance's ancestors or the instance. */
const layers: OfferedLayer[] = [
  { id: "nav", name: "Nav", icon: row, depth: 0 },
  { id: "nav-links", name: "Nav links", icon: row, depth: 1, parent: "Nav" },
  { id: "link-1", name: "Button", icon: instance, depth: 2, parent: "Nav links" },
  { id: "link-2", name: "Button", icon: instance, depth: 2, parent: "Nav links" },
  { id: "nav-actions", name: "Nav actions", icon: row, depth: 1, parent: "Nav" },
  { id: "action-1", name: "Button", icon: instance, depth: 2, parent: "Nav actions" },
  { id: "hero", name: "Hero", icon: stack, depth: 0 },
  { id: "badge", name: "Badge", icon: instance, depth: 1, parent: "Hero" },
  { id: "headline", name: "Headline", icon: text, depth: 1, parent: "Hero" },
  { id: "lede", name: "Lede", icon: text, depth: 1, parent: "Hero" },
  { id: "pro-plan", name: "Pro plan", icon: instance, depth: 0, parent: "Plans" },
  { id: "business-plan", name: "Business plan", icon: instance, depth: 0, parent: "Plans" },
  { id: "footer", name: "Footer", icon: row, depth: 0 },
  { id: "privacy", name: "Privacy", icon: text, depth: 1, parent: "Footer" }
]

const featureList: SlotLayer = { id: "list", name: "Feature list", icon: stack }

/**
 * What fills one of an instance's slots (PAR-1046): its one layer as a chip, picked as from a select. Focusing the field
 * or pressing its chevron lists what can go in, under On this screen, nested as Layers nests them, then Components.
 * Typing searches both, and picking one fills the slot in place of what was there. A layer dragged from Layers onto the
 * box fills it too. Clicking the chip selects its layer; its × clears the slot, so its placeholder shows.
 */
const meta = {
  title: "Parity/Fields/Slot picker",
  args: {
    label: "Features",
    layer: undefined,
    layers,
    components,
    onPickLayer: fn(),
    onPickComponent: fn(),
    onDropLayers: fn(),
    onClear: fn(),
    onSelectLayer: fn()
  },
  render: function Picker(args) {
    const [layer, setLayer] = useState(args.layer)
    const fill = (id: string) => setLayer(layers.find((each) => each.id === id))

    // At the inspector's width, with room under the field for its list.
    return (
      <div className="w-80 pb-80">
        <FieldGrid>
          <Field label={args.label} icon={<TypeTile type="slot" />}>
            <SlotPickerField
              {...args}
              layer={layer}
              layers={layers.filter((each) => each.id !== layer?.id)}
              onPickLayer={(id) => {
                fill(id)
                args.onPickLayer(id)
              }}
              onPickComponent={(id) => {
                setLayer({ id, name: components.find((each) => each.id === id)?.name ?? id, icon: instance })
                args.onPickComponent(id)
              }}
              onDropLayers={(drag) => {
                if (drag.ids[0]) {
                  fill(drag.ids[0])
                }

                args.onDropLayers(drag)
              }}
              onClear={() => {
                setLayer(undefined)
                args.onClear()
              }}
            />
          </Field>
        </FieldGrid>
      </div>
    )
  }
} satisfies Meta<typeof SlotPickerField>

export default meta

type Story = StoryObj<typeof meta>

/** Opens the field's list from its chevron. */
async function open(canvasElement: HTMLElement): Promise<HTMLElement> {
  await userEvent.click(await within(canvasElement).findByRole("button", { name: "Show options" }, slowly))

  return within(document.body).findByRole("listbox", undefined, slowly)
}

/** Picks an option by what it ends with, after typing to find it. */
async function pick(canvasElement: HTMLElement, typed: string, name: RegExp): Promise<void> {
  const list = await open(canvasElement)
  await userEvent.keyboard(typed)
  await userEvent.click(within(list).getByRole("option", { name }))
}

/** Drags Hero's Badge from Layers over the field, and drops it there when `drop` is set. */
function dragBadge(canvasElement: HTMLElement, drop: boolean): void {
  const box = canvasElement.querySelector("[data-slot=combobox-chips]")

  if (!box) {
    throw new Error("The field's box isn't there")
  }

  // A drag the test makes carries what a drag from Layers does, as the browser's own can't be started from a test.
  const dataTransfer = new DataTransfer()
  dataTransfer.setData(layersMime, JSON.stringify({ design: "pricing", ids: ["badge"] }))
  const events = drop ? ["dragenter", "dragover", "drop"] : ["dragenter", "dragover"]

  for (const type of events) {
    box.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }))
  }
}

/** Filled: its layer as a chip. Clicking it selects the layer; the × clears the slot. */
export const Filled: Story = {
  args: { layer: featureList },
  play: async ({ args, canvasElement }) => {
    const box = within(canvasElement)
    await userEvent.click(box.getByText("Feature list"))
    await expect(args.onSelectLayer).toHaveBeenCalledWith("list")
    await userEvent.click(box.getByRole("button", { name: "Clear Features" }))
    await expect(args.onClear).toHaveBeenCalled()
    await expect(args.onSelectLayer).toHaveBeenCalledTimes(1)
    await expect(box.queryByText("Feature list")).toBeNull()
  }
}

/** Opened from the chevron: On this screen, nested as Layers nests them, then Components. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const list = await open(canvasElement)
    // The list fades in, so it's checked for what it holds rather than for being seen yet.
    await expect(await within(list).findByRole("option", { name: "Stat card" }, slowly)).toBeInTheDocument()
    const shown = list.textContent ?? ""
    await expect(shown.indexOf("On this screen")).toBeLessThan(shown.indexOf("Components"))
  }
}

/** “button” typed: each button on the screen after the layer it's in, then the Button component. */
export const Searching: Story = {
  play: async ({ canvasElement }) => {
    const list = await open(canvasElement)
    await userEvent.keyboard("button")
    await expect(within(list).getAllByRole("option", { name: /Button$/ })).toHaveLength(4)
  }
}

/** Hero's Badge picked into the empty slot: it's the chip, and the list closes. */
export const Picked: Story = {
  play: async ({ args, canvasElement }) => {
    await pick(canvasElement, "badge", /Badge$/)
    await expect(args.onPickLayer).toHaveBeenCalledWith("badge")
    await expect(await within(canvasElement).findByRole("button", { name: "Clear Features" }, slowly)).toBeVisible()
    await expect(within(canvasElement).getByText("Badge")).toBeVisible()
  }
}

/** Badge picked while Feature list fills the slot: Badge takes its place, so the slot still holds one layer. */
export const Replaced: Story = {
  args: { layer: featureList },
  play: async ({ canvasElement }) => {
    await pick(canvasElement, "badge", /Badge$/)
    await expect(await within(canvasElement).findByText("Badge", undefined, slowly)).toBeVisible()
    await expect(within(canvasElement).queryByText("Feature list")).toBeNull()
  }
}

/** The Stat card component picked: a new instance of it fills the slot. */
export const PickedComponent: Story = {
  play: async ({ args, canvasElement }) => {
    await pick(canvasElement, "stat", /Stat card$/)
    await expect(args.onPickComponent).toHaveBeenCalledWith("stat-card")
    await expect(await within(canvasElement).findByText("Stat card", undefined, slowly)).toBeVisible()
  }
}

/** A layer from Layers dragged over the field, which lights up to take it. */
export const Dragging: Story = {
  play: async ({ canvasElement }) => {
    dragBadge(canvasElement, false)
    await waitFor(() => expect(canvasElement.querySelector("[data-drop-target]")).not.toBeNull())
  }
}

/** Badge dropped on the field from Layers: it fills the slot, and the field stops lighting up. */
export const Dropped: Story = {
  play: async ({ args, canvasElement }) => {
    dragBadge(canvasElement, true)
    await expect(args.onDropLayers).toHaveBeenCalledWith({ design: "pricing", ids: ["badge"] })
    await expect(await within(canvasElement).findByText("Badge", undefined, slowly)).toBeVisible()
    await expect(canvasElement.querySelector("[data-drop-target]")).toBeNull()
  }
}

/** Changed in the state being edited, or set over what it comes from (PAR-1020): the change mark on its corner. */
export const Changed: Story = {
  ...Filled,
  play: undefined,
  decorators: [
    (Story) => (
      <MarkChanged>
        <Story />
      </MarkChanged>
    )
  ]
}
