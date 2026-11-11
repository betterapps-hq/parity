import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { AngleField } from "./angle.tsx"
import { Field } from "./field-row.tsx"
import { gradientDirections } from "./lists-data.ts"
import { type Angle, angleDegrees } from "./motion-data.ts"
import { angleWrites } from "./motion-writes.ts"
import { Playground } from "./playground.tsx"
import { TransformPreview } from "./transform.tsx"
import { mixedWrites } from "./writes.ts"

/**
 * An angle (PAR-652's Angle), as Position's Rotation takes it: degrees with °, clockwise as CSS turns. It's typed as
 * `45`, `45deg`, `0.25turn` or `1rad`, with the app's maths (`+15`, `*2`), and kept in degrees; one read from code keeps
 * its unit until it's edited. Negatives are kept, and angles are never folded into −180 to 180, since a transition to
 * 270° turns the other way from one to −90°. The field's angle glyph scrubs it; Up and Down step 1°, Shift 15°. The knob
 * beside it is dragged round to set the angle where it's seen, with no popover, Shift snapping to 15°, and a
 * double-click sets 0°; past 360° it counts the whole turns in its middle. Whole degrees are a step (`rotate-45`); others are written in brackets. A field can wrap within
 * a turn, where only the direction matters, as a gradient's Angle does.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Fields/Angle",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function Rotation({
  start,
  mixed = false,
  wraps = false,
  directions = false
}: {
  start?: Angle
  mixed?: boolean
  wraps?: boolean
  /** Reads a linear gradient's directions, `to right` and the rest, as their angles. */
  directions?: boolean
}) {
  const [angle, setAngle] = useState(start)
  const writes = mixed && angle === undefined ? mixedWrites : angleWrites(angle)
  // Rotation keeps its turns; a field that wraps is one for a direction, as a gradient's Angle.
  const label = wraps ? "Angle" : "Rotation"

  return (
    <Playground writes={writes} preview={<TransformPreview value={{}} rotate={angleDegrees(angle)} />}>
      <Field label={label} hint="Clockwise, as CSS turns">
        <AngleField
          label={label}
          value={angle}
          mixed={mixed && angle === undefined}
          wraps={wraps}
          keywords={directions ? gradientDirections : undefined}
          onChange={setAngle}
        />
      </Field>
    </Playground>
  )
}

/** Unset: 0°, muted, and nothing written. */
export const Unset: Story = { render: () => <Rotation /> }

/** 45°, a step: `rotate-45`. */
export const Step: Story = { render: () => <Rotation start={{ step: 45 }} /> }

/** −12°, kept negative: `-rotate-12`. */
export const Negative: Story = { render: () => <Rotation start={{ step: -12 }} /> }

/** 22.5°, a value of its own: `rotate-[22.5deg]`. */
export const ValueOfItsOwn: Story = { render: () => <Rotation start={{ value: "22.5deg" }} /> }

/** `0.25turn` read from code: shown as 90°, with "as 0.25turn" after it, and written back as it was until it's edited. */
export const ReadFromCode: Story = { render: () => <Rotation start={{ value: "0.25turn" }} /> }

/**
 * 450°, kept as typed rather than folded to 90°, since a transition to it turns further. The knob counts the turn in its
 * middle, with the last 90° as an arc along its rim.
 */
export const BeyondATurn: Story = { render: () => <Rotation start={{ step: 450 }} /> }

/**
 * A field set to wrap, as a gradient's Angle is: from 350°, Shift and Right twice on the knob come to 20°, not 380°.
 * Typed, 370 comes to 10, and −90 to 270.
 */
export const WrapsWithinATurn: Story = {
  render: () => <Rotation start={{ step: 350 }} wraps />,
  play: async ({ canvasElement }) => {
    within(canvasElement).getByRole("slider", { name: "Angle knob" }).focus()
    await userEvent.keyboard("{Shift>}{ArrowRight}{ArrowRight}{/Shift}")
  }
}

/**
 * A linear gradient's Angle, which also reads its directions: they're in the chevron's Options, each with the angle it
 * comes to, `to right` at 90° marked as the one set.
 */
export const GradientDirections: Story = {
  render: () => <Rotation start={{ step: 90 }} wraps directions />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Angle options" }))
  }
}

/** Layers with different rotations: Mixed, until an angle is typed for them all. */
export const Mixed: Story = { render: () => <Rotation mixed /> }

/**
 * The knob from the keyboard: focused, Shift and Right turn it 15° at a time, from 30° to 60°. Dragged round, it goes
 * past 360° if you like.
 */
export const KnobFromTheKeyboard: Story = {
  render: () => <Rotation start={{ step: 30 }} />,
  play: async ({ canvasElement }) => {
    within(canvasElement).getByRole("slider", { name: "Rotation knob" }).focus()
    await userEvent.keyboard("{Shift>}{ArrowRight}{ArrowRight}{/Shift}")
  }
}

/** `0.5turn` typed and Enter pressed: it becomes 180°, a step. */
export const TypedInTurns: Story = {
  render: () => <Rotation />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Rotation" })
    await userEvent.type(field, "0.5turn{Enter}")
  }
}

/** `sideways` typed and Enter pressed: it isn't an angle, so it stays, outlined, with the reason under it. */
export const InvalidAsTyped: Story = {
  render: () => <Rotation start={{ step: 45 }} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Rotation" })
    await userEvent.clear(field)
    await userEvent.type(field, "sideways{Enter}")
  }
}
