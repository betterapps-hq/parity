import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { SpacingPreview } from "./box-model.tsx"
import { Playground } from "./playground.tsx"
import { type Sides, sideRules, sidesWrites } from "./sides-writes.ts"
import { FourSidesField } from "./sides.tsx"

/**
 * Stroke's Width (PAR-186, PAR-652's Four sides), as a border: one field for every side, and each side once Each side,
 * at the end of the name's row, is pressed. It opens pressed when the sides differ, and the one field says Mixed if
 * they still differ when it's closed. A width is a whole pixel (`border-2`; 1 is `border`), a border-width token, or a
 * value off the steps. Up and Down go a pixel, Shift ten. It writes the fewest classes, shorthand first (`border-x
 * border-y-2`).
 */
const meta = {
  title: "Parity/Inspector/Rows/Stroke width",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const px = (number: number) => ({ number })

function StrokeWidth({ start, mixed = [] }: { start: Sides; mixed?: boolean[] }) {
  const [sides, setSides] = useState(start)
  const [mixedNow, setMixed] = useState(mixed)
  const [hover, setHover] = useState<number[]>()

  return (
    <Playground
      writes={sidesWrites("border", sides, mixedNow)}
      preview={<SpacingPreview border={sides} hover={hover && { box: "border", sides: hover }} />}
    >
      <PanelSection title="Stroke">
        <FourSidesField
          label="Width"
          rules={sideRules.border}
          together="one"
          sides={sides}
          mixed={mixedNow}
          onChange={(next, cleared) => {
            setSides(next)
            setMixed((current) => current.map((was, index) => was && !cleared.includes(index)))
          }}
          onHover={setHover}
        />
      </PanelSection>
    </Playground>
  )
}

/** 1 on every side: `border`. */
export const AllSides: Story = { render: () => <StrokeWidth start={[px(1), px(1), px(1), px(1)]} /> }

/** The bottom alone: Each side opens to show it, writing `border-b`. */
export const BottomOnly: Story = { render: () => <StrokeWidth start={[undefined, undefined, px(1), undefined]} /> }

/** 2 down and 1 across: Each side opens to show them, writing `border-x border-y-2`, the fewest classes. */
export const VerticalAndHorizontal: Story = { render: () => <StrokeWidth start={[px(2), px(1), px(2), px(1)]} /> }

/** Each side its own: four fields in CSS's order. */
export const Custom: Story = { render: () => <StrokeWidth start={[px(1), px(2), px(3), px(4)]} /> }

/** The project's thick border-width token: `border-(length:--border-width-thick)`. */
export const Token: Story = {
  render: () => (
    <StrokeWidth
      start={[
        { token: "border-width-thick" },
        { token: "border-width-thick" },
        { token: "border-width-thick" },
        { token: "border-width-thick" }
      ]}
    />
  )
}

/** 1.5, off the whole pixels: no mark, and Tokens offers the nearest token first, writing `border-[1.5px]`. */
export const OffTheSteps: Story = { render: () => <StrokeWidth start={[px(1.5), px(1.5), px(1.5), px(1.5)]} /> }

/** The selected layers' left widths differ: Each side opens, and Left shows Mixed. */
export const MixedLeft: Story = {
  render: () => <StrokeWidth start={[px(1), px(1), px(1), undefined]} mixed={[false, false, false, true]} />
}

/** `-1` typed and Enter pressed: a stroke can't be negative, so it's refused, with the reason under the row. */
export const InvalidAsTyped: Story = {
  render: () => <StrokeWidth start={[px(1), px(1), px(1), px(1)]} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Width" })
    await userEvent.clear(field)
    await userEvent.type(field, "-1{Enter}")
  }
}
