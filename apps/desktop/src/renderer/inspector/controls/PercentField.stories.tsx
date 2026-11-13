import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, userEvent, within } from "storybook/test"
import { Changed as MarkChanged } from "./field-parts.tsx"
import { Field, FieldGrid } from "./field-row.tsx"
import { PercentField } from "./number-field.tsx"
import { Playground } from "./playground.tsx"
import { opacityTokens } from "./stand-in-tokens.ts"
import type { Writes } from "./writes.ts"

/**
 * A percentage (`PercentField`), as opacity, a color's alpha, scale and a gradient stop's position take one: it reads
 * `50` or `50%`, steps by 1 (10 with Shift), scrubs by its label, and stops at its range. It can hold an opacity token,
 * whose name typed picks it and which Up and Down step through.
 */
const meta = {
  title: "Parity/Fields/Percent field",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** What Opacity writes: a token by name, or a percentage. */
function opacityWrites(value: number | undefined, token: string | undefined): Writes {
  if (token !== undefined) {
    return { stored: { token }, css: [`opacity: var(--opacity-${token})`], tailwind: [`opacity-${token}`] }
  }

  return value === undefined
    ? { stored: undefined, css: [], tailwind: [] }
    : { stored: { value: `${value}%` }, css: [`opacity: ${value}%`], tailwind: [`opacity-${value}`] }
}

/** Opacity, kept here, with what it writes, offering the opacity tokens. */
function Opacity({ start, token }: { start: number | undefined; token?: string }) {
  const [value, setValue] = useState(start)
  const [current, setCurrent] = useState(token)

  return (
    <Playground writes={opacityWrites(value, current)}>
      <FieldGrid>
        <Field label="Opacity">
          <PercentField
            label="Opacity"
            value={value}
            tokens={{ list: opacityTokens, current, onPick: setCurrent }}
            onChange={(next) => {
              setCurrent(undefined)
              setValue(next)
            }}
          />
        </Field>
      </FieldGrid>
    </Playground>
  )
}

/** 80%. */
export const Set: Story = { render: () => <Opacity start={80} /> }

/** Set, with what it stores and writes as CSS and Tailwind beside it, updated as it's used. */
export const Demo: Story = { ...Set, parameters: { demo: true } }

/** Holding the muted opacity token, as its chip. */
export const Token: Story = { render: () => <Opacity start={undefined} token="muted" /> }

/** Unset: 100 faintly, what it comes to. */
export const Unset: Story = { render: () => <Opacity start={undefined} /> }

/** 150 typed stops at the range's end, 100. */
export const StopsAtItsRange: Story = {
  render: () => <Opacity start={80} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Opacity" })
    await userEvent.tripleClick(field)
    await userEvent.keyboard("150{Enter}")
    await expect(field).toHaveValue("100")
  }
}

/** Changed in the state being edited, or set over what it comes from (PAR-1020): the change mark on its corner. */
export const Changed: Story = {
  ...Set,
  play: undefined,
  decorators: [
    (Story) => (
      <MarkChanged>
        <Story />
      </MarkChanged>
    )
  ]
}
