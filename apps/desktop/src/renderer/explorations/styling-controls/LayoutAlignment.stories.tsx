import type { Meta, StoryObj } from "@storybook/react-vite"
import { layoutComparisons, layoutPoints } from "./comparisons.tsx"
import { LayerPreview } from "./controls.tsx"
import type { Draft } from "./data.ts"
import { LayoutSection } from "./layout-controls.tsx"
import { Playground, useDraft } from "./playground.tsx"
import { layoutWrites } from "./writes.ts"

/**
 * Layout's direction, alignment and gap (PAR-186). Type is Figma's four: Vertical, Horizontal, Wrap and Grid, with
 * Reverse direction beside them. The alignment box draws the children where they'll sit, as bars that run the way the
 * layout does, and shows them faintly at a spot as it's hovered. Clicking the children stretches them, then spreads
 * them out with an Auto gap, then packs them again at the spot clicked, and hovering them shows the next. It's one stop
 * for Tab: arrow keys move them, S stretches them, X spreads them out and B lines up their text. It stays physical when
 * reversed, so its top left is the top left whichever way the layout runs, and what's written flips. Type and Gap sit
 * beside it, and the box is as tall as both. Gap is the field padding uses, with the spacing tokens in its menu. Auto
 * is first there, a row for each way it spreads the children (space between, around or evenly), and set, it's a chip
 * that says which; Backspace takes it off, back to the gap before. Once it wraps, a second gap is between the lines,
 * and Lines says where the lines sit. More holds what's set rarely: wrapping a vertical layout into columns, and lining
 * up text baselines, which the box then draws.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Layout direction and alignment",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function Layout({ start }: { start: Draft }) {
  const [draft, set] = useDraft({ background: "card", radius: "radius-xl", gap: { number: 12 }, ...start })

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

/** Wrap: side by side, running onto new lines 24 pixels apart, the lines packed in the middle. */
export const Wrapping: Story = {
  render: () => <Layout start={{ direction: "row", wrap: true, rowGap: { number: 24 }, lines: "center" }} />
}

/** A gap from a spacing token, shown as a chip: `gap-gutter`. */
export const TokenGap: Story = {
  render: () => <Layout start={{ direction: "row", gap: { token: "spacing-gutter" }, align: "center" }} />
}

/** Spread out by an Auto gap, a chip in Gap: space between them, the first and last at the edges, as Figma's does. */
export const SpreadOut: Story = {
  render: () => <Layout start={{ direction: "row", gap: "auto", align: "center" }} />
}

/** A negative gap overlaps the children, as an avatar stack does, written as a negative margin on each. */
export const Overlapping: Story = {
  render: () => <Layout start={{ direction: "row", gap: { number: -8 }, align: "center" }} />
}

/**
 * Text baselines lined up, from More: the children's text lines up across the row, however large it is
 * (`items-baseline`). The box draws them standing on one line, as text of different sizes does.
 */
export const Baseline: Story = { render: () => <Layout start={{ direction: "row", align: "baseline" }} /> }

/** Lined up by the last line, from More: their last lines line up (`items-baseline-last`). */
export const LastBaseline: Story = { render: () => <Layout start={{ direction: "row", align: "last baseline" }} /> }

/**
 * Reversed: the Reverse direction toggle beside Type is on, and its hint says the reading order no longer matches
 * what's seen. The box's top-left spot still means the top left, so it writes `justify-end`.
 */
export const Reversed: Story = { render: () => <Layout start={{ direction: "row", reverse: true }} /> }

/** Baselines set in a vertical layout do nothing, so More keeps the option only to turn it off, with why. */
export const BaselineDoesNothing: Story = {
  render: () => <Layout start={{ direction: "column", align: "baseline" }} />
}
