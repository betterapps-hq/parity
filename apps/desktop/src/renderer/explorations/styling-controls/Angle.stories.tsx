import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { AngleField } from "./angle.tsx"
import { Field } from "./field-row.tsx"
import { type Angle, angleDegrees } from "./motion-data.ts"
import { angleWrites } from "./motion-writes.ts"
import { Playground } from "./playground.tsx"
import { TransformPreview } from "./transform.tsx"
import { mixedWrites } from "./writes.ts"

/**
 * An angle (PAR-652's Angle), as Position's Rotation takes it: degrees with °, clockwise as CSS turns. It's typed as
 * `45`, `45deg`, `0.25turn` or `1rad`, with the app's maths (`+15`, `*2`), and kept in degrees; one read from code keeps
 * its unit until it's edited. Negatives are kept, and angles are never folded into −180 to 180, since a transition to
 * 270° turns the other way from one to −90°. Up and Down step 1°, Shift 15°; the dial beside it is dragged round,
 * Shift snapping to 15°. Whole degrees are a step (`rotate-45`); others are written in brackets.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Angle",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function Rotation({ start, mixed = false }: { start?: Angle; mixed?: boolean }) {
  const [angle, setAngle] = useState(start)
  const writes = mixed && angle === undefined ? mixedWrites : angleWrites(angle)
  return (
    <Playground writes={writes} preview={<TransformPreview value={{}} rotate={angleDegrees(angle)} />}>
      <Field label="Rotation" hint="Clockwise, as CSS turns">
        <AngleField label="Rotation" value={angle} mixed={mixed && angle === undefined} onChange={setAngle} />
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

/** 450°, kept as typed rather than folded to 90°, since a transition to it turns further. */
export const BeyondATurn: Story = { render: () => <Rotation start={{ step: 450 }} /> }

/** Layers with different rotations: Mixed, until an angle is typed for them all. */
export const Mixed: Story = { render: () => <Rotation mixed /> }

/** The dial open: drag round it, past 360° if you like; Shift snaps to 15°, and the arrow keys step it. */
export const Dial: Story = {
  render: () => <Rotation start={{ step: 30 }} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Rotation dial" }))
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
