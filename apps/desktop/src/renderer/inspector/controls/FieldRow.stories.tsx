import { Button } from "@buildkitgg/shadcn-baseui-kit"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { Plus } from "lucide-react"
import { type ReactNode, useState } from "react"
import { expect, fn, userEvent, within } from "storybook/test"
import { TextInput } from "../../chrome/fields.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { Field, FieldGrid, nameButton } from "./field-row.tsx"

/**
 * One property's row (PAR-1029), which every section's fields sit in: its name above the control, and at the end of the
 * name's row its reset arrow, lock or action. The name names an input inside that has no name of its own. What the
 * fields inside look like is each field's own story.
 */
const meta = {
  title: "Parity/Fields/Parts/Field row",
  component: Field,
  decorators: [
    (Story) => (
      <div className="w-80 p-4">
        <FieldGrid>
          <Story />
        </FieldGrid>
      </div>
    )
  ],
  args: { label: "Label", children: null }
} satisfies Meta<typeof Field>

export default meta

type Story = StoryObj<typeof meta>

/** A row holding a text field, which commits on Enter, as the panel's do. */
function Text({ value: start = "Get started" }: { value?: string }): ReactNode {
  const [value, setValue] = useState(start)

  return <TextInput value={value} onCommit={setValue} />
}

/** A value set: the name above its field, which it names. */
export const Set: Story = {
  render: (args) => (
    <Field {...args}>
      <Text />
    </Field>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("textbox", { name: "Label" })).toHaveValue("Get started")
  }
}

/** What a text field commits, to check that typing alone commits nothing. */
const committed = fn()

/** Typing in the field: nothing is committed until Enter, which commits what was typed. */
export const Typing: Story = {
  render: (args) => (
    <Field {...args}>
      <TextInput value="Get started" onCommit={committed} />
    </Field>
  ),
  play: async ({ canvasElement }) => {
    committed.mockClear()
    const field = within(canvasElement).getByRole("textbox", { name: "Label" })
    await userEvent.type(field, " today")
    await expect(committed).not.toHaveBeenCalled()
    await userEvent.keyboard("{Enter}")
    await expect(committed).toHaveBeenCalledWith("Get started today")
  }
}

/** Changed in the state being edited: the field has the change dot, and the arrow puts the first state's value back. */
export const ChangedInAState: Story = {
  render: function Changed(args) {
    const [changed, setChanged] = useState(true)

    return (
      <Field {...args} changed={changed} onReset={() => setChanged(false)}>
        <Text />
      </Field>
    )
  },
  play: async ({ canvasElement }) => {
    const row = within(canvasElement)
    await userEvent.click(row.getByRole("button", { name: "Reset Label to Default" }))
    await expect(row.queryByRole("button", { name: "Reset Label to Default" })).toBeNull()
  }
}

/** Several layers with different values: the field reads Mixed, and the name's hint says why. */
export const Mixed: Story = {
  args: { mixed: true },
  render: (args) => (
    <Field {...args}>
      <Text value="" />
    </Field>
  )
}

/** A name too long for the row truncates, and shows whole on hover. */
export const LongName: Story = {
  args: { label: "data-testid-for-the-checkout-flow" },
  render: (args) => (
    <Field {...args}>
      <Text value="checkout" />
    </Field>
  )
}

/** Two half rows side by side, as Opacity sits beside Radius. */
export const HalfRows: Story = {
  render: () => (
    <>
      <Field label="Width" half>
        <Text value="240px" />
      </Field>
      <Field label="Height" half>
        <Text value="Hug" />
      </Field>
    </>
  )
}

/** A button at the end of the name's row, as Grid's Add a column. */
export const WithAnAction: Story = {
  args: {
    label: "Columns",
    action: (
      <Hint label="Add a column">
        <Button variant="ghost" size="icon" className={nameButton} aria-label="Add a column">
          <Plus />
        </Button>
      </Hint>
    )
  },
  render: (args) => (
    <Field {...args}>
      <Text value="1fr 1fr" />
    </Field>
  )
}

/** Set by a typography preset: locked to it, with the lock at the end of the name's row. Unlocking makes it editable. */
export const LockedToAPreset: Story = {
  args: { label: "Line height" },
  render: function Locked(args) {
    const [open, setOpen] = useState(false)

    return (
      <Field {...args} lock={{ preset: "Body", open, onOpenChange: setOpen }}>
        <Text value="1.5" />
      </Field>
    )
  }
}

/** Unlocked and set over the preset: the field has the change dot, and the arrow puts the preset's value back. */
export const OverridingAPreset: Story = {
  args: { label: "Line height", overrides: "Body", onReset: () => undefined },
  render: (args) => (
    <Field {...args}>
      <Text value="1.75" />
    </Field>
  )
}

/** A value that changes with the viewport: the dot after the name, whose hint lists the others. */
export const ChangesWithTheViewport: Story = {
  args: { label: "Font size", viewports: "Tablet: 16px\nPhone: 14px" },
  render: (args) => (
    <Field {...args}>
      <Text value="18px" />
    </Field>
  )
}
