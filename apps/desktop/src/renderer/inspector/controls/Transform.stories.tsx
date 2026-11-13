import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import type { TransformValue } from "./motion-data.ts"
import { transformWrites } from "./motion-writes.ts"
import { Playground } from "./playground.tsx"
import { TransformPreview, TransformSection } from "./transform.tsx"

/**
 * Transform (PAR-652), on its own: a title with + until something in it is set. Move takes X and Y in any length,
 * `spacing-4` for a step, or a percentage of the layer's own size; Scale is a percentage, X and Y linked by a lock, with
 * Flip horizontally and Flip vertically; Origin is the nine-spot box. They're fixed rows, since CSS applies translate,
 * rotate and scale in its own order; Rotation is Position's. The preview draws the card moved and scaled over an
 * outline of where the layout puts it, since nothing around it moves.
 */
const meta = {
  title: "Parity/Inspector/Rows/Transform",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function Transform({ start }: { start: TransformValue }) {
  const [value, setValue] = useState(start)

  return (
    <Playground writes={transformWrites(value)} preview={<TransformPreview value={value} />}>
      <TransformSection value={value} onChange={setValue} />
    </Playground>
  )
}

/** Nothing set: Transform is a title with +, which shows its rows. */
export const Empty: Story = { render: () => <Transform start={{}} /> }

/** Moved 16px right, a spacing step, and up by half its own height: `translate-x-4 -translate-y-1/2`. */
export const Move: Story = { render: () => <Transform start={{ moveX: { px: 16 }, moveY: { percent: -50 } }} /> }

/** Scaled to 105%, X and Y together: `scale-105`. */
export const Scale: Story = { render: () => <Transform start={{ scaleX: 105, scaleY: 105 }} /> }

/** X and Y apart, 90% by 110%: `scale-x-90 scale-y-110`. */
export const ScaleApart: Story = {
  render: () => <Transform start={{ scaleX: 90, scaleY: 110, scaleLinked: false }} />
}

/** Flipped horizontally, which scales X by −100%: `-scale-x-100`. */
export const Flipped: Story = { render: () => <Transform start={{ flipX: true }} /> }

/** Scaled to 90% about its top left: `scale-90 origin-top-left`. */
export const Origin: Story = { render: () => <Transform start={{ scaleX: 90, scaleY: 90, origin: { x: 0, y: 0 } }} /> }

/** `left` typed into Move X and Enter pressed: it isn't a length, so it stays, outlined, with the reason under it. */
export const InvalidAsTyped: Story = {
  render: () => <Transform start={{ moveX: { px: 16 } }} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Move X" })
    await userEvent.clear(field)
    await userEvent.type(field, "left{Enter}")
  }
}
