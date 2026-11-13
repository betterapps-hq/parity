import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, userEvent, within } from "storybook/test"
import { Changed as MarkChanged } from "./field-parts.tsx"
import { Field, FieldGrid, type Segment, Segments } from "./field-row.tsx"
import { Playground } from "./playground.tsx"

/**
 * A choice of one from a few, as segments in a box, the chosen one raised (`Segments`). Unset, the option it comes to
 * anyway shows faintly. They share the row's width, or fit their content. One Tab stop; the arrow keys move between
 * the options, Home and End go to the first and last, and Enter or Space chooses.
 */
const meta = {
  title: "Parity/Fields/Segments",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

type Wrap = "wrap" | "nowrap" | "balance" | "pretty"

const wraps: Segment<Wrap>[] = [
  { value: "wrap", label: "Wrap", detail: "text-wrap" },
  { value: "nowrap", label: "No wrap", detail: "text-nowrap" },
  { value: "balance", label: "Balance", detail: "text-balance" },
  { value: "pretty", label: "Pretty", detail: "text-pretty" }
]

/** Text wrap, kept here, with what it writes. */
function TextWrap({ start, fit = false }: { start: Wrap | undefined; fit?: boolean }) {
  const [wrap, setWrap] = useState(start)

  return (
    <Playground
      writes={
        wrap === undefined
          ? { stored: undefined, css: [], tailwind: [] }
          : { stored: { value: wrap }, css: [`text-wrap: ${wrap}`], tailwind: [`text-${wrap}`] }
      }
    >
      <FieldGrid>
        <Field label="Text wrap">
          <Segments label="Text wrap" value={wrap} faint="wrap" fit={fit} options={wraps} onChange={setWrap} />
        </Field>
      </FieldGrid>
    </Playground>
  )
}

/** Balance chosen. */
export const Set: Story = { render: () => <TextWrap start="balance" /> }

/** Set, with what it stores and writes as CSS and Tailwind beside it, updated as it's used. */
export const Demo: Story = { ...Set, parameters: { demo: true } }

/** Unset: Wrap, what it comes to anyway, shows faintly. */
export const Unset: Story = { render: () => <TextWrap start={undefined} /> }

/** Fitting their content rather than the row's width. */
export const Fit: Story = { render: () => <TextWrap start="balance" fit /> }

/** The arrow keys move from Balance to Pretty, and Enter chooses it. */
export const ChoosingByKeyboard: Story = {
  render: () => <TextWrap start="balance" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    canvas.getByRole("button", { name: "Balance" }).focus()
    await userEvent.keyboard("{ArrowRight}{Enter}")
    await expect(canvas.getByRole("button", { name: "Pretty" })).toHaveAttribute("aria-pressed", "true")
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
