import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, userEvent, within } from "storybook/test"
import { type BorderValue, BorderSection, borderWrites, LinePreview } from "./border-outline.tsx"
import { borderComparisons, borderPoints } from "./comparisons.tsx"
import { Playground } from "./playground.tsx"
import type { Sides } from "./sides-writes.ts"

/**
 * Border (PAR-932), what Stroke was when it was in layout, named as CSS names it: a title with + until it's set, which
 * adds `border border-border`, and − takes it off. Its color is a color field; its width is one field, or each side's
 * once Each side is pressed (Stroke width has the field's own stories); its style is Solid, Dashed, Dotted or Double.
 * A border is part of the box, so the preview's card grows and the line under it moves down.
 */
const meta = {
  title: "Parity/Inspector/Rows/Border",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const px = (number: number) => ({ number })
const every = (number: number): Sides => [px(number), px(number), px(number), px(number)]

function Border({ start }: { start: BorderValue }) {
  const [value, set] = useState(start)

  return (
    <Playground
      writes={borderWrites(value)}
      preview={<LinePreview border={value} />}
      comparisons={borderComparisons}
      points={borderPoints}
    >
      <BorderSection value={value} set={set} />
    </Playground>
  )
}

/** The project's usual border on every side: `border border-border`. */
export const AllSides: Story = { render: () => <Border start={{ color: "border", widths: every(1) }} /> }

/** AllSides, with what the control stores and writes as CSS beside it, updated as it's used. */
export const Demo: Story = { ...AllSides, parameters: { demo: true } }

/** A 2px dashed border in the primary color. */
export const Dashed: Story = {
  render: () => <Border start={{ color: "primary", widths: every(2), style: "dashed" }} />
}

/** A border on the bottom only, as a divider: Width opens on each side, since they differ. */
export const BottomOnly: Story = {
  render: () => <Border start={{ color: "border", widths: [undefined, undefined, px(1), undefined] }} />
}

/** No border yet: Border is a title with +, which adds the project's usual one. */
export const Empty: Story = {
  render: () => <Border start={{}} />,
  play: async ({ canvasElement }) => {
    const control = within(canvasElement)
    await userEvent.click(await control.findByRole("button", { name: "Add border" }))
    await expect(control.getByRole("combobox", { name: "Border style" })).toBeVisible()
  }
}
