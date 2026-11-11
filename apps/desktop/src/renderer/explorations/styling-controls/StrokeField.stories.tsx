import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"
import { StrokeSection } from "./controls.tsx"
import type { Draft } from "./data.ts"
import { useTokens } from "./field-parts.tsx"
import { CardPreview, Playground, useDraft } from "./playground.tsx"
import { type Sides } from "./sides-writes.ts"
import { strokeWrites } from "./writes.ts"

/**
 * Stroke (PAR-186, PAR-652's Stroke), on its own: a title with + until it's set, which adds the project's usual stroke,
 * `border-border` at 1px, and − takes it off. Its color is a color field; its width is one field, or each side's once
 * Each side is pressed, taking a whole pixel or a border-width token, with the nearest token offered for a width of
 * its own (Stroke width has the field's own stories). Include in layout is on for a new stroke and writes a border; off, Position draws it as an outline
 * inside, centered on or outside the edge, with an offset of minus the width, minus half of it, or 0 (call 2). An
 * outline has one width, so taking a stroke out of layout makes its sides the widest of them, and sides that differ
 * put it back in layout.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Controls/Stroke",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const px = (number: number) => ({ number })
const every = (number: number): Sides => [px(number), px(number), px(number), px(number)]

function Stroke({ start, tokensOnly }: { start: Draft; tokensOnly?: boolean }) {
  const [draft, set] = useDraft({ background: "card", radius: "radius-xl", ...start })
  const inLayout = draft.strokeInLayout ?? true
  const position = inLayout ? "inside" : (draft.strokePosition ?? "inside")
  const borderWidths = useTokens("borderWidth").tokens

  return (
    <Playground
      writes={strokeWrites(draft, inLayout, position, borderWidths)}
      preview={<CardPreview draft={draft} inLayout={inLayout} position={position} />}
    >
      <StrokeSection draft={draft} set={set} tokensOnly={tokensOnly} />
    </Playground>
  )
}

/** The project's usual stroke on every side: `border border-border`, in layout. */
export const AllSides: Story = { render: () => <Stroke start={{ border: "border", borderWidth: every(1) }} /> }

/** The bottom side only: Each side opens to show it, writing `border-b`. */
export const BottomOnly: Story = {
  render: () => <Stroke start={{ border: "border", borderWidth: [undefined, undefined, px(1), undefined] }} />
}

/** Custom sides: 2px top and bottom, none at the sides, each side's width its own field. */
export const CustomSides: Story = {
  render: () => <Stroke start={{ border: "primary", borderWidth: [px(2), undefined, px(2), undefined] }} />
}

/** Out of layout, outside the edge: an outline at offset 0, so the layer's size doesn't change. */
export const Outside: Story = {
  render: () => (
    <Stroke start={{ border: "primary", borderWidth: every(2), strokeInLayout: false, strokePosition: "outside" }} />
  )
}

/** Out of layout, centered on the edge: an outline offset by minus half its width. */
export const Center: Story = {
  render: () => (
    <Stroke start={{ border: "primary", borderWidth: every(4), strokeInLayout: false, strokePosition: "center" }} />
  )
}

/** No stroke yet: Stroke is a title with +. */
export const Empty: Story = { render: () => <Stroke start={{}} /> }

/** The project's thick border-width token on every side, as its pill: `border-(length:--border-width-thick)`. */
export const WidthToken: Story = {
  render: () => {
    const thick = { token: "border-width-thick" }

    return <Stroke start={{ border: "primary", borderWidth: [thick, thick, thick, thick] }} />
  }
}

/** A color of its own, #2f6fed, with no mark: Tokens offers blue-600, the nearest, first. */
export const PlainColor: Story = { render: () => <Stroke start={{ border: "#2f6fed", borderWidth: every(1) }} /> }

/**
 * Locked to tokens (`tokensOnly`), as a company can ask so its apps match its design language. Unlocked, the default, a
 * stroke takes any color. Its picker is only the tokens, typing searches them, and the blue already there is refused
 * with the nearest token under it.
 */
export const LockedToTokens: Story = {
  render: () => <Stroke start={{ border: "#2f6fed", borderWidth: every(1) }} tokensOnly />
}

/**
 * Out of layout with sides that differ, as a layer can come with: an outline has one width, so it's written at the
 * widest, 3px, `outline-3`, not the top's 1px.
 */
export const OutlineFromUnevenSides: Story = {
  render: () => (
    <Stroke
      start={{
        border: "primary",
        borderWidth: [px(1), px(3), undefined, px(2)],
        strokeInLayout: false,
        strokePosition: "outside"
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText(/\boutline-3\b/).length).toBeGreaterThan(0)
  }
}
