import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { Num } from "./controls.tsx"
import { Field } from "./field-row.tsx"
import { Playground } from "./playground.tsx"
import { lengthWrites, type Writes } from "./writes.ts"

/**
 * The number field (PAR-186), which every length and count in these controls uses: committed on Enter or on leaving,
 * with a short label inside that scrubs when dragged, and a unit after it that stays while typing, until what's typed
 * brings its own. A length takes the app's maths and units (`+8`, `*2`, `1.5rem`, `spacing-4`) and is kept in pixels,
 * shown in px or rem as chosen from its unit's menu. A spacing length steps a whole spacing step (4px) on Up and Down;
 * others step by 1, or 10 with Shift. A narrow field keeps its unit too. What it can't read stays, outlined, with the
 * reason under it; Escape or leaving puts the value back and says so.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Number field",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function NumberField({
  label,
  inner,
  start,
  pixels = false,
  spacing = false,
  narrow = false,
  placeholder,
  min,
  writes
}: {
  label: string
  inner?: string
  start: number | undefined
  pixels?: boolean
  spacing?: boolean
  narrow?: boolean
  placeholder?: string
  min?: number
  writes: (value: number | undefined) => Writes
}) {
  const [value, setValue] = useState(start)
  return (
    <Playground writes={writes(value)}>
      <Field label={label}>
        <div className={narrow ? "w-20" : undefined}>
          <Num
            label={label}
            inner={inner}
            pixels={pixels}
            spacing={spacing}
            narrow={narrow}
            value={value}
            placeholder={placeholder}
            min={min}
            onChange={setValue}
          />
        </div>
      </Field>
    </Playground>
  )
}

const columnsWrites = (count: number | undefined): Writes =>
  count === undefined
    ? { stored: undefined, css: [], tailwind: [] }
    : {
        stored: { value: count },
        css: [`grid-template-columns: repeat(${count}, minmax(0, 1fr))`],
        tailwind: [`grid-cols-${count}`]
      }

/** A spacing length, Gap at 16 pixels: Up makes it 20, a whole step. Type `+8`, `*2`, `1.5rem` or `spacing-6`. */
export const SpacingLength: Story = {
  render: () => <NumberField label="Gap" start={16} pixels spacing writes={(px) => lengthWrites("gap", "gap", px)} />
}

/** Shown in rem, 40rem: rem chosen from the unit's menu, and the value kept in pixels either way. */
export const InRem: Story = {
  render: () => (
    <NumberField label="Max width" start={640} pixels writes={(px) => lengthWrites("max-width", "max-w", px)} />
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Max width unit: px" }))
    // The menu opens in a portal, outside the story's canvas.
    await userEvent.click(await within(document.body).findByRole("menuitemradio", { name: /^rem/ }))
  }
}

/** A narrow field, as a side's padding is: the unit still shows, and its message spans the row. */
export const Narrow: Story = {
  render: () => (
    <NumberField
      label="Top padding"
      inner="T"
      start={12}
      pixels
      spacing
      narrow
      writes={(px) => lengthWrites("padding-top", "pt", px)}
    />
  )
}

/** A count, Columns: whole numbers only, at least 1, stepping by 1. */
export const Count: Story = {
  render: () => <NumberField label="Columns" start={3} min={1} writes={columnsWrites} />
}

/** Unset, with what it is unset in its placeholder: a frame's height hugs. */
export const Unset: Story = {
  render: () => (
    <NumberField
      label="Height"
      inner="H"
      start={undefined}
      pixels
      placeholder="Hug"
      writes={(px) => lengthWrites("height", "h", px)}
    />
  )
}

/** `wide` typed and Enter pressed: it isn't a length, so it stays, outlined, with the reason under it. */
export const InvalidAsTyped: Story = {
  render: () => <NumberField label="Gap" start={16} pixels spacing writes={(px) => lengthWrites("gap", "gap", px)} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Gap" })
    await userEvent.clear(field)
    await userEvent.type(field, "wide{Enter}")
  }
}
