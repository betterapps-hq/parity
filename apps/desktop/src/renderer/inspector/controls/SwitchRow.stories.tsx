import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { Changed } from "./field-parts.tsx"
import { FieldGrid, SwitchRow } from "./field-row.tsx"

/**
 * A setting that's on or off, as the Design tab draws a boolean prop or Follow shape: its name, and its switch at the
 * end of the row. Clicking the name flips it too.
 */
const meta = {
  title: "Parity/Inspector/Controls/Fields/Switch",
  decorators: [
    (Story) => (
      <div className="w-64 p-4">
        <FieldGrid>
          <Story />
        </FieldGrid>
      </div>
    )
  ]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function Setting({ label, start }: { label: string; start: boolean }) {
  const [checked, setChecked] = useState(start)

  return <SwitchRow label={label} checked={checked} onCheckedChange={setChecked} />
}

/** Off. */
export const Off: Story = { render: () => <Setting label="Follow shape" start={false} /> }

/** On. */
export const On: Story = { render: () => <Setting label="Follow shape" start /> }

/**
 * Changed from what it comes from (PAR-1020): the purple dot on the switch's corner, drawn over its thumb, on or off.
 */
export const SwitchChanged: Story = {
  name: "Changed",
  render: () => (
    <Changed>
      <Setting label="Disabled" start />
      <Setting label="Loading" start={false} />
    </Changed>
  )
}
