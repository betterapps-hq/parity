import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { SpacingPreview } from "./box-model.tsx"
import { Playground } from "./playground.tsx"
import { type Sides, sideRules, sidesWrites } from "./sides-writes.ts"
import { FourSidesField } from "./sides.tsx"

/**
 * Padding (PAR-186, PAR-652's Four sides), in Spacing. It lays out in the shortest form that holds it when the layer
 * is selected, never while editing: one field when every side matches, vertical and horizontal when the pairs do,
 * four otherwise, in CSS's order; a layout shows at least two, as Figma's does. The button after the fields switches
 * forms. Each side takes a spacing step (16 is `p-4`, 13 is `p-3.25`), a spacing token, a percentage of the parent's
 * width, or a value off the steps, marked. Shorthand typed into any field (`8 16`, `8 16 4`) fills every side. Up and
 * Down go a whole step (4px), Shift ten; dragging a field's letter or icon scrubs it; Alt reaches the opposite side
 * too, Alt+Shift all four. Hovering a field highlights its sides in the preview. It writes the fewest classes,
 * shorthand first.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Padding",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const px = (number: number) => ({ number })
const all = (side: Sides[number]): Sides => [side, side, side, side]

function Padding({
  start,
  mixed = [],
  layer = "layout",
  tokensOnly
}: {
  start: Sides
  mixed?: boolean[]
  /** A layout shows at least two fields; a text layer one when every side matches. */
  layer?: "layout" | "text"
  tokensOnly?: boolean
}) {
  const [sides, setSides] = useState(start)
  const [mixedNow, setMixed] = useState(mixed)
  const [hover, setHover] = useState<number[]>()
  return (
    <Playground
      writes={sidesWrites("padding", sides, mixedNow)}
      preview={<SpacingPreview padding={sides} hover={hover && { box: "padding", sides: hover }} />}
    >
      <PanelSection title="Spacing">
        <FourSidesField
          label="Padding"
          rules={sideRules.padding}
          sides={sides}
          mixed={mixedNow}
          atLeastTwo={layer === "layout"}
          tokensOnly={tokensOnly}
          hint="Space inside the layer, between its edge and its content"
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

/** 16 on every side of a layout: two fields, as Figma's, writing `p-4`. */
export const EverySideOnALayout: Story = { render: () => <Padding start={all(px(16))} /> }

/** 16 on every side of a text layer: one field, the shortest form. */
export const OneFieldOnText: Story = { render: () => <Padding start={all(px(16))} layer="text" /> }

/** 8 down and 16 across: `px-4 py-2`, which Tailwind v4 writes as padding-inline and padding-block. */
export const VerticalAndHorizontal: Story = { render: () => <Padding start={[px(8), px(16), px(8), px(16)]} /> }

/** 16 with 24 at the bottom: four fields in CSS's order, writing `p-4 pb-6`, the fewest classes. */
export const FourSides: Story = { render: () => <Padding start={[px(16), px(16), px(24), px(16)]} /> }

/** 13 down, a quarter of the way between whole steps: `py-3.25`, still a step, so unmarked. */
export const QuarterStep: Story = { render: () => <Padding start={[px(13), px(16), px(13), px(16)]} /> }

/** The project's gutter token across: a chip, with what it comes to after it, writing `px-gutter`. */
export const Token: Story = {
  render: () => <Padding start={[px(16), { token: "spacing-gutter" }, px(16), { token: "spacing-gutter" }]} />
}

/** 13.5 down, off the steps: the hollow mark, with the nearest whole step, Create token and Allow here. */
export const OffTheSteps: Story = { render: () => <Padding start={[px(13.5), px(16), px(13.5), px(16)]} /> }

/** 13.5 allowed here, with its reason in the filled mark's hint. */
export const AllowedHere: Story = {
  render: () => (
    <Padding
      start={[
        { number: 13.5, allow: "Lines the text up with the photo" },
        px(16),
        { number: 13.5, allow: "Lines the text up with the photo" },
        px(16)
      ]}
    />
  )
}

/** In a project set to Tokens only, 13.5 is refused, with the nearest step under it. */
export const RefusedByTokensOnly: Story = {
  render: () => <Padding start={[px(13.5), px(16), px(13.5), px(16)]} tokensOnly />
}

/** A deprecated token, `spacing-card`: a warning on the chip names spacing-gutter, and clicking it swaps it in. */
export const DeprecatedToken: Story = {
  render: () => <Padding start={all({ token: "spacing-card" })} layer="text" />
}

/** 5% across: a percentage of Pricing's width, the containing block's, written `px-[5%]`. */
export const Percentage: Story = { render: () => <Padding start={[px(16), { percent: 5 }, px(16), { percent: 5 }]} /> }

/** Unset: 0, muted, and nothing written. Typing pads every side. */
export const Unset: Story = { render: () => <Padding start={all(undefined)} layer="text" /> }

/** The selected layers' top padding differs: four fields, Top showing Mixed. Typing there sets it on every layer. */
export const MixedTop: Story = {
  render: () => <Padding start={[undefined, px(16), px(16), px(16)]} mixed={[true, false, false, false]} />
}

/** `8 16 4` typed into Vertical: CSS's shorthand fills top, sides and bottom, and the fields become four. */
export const ShorthandTyped: Story = {
  render: () => <Padding start={all(px(16))} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Vertical padding" })
    await userEvent.clear(field)
    await userEvent.type(field, "8 16 4{Enter}")
  }
}

/** `wide` typed and Enter pressed: it isn't a length, so it stays, outlined, with the reason under the row. */
export const InvalidAsTyped: Story = {
  render: () => <Padding start={all(px(16))} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Horizontal padding" })
    await userEvent.clear(field)
    await userEvent.type(field, "wide{Enter}")
  }
}
