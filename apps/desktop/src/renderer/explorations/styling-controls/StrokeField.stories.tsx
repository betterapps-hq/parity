import type { Meta, StoryObj } from "@storybook/react-vite"
import { StrokeSection } from "./controls.tsx"
import type { Draft } from "./data.ts"
import { CardPreview, Playground, useDraft } from "./playground.tsx"
import { strokeWrites } from "./writes.ts"

/**
 * Stroke (PAR-186, PAR-652's Stroke), on its own: a title with + until it's set, which adds the project's usual stroke,
 * `border-border` at 1px, and − takes it off. Its color is a color field; its width is one field, or each side's once
 * Each side is pressed. Include in layout is on for a new stroke and writes a border; off, Position draws it as an outline
 * inside, centered on or outside the edge, with an offset of minus the width, minus half of it, or 0 (call 2).
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Stroke",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function Stroke({ start, tokensOnly }: { start: Draft; tokensOnly?: boolean }) {
  const [draft, set] = useDraft({ background: "card", radius: "radius-xl", ...start })
  const inLayout = draft.strokeInLayout ?? true
  const position = inLayout ? "inside" : (draft.strokePosition ?? "inside")
  return (
    <Playground
      writes={strokeWrites(draft, inLayout, position)}
      preview={<CardPreview draft={draft} inLayout={inLayout} position={position} />}
    >
      <StrokeSection draft={draft} set={set} tokensOnly={tokensOnly} />
    </Playground>
  )
}

/** The project's usual stroke on every side: `border border-border`, in layout. */
export const AllSides: Story = { render: () => <Stroke start={{ border: "border", borderWidth: 1 }} /> }

/** The bottom side only: Each side opens to show it, writing `border-b`. */
export const BottomOnly: Story = { render: () => <Stroke start={{ border: "border", borderWidth: [0, 0, 1, 0] }} /> }

/** Custom sides: 2px top and bottom, none at the sides, each side's width its own field. */
export const CustomSides: Story = { render: () => <Stroke start={{ border: "primary", borderWidth: [2, 0, 2, 0] }} /> }

/** Out of layout, outside the edge: an outline at offset 0, so the layer's size doesn't change. */
export const Outside: Story = {
  render: () => (
    <Stroke start={{ border: "primary", borderWidth: 2, strokeInLayout: false, strokePosition: "outside" }} />
  )
}

/** Out of layout, centered on the edge: an outline offset by minus half its width. */
export const Center: Story = {
  render: () => (
    <Stroke start={{ border: "primary", borderWidth: 4, strokeInLayout: false, strokePosition: "center" }} />
  )
}

/** No stroke yet: Stroke is a title with +. */
export const Empty: Story = { render: () => <Stroke start={{}} /> }

/** A color of its own, #2f6fed, with no mark: Tokens offers blue-600, the nearest, first. */
export const PlainColor: Story = { render: () => <Stroke start={{ border: "#2f6fed", borderWidth: 1 }} /> }

/** In a project set to Tokens only, the blue is refused, with the nearest token under it. */
export const RefusedByTokensOnly: Story = {
  render: () => <Stroke start={{ border: "#2f6fed", borderWidth: 1 }} tokensOnly />
}
