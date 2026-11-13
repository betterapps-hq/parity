import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { RadiusChoice } from "./controls.tsx"
import type { Radius as RadiusValue } from "./data.ts"
import { Changed as MarkChanged } from "./field-parts.tsx"
import { Field } from "./field-row.tsx"
import { Playground } from "./playground.tsx"
import { CardPreview } from "./preview-card.tsx"
import { mixedWrites, radiusWrites } from "./writes.ts"

/**
 * A length that takes tokens (`RadiusChoice`), as Radius is (PAR-186): a radius token or a value of its own in px, or as
 * a percentage of the layer's size, as Framer and Webflow take (`50%`); the unit's menu switches between them, keeping
 * the number. It's typed with the app's maths (`+2`, `*2`, `0.5rem`) and checked by `CSS.supports` before it's stored.
 * Up and Down step a token through the scale. The Radius row around it, with Each corner and Corner shape, is Rows ›
 * Radius.
 */
const meta = {
  title: "Parity/Fields/Token length",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function Radius({ start, tokensOnly, mixed }: { start?: RadiusValue; tokensOnly?: boolean; mixed?: boolean }) {
  const [radius, setRadius] = useState(start)

  return (
    <Playground
      writes={mixed && radius === undefined ? mixedWrites : radiusWrites(radius)}
      preview={<CardPreview draft={{ radius, background: "card" }} />}
    >
      <Field label="Radius">
        <RadiusChoice
          label="Radius"
          value={radius}
          tokensOnly={tokensOnly}
          mixed={mixed && radius === undefined}
          onChange={setRadius}
        />
      </Field>
    </Playground>
  )
}

/** A token, `radius-lg`, as a pill named lg, whose hint says radius-lg and what it comes to. */
export const Token: Story = { render: () => <Radius start="radius-lg" /> }

/** Token, with what the control stores and writes as CSS and Tailwind beside it, updated as it's used. */
export const Demo: Story = { ...Token, parameters: { demo: true } }

/** A value of its own, 12px, with no mark: Tokens offers the nearest (radius-lg) first, then Create token. */
export const PlainValue: Story = { render: () => <Radius start={{ px: 12 }} /> }

/**
 * 50%, typed or from the unit's menu: half the card's width across and half its height down, so the 200 by 120 card is
 * an ellipse (a square would be a circle), written `rounded-[50%]`. Unlike radius-full's pill, it rounds the sides too.
 */
export const Percentage: Story = { render: () => <Radius start={{ percent: 50 }} /> }

/**
 * Locked to tokens (`tokensOnly`), as a company can ask so its apps match its design language. Unlocked, the default, a
 * radius takes any length. Typing searches the radius tokens, with the nearest to a length typed first, and 12px,
 * already there, is refused with the nearest token under it.
 */
export const LockedToTokens: Story = { render: () => <Radius start={{ px: 12 }} tokensOnly /> }

/** Unset: 0, muted. The chevron at its end lists the tokens. */
export const Unset: Story = { render: () => <Radius /> }

/** Layers with different radii: Mixed, until something's typed or chosen for them all. */
export const Mixed: Story = { render: () => <Radius mixed /> }

/** A replaced token, `radius-card`: its pill is amber, and Tokens offers radius-xl in its place first. */
export const Deprecated: Story = { render: () => <Radius start="radius-card" /> }

/** A token the project no longer has, `radius-pill`: its pill is red until another is chosen. */
export const MissingToken: Story = { render: () => <Radius start="radius-pill" /> }

/** `-4` typed and Enter pressed: CSS takes no negative radius, so it's refused, with the reason under it. */
export const InvalidAsTyped: Story = {
  render: () => <Radius start={{ px: 12 }} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Radius" })
    await userEvent.clear(field)
    await userEvent.type(field, "-4{Enter}")
  }
}

/** Changed in the state being edited, or set over what it comes from (PAR-1020): the change mark on its corner. */
export const Changed: Story = {
  ...Token,
  play: undefined,
  decorators: [
    (Story) => (
      <MarkChanged>
        <Story />
      </MarkChanged>
    )
  ]
}
