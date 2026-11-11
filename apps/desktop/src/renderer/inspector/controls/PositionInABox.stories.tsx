import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import type { BoxPoint } from "./css-values.ts"
import { Field } from "./field-row.tsx"
import { positionWrites } from "./motion-writes.ts"
import { Playground } from "./playground.tsx"
import { PositionInBox } from "./position-box.tsx"
import { TransformPreview } from "./transform.tsx"

/**
 * Position in a box (PAR-652), as Transform's Origin, Image's Position and a fill image's position take it: the nine
 * spots, with X and Y beside them in %, or as left, center and right (top, center and bottom for Y). A position off the
 * spots lights none and shows as a dot where it is. Dragging in the box sets any position, Shift snapping to the spots;
 * Tab and Enter choose a spot from the keyboard.
 */
const meta = {
  title: "Parity/Inspector/Controls/Unique/Position in a box",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** A landscape to place in a frame that crops it, so its position shows. */
const landscape = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="#bfdbfe"/><circle cx="80" cy="80" r="44" fill="#ffb900"/><path d="M0 300 L120 180 L220 280 L300 200 L400 300 L400 400 L0 400Z" fill="#009689"/><rect y="340" width="400" height="60" fill="#f54900"/></svg>`
)}`

function Position({ which, start }: { which: "origin" | "object"; start?: BoxPoint }) {
  const [position, setPosition] = useState(start)
  const shown = position ?? { x: 50, y: 50 }

  const preview =
    which === "origin" ? (
      <TransformPreview value={{ scaleX: 80, scaleY: 80, origin: position }} />
    ) : (
      <div className="flex flex-col gap-2">
        <img
          src={landscape}
          alt="A landscape, cropped by its frame"
          className="h-[120px] w-[220px] rounded-lg border object-cover"
          style={{ objectPosition: `${shown.x}% ${shown.y}%` }}
        />
        <p className="type-description text-muted-foreground">Fill (cover) crops it; Position picks what stays.</p>
      </div>
    )

  const label = which === "origin" ? "Origin" : "Position"

  return (
    <Playground writes={positionWrites(which, position)} preview={preview}>
      <Field
        label={label}
        hint={which === "origin" ? "The point it scales and rotates about" : "Which part of the image stays in frame"}
      >
        <PositionInBox label={label} value={position} onChange={setPosition} />
      </Field>
    </Playground>
  )
}

/** A transform's origin, unset: the center, shown faintly, and nothing written. */
export const OriginUnset: Story = { render: () => <Position which="origin" /> }

/** Its top left spot: `origin-top-left`. The preview's card is scaled to 80% about it. */
export const OriginSpot: Story = { render: () => <Position which="origin" start={{ x: 0, y: 0 }} /> }

/** Off the spots, 30% by 70%: no spot lights, a dot shows where it is, and it's written `origin-[30%_70%]`. */
export const OriginOffTheSpots: Story = { render: () => <Position which="origin" start={{ x: 30, y: 70 }} /> }

/** An image's position on a spot, its bottom: `object-bottom`. */
export const ImageSpot: Story = { render: () => <Position which="object" start={{ x: 50, y: 100 }} /> }

/** An image's position off the spots, 25% by 75%: `object-[25%_75%]`. Drag in the box to move it. */
export const ImageOffTheSpots: Story = { render: () => <Position which="object" start={{ x: 25, y: 75 }} /> }

/** `middle` typed into X and Enter pressed: X takes left, center or right, so it stays, with the reason under it. */
export const InvalidAsTyped: Story = {
  render: () => <Position which="origin" start={{ x: 0, y: 0 }} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Origin X" })
    await userEvent.clear(field)
    await userEvent.type(field, "middle{Enter}")
  }
}
