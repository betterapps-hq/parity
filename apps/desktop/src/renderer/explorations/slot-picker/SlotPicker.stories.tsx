import type { Meta, StoryObj } from "@storybook/react-vite"
import { Columns3, Diamond, Rows3, Type } from "lucide-react"
import { type ReactNode, useState } from "react"
import { expect, userEvent, within } from "storybook/test"
import { kindColors } from "../../canvas/kinds.tsx"
import { slowly } from "../../chrome/inspector-stories.tsx"
import { Field, FieldGrid } from "../../inspector/controls/field-row.tsx"
import { TypeTile } from "../../inspector/controls/instance-section.tsx"
import { type OfferedLayer, type PickerLayer, SlotAutocomplete } from "./slot-autocomplete.tsx"

/**
 * The slot picker as an autocomplete (PAR-1046), the field alone. Focusing it lists what can go in the slot, under
 * Components and On this screen, nested as Layers nests them. Typing searches both, picking one adds it as a chip, and a
 * layer dragged from Layers onto the box adds it too. The list leaves out the screen, the instance's ancestors and the
 * instance itself, so none of those are in it.
 */
const meta = {
  title: "Parity/Explorations/Slot picker",
  args: { fill: [], dragOver: false },
  render: function Picker(args) {
    return <Slot fill={args.fill} dragOver={args.dragOver} />
  }
} satisfies Meta<{ fill: readonly PickerLayer[]; dragOver: boolean }>

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
function Slot({ fill: initial, dragOver }: { fill: readonly PickerLayer[]; dragOver: boolean }) {
  const [fill, setFill] = useState(initial)
  const add = (picked: readonly PickerLayer[]) => setFill((current) => [...current, ...picked])

  return (
    <div className="w-80 pb-80">
      <FieldGrid>
        <Field label="Features" icon={<TypeTile type="slot" />}>
          <SlotAutocomplete
            label="Features"
            fill={fill}
            components={components}
            layers={layers.filter((layer) => !fill.some((each) => each.id === layer.id))}
            onAddComponent={(id) =>
              add([
                {
                  id: `${id}-${fill.length}`,
                  name: components.find((each) => each.id === id)?.name ?? id,
                  icon: instance
                }
              ])
            }
            onMoveLayers={(ids) => add(layers.filter((layer) => ids.includes(layer.id)))}
            onDropLayers={(drag) => add(layers.filter((layer) => drag.ids.includes(layer.id)))}
            onRemove={(id) => setFill((current) => current.filter((layer) => layer.id !== id))}
            onSelectLayer={() => undefined}
            defaultDragOver={dragOver}
          />
        </Field>
      </FieldGrid>
    </div>
  )
}

/** Focuses the field's input, which opens its list. */
async function open(canvasElement: HTMLElement): Promise<HTMLElement> {
  await userEvent.click(await within(canvasElement).findByRole("combobox", { name: "Add to Features" }, slowly))

  return within(document.body).findByRole("listbox", undefined, slowly)
}

/** Empty: the slot shows its placeholder, and the field its prompt. */
export const Empty: Story = {}

/** Filled: its layers as chips. A chip's × takes it out. */
export const Filled: Story = { args: { fill: [{ id: "list", name: "Feature list", icon: stack }] } }

/** Open: Components, then On this screen, nested as Layers nests them. */
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

/** Hero's Badge picked: it's a chip, and the list no longer offers it. */
export const Picked: Story = {
  play: async ({ canvasElement }) => {
    const list = await open(canvasElement)
    await userEvent.keyboard("badge")
    await userEvent.click(within(list).getByRole("option", { name: /Badge$/ }))
    await userEvent.keyboard("{Escape}")
    await expect(
      await within(canvasElement).findByRole("button", { name: "Remove Badge from Features" }, slowly)
    ).toBeVisible()
  }
}

/** A layer from Layers dragged over the field, which lights up to take it. */
export const Dragging: Story = { args: { dragOver: true } }
