import type { Meta, StoryObj } from "@storybook/react-vite"
import { Columns3, Diamond, Rows3, Type } from "lucide-react"
import { type ReactNode, useState } from "react"
import { expect, userEvent, within } from "storybook/test"
import { kindColors } from "../../canvas/kinds.tsx"
import { AppSelect } from "../../chrome/AppSelect.tsx"
import { slowly } from "../../chrome/inspector-stories.tsx"
import { Field, FieldGrid } from "../../inspector/controls/field-row.tsx"
import { TypeTile } from "../../inspector/controls/instance-section.tsx"
import { type OfferedLayer, type PickerLayer, SlotAutocomplete } from "./slot-autocomplete.tsx"

/**
 * The slot picker as an autocomplete (PAR-1046), the field alone. A slot holds one layer at most, shown as a chip.
 * Focusing the field or pressing its chevron lists what can go in, under Components and On this screen, nested as
 * Layers nests them. Typing searches both, and picking one fills the slot in place of what was there. A layer dragged
 * from Layers onto the box fills it too. The list leaves out the screen, the instance's ancestors and the instance
 * itself, so none of those are in it.
 */
const meta = {
  title: "Parity/Explorations/Slot picker",
  args: { layer: undefined, dragOver: false },
  render: function Picker(args) {
    // Room under the field for its list.
    return (
      <div className="pb-80">
        <Slot layer={args.layer} dragOver={args.dragOver} />
      </div>
    )
  }
} satisfies Meta<{ layer?: PickerLayer; dragOver: boolean }>

export default meta

type Story = StoryObj<typeof meta>

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

/** The field in its row, at the inspector's width, filling as it's picked from or dropped on. */
function Slot({ layer: initial, dragOver }: { layer?: PickerLayer; dragOver: boolean }) {
  const [layer, setLayer] = useState(initial)
  const fill = (id: string) => setLayer(layers.find((each) => each.id === id))

  return (
    <div className="w-80">
      <FieldGrid>
        <Field label="Features" icon={<TypeTile type="slot" />}>
          <SlotAutocomplete
            label="Features"
            layer={layer}
            components={components}
            layers={layers.filter((each) => each.id !== layer?.id)}
            onPickComponent={(id) =>
              setLayer({ id, name: components.find((each) => each.id === id)?.name ?? id, icon: instance })
            }
            onPickLayer={fill}
            onDropLayers={(drag) => drag.ids[0] && fill(drag.ids[0])}
            onClear={() => setLayer(undefined)}
            onSelectLayer={() => undefined}
            defaultDragOver={dragOver}
          />
        </Field>
      </FieldGrid>
    </div>
  )
}

const featureList: PickerLayer = { id: "list", name: "Feature list", icon: stack }

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

/** Empty: the slot shows its placeholder, and the field its prompt and chevron. */
export const Empty: Story = {}

/** Filled: its one layer as a chip. The × clears the slot. */
export const Filled: Story = { args: { layer: featureList } }

/** Opened from the chevron: Components, then On this screen, nested as Layers nests them. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const list = await open(canvasElement)
    // The list fades in, so it's checked for what it holds rather than for being seen yet.
    await expect(await within(list).findByRole("option", { name: "Stat card" }, slowly)).toBeInTheDocument()
  }
}

/** “button” typed: the Button component, then each button on the screen after the layer it's in. */
export const Searching: Story = {
  play: async ({ canvasElement }) => {
    const list = await open(canvasElement)
    await userEvent.keyboard("button")
    await expect(within(list).getAllByRole("option", { name: /Button$/ })).toHaveLength(4)
  }
}

/** Hero's Badge picked into the empty slot: it's the chip, and the list closes. */
export const Picked: Story = {
  play: async ({ canvasElement }) => {
    await pick(canvasElement, "badge", /Badge$/)
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

/** A layer from Layers dragged over the field, which lights up to take it. */
export const Dragging: Story = { args: { dragOver: true } }

const sizes = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" }
]

/** A select from the panel, beside the field, to compare the two boxes and their chevrons. */
function Select() {
  const [size, setSize] = useState("md")

  return (
    <div className="w-80">
      <FieldGrid>
        <Field label="Size" icon={<TypeTile type="variant" />}>
          <AppSelect
            variant="panel"
            className="w-full"
            items={sizes}
            value={size}
            onValueChange={(next) => next && setSize(next)}
          />
        </Field>
      </FieldGrid>
    </div>
  )
}

/** The field beside a select from the panel, empty and filled, to compare how they look. */
export const BesideASelect: Story = {
  render: () => (
    <div className="flex flex-col gap-6 pb-80">
      <div className="flex items-start gap-6">
        <Slot dragOver={false} />
        <Select />
      </div>
      <div className="flex items-start gap-6">
        <Slot layer={featureList} dragOver={false} />
        <Select />
      </div>
    </div>
  )
}
