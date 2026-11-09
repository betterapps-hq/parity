import type { Meta, StoryObj } from "@storybook/react-vite"
import { layoutComparisons, layoutPoints } from "./comparisons.tsx"
import { LayerPreview } from "./controls.tsx"
import type { Draft } from "./data.ts"
import { LayoutSection } from "./layout-controls.tsx"
import { Playground, useDraft } from "./playground.tsx"
import { layoutWrites } from "./writes.ts"

/**
 * Layout's direction, alignment and gap (PAR-186): Type with Wrap beside it, and Reverse direction once it's set from
 * More. The alignment box draws the children where they'll sit, as bars that run the way the layout does, and shows
 * them faintly at a spot as it's hovered; clicking the chosen spot again stretches them. It's one stop for Tab: arrow
 * keys move them, S stretches them, X spreads them out and B lines up their text. It stays physical when reversed, so
 * its top left is the top left whichever way the layout runs, and what's written flips. Gap sits beside it, and its
 * Auto spreads the children, as space between, around or evenly; Baseline is under Gap in a horizontal layout. Once
 * it wraps, a second gap is between the lines, and Lines says where the lines sit.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Layout direction and alignment",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function Layout({ start }: { start: Draft }) {
  const [draft, set] = useDraft({ background: "card", radius: "radius-xl", gap: 12, ...start })
  return (
    <Playground
      comparisons={layoutComparisons}
      points={layoutPoints}
      writes={layoutWrites(draft)}
      preview={<LayerPreview draft={draft} />}
    >
      <LayoutSection draft={draft} set={set} />
    </Playground>
  )
}

/** Vertical, children stretched across: `flex flex-col`, the default. */
export const Vertical: Story = { render: () => <Layout start={{ direction: "column" }} /> }

/** Horizontal, centered both ways from the box's middle spot. */
export const HorizontalCentered: Story = {
  render: () => <Layout start={{ direction: "row", justify: "center", align: "center" }} />
}

/** Horizontal, wrapping onto new lines, 24 pixels apart, the lines packed in the middle. */
export const Wrapping: Story = {
  render: () => <Layout start={{ direction: "row", wrap: true, rowGap: 24, lines: "center" }} />
}

/** Spread out by an Auto gap: space between them, the first and last at the edges, as Figma's Auto gap does. */
export const SpreadOut: Story = {
  render: () => <Layout start={{ direction: "row", gap: "auto", align: "center" }} />
}

/** A negative gap overlaps the children, as an avatar stack does, written as a negative margin on each. */
export const Overlapping: Story = { render: () => <Layout start={{ direction: "row", gap: -8, align: "center" }} /> }

/** Baseline, first line: the children's text lines up across the row, however large it is (`items-baseline`). */
export const Baseline: Story = { render: () => <Layout start={{ direction: "row", align: "baseline" }} /> }

/** Baseline, last line: their last lines line up (`items-baseline-last`). */
export const LastBaseline: Story = { render: () => <Layout start={{ direction: "row", align: "last baseline" }} /> }

/**
 * Reversed, from More: the Reverse toggle shows beside Type, and its hint says the reading order no longer matches
 * what's seen. The box's top-left spot still means the top left, so it writes `justify-end`.
 */
export const Reversed: Story = { render: () => <Layout start={{ direction: "row", reverse: true }} /> }

/** Baseline set in a vertical layout does nothing, so it stays, dimmed, with why in its hint. */
export const BaselineDoesNothing: Story = {
  render: () => <Layout start={{ direction: "column", align: "baseline" }} />
}
