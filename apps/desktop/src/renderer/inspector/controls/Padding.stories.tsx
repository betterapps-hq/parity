import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { SpacingPreview } from "./box-model.tsx"
import { Playground } from "./playground.tsx"
import { type Sides, sideRules, sidesWrites } from "./sides-writes.ts"
import { FourSidesField } from "./sides.tsx"

/**
 * Padding (PAR-186, PAR-652's Four sides), in Spacing: vertical and horizontal under its name, as Figma's, and each
 * side in CSS's order once Each side, at the end of the name's row, is pressed. It opens pressed when the pairs differ;
 * a pair whose sides differ says Mixed, so closing it never loses a value. Each side takes a spacing step (16 is `p-4`,
 * 13 is `p-3.25`), a spacing token, a percentage of the parent's width, or a value off the steps. Shorthand typed into
 * any field (`8 16`, `8 16 4`) fills every side. Up and Down go a whole step (4px), Shift ten; dragging a field's glyph
 * scrubs it; Alt reaches the opposite side too, Alt+Shift all four. Hovering a field highlights its sides in the
 * preview. It writes the fewest classes, shorthand first.
 */
const meta = {
  title: "Parity/Inspector/Rows/Padding",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const px = (number: number) => ({ number })
const all = (side: Sides[number]): Sides => [side, side, side, side]

function Padding({
  start,
  mixed = [],
  tokensOnly,
  changedSides
}: {
  start: Sides
  mixed?: boolean[]
  tokensOnly?: boolean
  changedSides?: readonly number[]
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
          tokensOnly={tokensOnly}
          changedSides={changedSides}
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

/** 16 on every side: vertical and horizontal, as Figma's, writing `p-4`. */
export const EverySide: Story = { render: () => <Padding start={all(px(16))} /> }

/** EverySide, with what the control stores and writes as CSS and Tailwind beside it, updated as it's used. */
export const Demo: Story = { ...EverySide, parameters: { demo: true } }

/** 8 down and 16 across: `px-4 py-2`, which Tailwind v4 writes as padding-inline and padding-block. */
export const VerticalAndHorizontal: Story = { render: () => <Padding start={[px(8), px(16), px(8), px(16)]} /> }

/** 16 with 24 at the bottom: Each side opens, four fields in CSS's order, writing `p-4 pb-6`, the fewest classes. */
export const FourSides: Story = { render: () => <Padding start={[px(16), px(16), px(24), px(16)]} /> }

/** 13 down, a quarter of the way between whole steps: `py-3.25`, still a step, so unmarked. */
export const QuarterStep: Story = { render: () => <Padding start={[px(13), px(16), px(13), px(16)]} /> }

/** The project's gutter token across: a chip, with what it comes to in its hint, writing `px-gutter`. */
export const Token: Story = {
  render: () => <Padding start={[px(16), { token: "spacing-gutter" }, px(16), { token: "spacing-gutter" }]} />
}

/** 13.5 down, off the steps: no mark, and Tokens offers the nearest token first, then Create token. */
export const OffTheSteps: Story = { render: () => <Padding start={[px(13.5), px(16), px(13.5), px(16)]} /> }

/** 13.5 allowed here, with its reason under Allowed here in Tokens. */
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

/**
 * Locked to tokens (`tokensOnly`), as a company can ask so its apps match its design language. Unlocked, the default, any
 * length goes. A side takes a spacing token or a step on the scale (16), and typing anything else searches the tokens.
 * 13.5, already there, is refused with the nearest step under it.
 */
export const LockedToTokens: Story = {
  render: () => <Padding start={[px(13.5), px(16), px(13.5), px(16)]} tokensOnly />
}

/**
 * Locked to tokens, `1.4rem` typed: it comes to 22.5, off the steps, so the tokens offer spacing-gutter (24), the
 * nearest to what it comes to.
 */
export const LockedNearestToken: Story = {
  render: () => <Padding start={all(px(16))} tokensOnly />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Locked, the field searches the tokens, so it's a combobox.
    const field = canvas.getByRole("combobox", { name: "Vertical padding" })
    await userEvent.clear(field)
    await userEvent.type(field, "1.4rem")
    await expect(await canvas.findByRole("option", { name: /gutter/ })).toBeVisible()
    await expect(canvas.queryByRole("option", { name: /inset/ })).toBeNull()
  }
}

/** A replaced token, `spacing-card`: its pill is amber, and Tokens offers spacing-gutter in its place first. */
export const DeprecatedToken: Story = {
  render: () => <Padding start={all({ token: "spacing-card" })} />
}

/** 5% across: a percentage of Pricing's width, the containing block's, written `px-[5%]`. */
export const Percentage: Story = { render: () => <Padding start={[px(16), { percent: 5 }, px(16), { percent: 5 }]} /> }

/** 5% across, its glyph dragged 20 screen pixels right: a percent each, so 25%, still a percentage. */
export const PercentageScrubbed: Story = {
  render: () => <Padding start={[px(16), { percent: 5 }, px(16), { percent: 5 }]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const field = canvas.getByRole("textbox", { name: "Horizontal padding" })
    const glyph = field.parentElement?.querySelector(".cursor-ew-resize")

    if (!glyph) {
      throw new Error("Horizontal padding has no glyph to drag")
    }

    const { left, top } = glyph.getBoundingClientRect()
    const at = (x: number) => ({ bubbles: true, button: 0, pointerId: 1, clientX: left + x, clientY: top + 4 })
    glyph.dispatchEvent(new PointerEvent("pointerdown", at(2)))
    glyph.dispatchEvent(new PointerEvent("pointermove", at(22)))
    glyph.dispatchEvent(new PointerEvent("pointerup", at(22)))
    await waitFor(() => expect(field).toHaveValue("25"))
    await expect(canvas.getAllByText(/px-\[25%\]/).length).toBeGreaterThan(0)
  }
}

/** Unset: 0, muted, and nothing written. Typing pads every side. */
export const Unset: Story = { render: () => <Padding start={all(undefined)} /> }

/** The selected layers' top padding differs: Each side opens, Top showing Mixed. Typing there sets it on every layer. */
export const MixedTop: Story = {
  render: () => <Padding start={[undefined, px(16), px(16), px(16)]} mixed={[true, false, false, false]} />
}

/** `8 16 4` typed into Vertical: CSS's shorthand fills top, sides and bottom, and Each side opens to show them. */
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

/**
 * One side changed from what it comes from (PAR-1020), 24 at the bottom: the dot marks that side's field alone, so a
 * row of several fields says which one changed.
 */
export const OneSideChanged: Story = {
  render: () => <Padding start={[px(16), px(16), px(24), px(16)]} changedSides={[2]} />
}
