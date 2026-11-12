import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, fn, userEvent, within } from "storybook/test"
import { Changed as MarkChanged } from "./field-parts.tsx"
import { Field, FieldGrid } from "./field-row.tsx"
import { SlotPickerField, type SlotLayer } from "./slot-picker.tsx"

/**
 * What fills one of an instance's slots, on the kit's Combobox chips: its one layer as a chip, by the name Layers gives
 * it. The chip's × clears the slot, so its placeholder shows; clicking the chip selects the layer.
 */
const meta = {
  title: "Parity/Inspector/Controls/Fields/Slot picker",
  component: SlotPickerField,
  args: { label: "Features", layer: undefined, onClear: fn(), onSelectLayer: fn() },
  render: function Picker(args) {
    const [layer, setLayer] = useState<SlotLayer | undefined>(args.layer)

    return (
      <div className="w-80 p-4">
        <FieldGrid>
          <Field label={args.label}>
            <SlotPickerField
              {...args}
              layer={layer}
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

/** Empty: the slot's placeholder shows, and the box is empty. */
export const Empty: Story = {}

/** Filled: its layer as a chip. Clicking it selects the layer; the × clears the slot. */
export const Filled: Story = {
  args: { layer: { id: "list", name: "Feature list" } },
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

/** A name too long for the box truncates. */
export const LongName: Story = {
  args: { layer: { id: "list", name: "Everything included in the Business plan, listed" } }
}

/** Filled differently in the state being edited: the box has the change dot. */
export const Changed: Story = {
  args: { layer: { id: "list", name: "Feature list" } },
  decorators: [
    (Story) => (
      <MarkChanged>
        <Story />
      </MarkChanged>
    )
  ]
}
