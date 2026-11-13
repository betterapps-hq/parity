import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { Field, FieldGrid, IconSegments } from "./field-row.tsx"
import { layoutTypes } from "./layout-controls.tsx"

/** A choice of one drawn as icons in a row, each named in its hint, as Layout's Type is. */
const meta = {
  title: "Parity/Inspector/Fields/Icon segments",
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

type LayoutType = (typeof layoutTypes)[number]["value"]

function LayoutType({ start }: { start?: LayoutType }) {
  const [type, setType] = useState(start)

  return (
    <Field label="Type">
      <IconSegments label="Type" value={type} options={layoutTypes} onChange={setType} />
    </Field>
  )
}

/** Vertical pressed. */
export const Chosen: Story = { render: () => <LayoutType start="column" /> }

/** Unset, as for layers that differ: none pressed. */
export const Unset: Story = { render: () => <LayoutType /> }
