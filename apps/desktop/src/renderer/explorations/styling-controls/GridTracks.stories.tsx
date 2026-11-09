import type { Meta, StoryObj } from "@storybook/react-vite"
import { gridTrackComparisons, gridTrackPoints } from "./comparisons.tsx"
import { LayerPreview } from "./controls.tsx"
import type { Draft, Track } from "./data.ts"
import { LayoutSection } from "./layout-controls.tsx"
import { Playground, useDraft } from "./playground.tsx"
import { layoutWrites } from "./writes.ts"

/**
 * A grid's tracks (PAR-186), in Layout once Type is Grid. Columns are a strip, each column as wide as it'd be at Plans'
 * width, and each opens to its size: Fill (a share of what's left, `minmax(0, 1fr)` so long content can't widen it), a
 * fixed length, Hug, Min or Max content, or a range from a length up to a share, with Add before, Add after and
 * Remove. The grid picker at the name's end sets columns and rows at once, as Figma's does. Repeat to fit lays out as
 * many columns as fit, each at least the width given (CSS's auto-fit). Rows are added as children need them until one
 * is set. The alignment box says where children sit in their cells, with a gap for columns and one for rows beside
 * it. Switching Type to a flex layout and back keeps the tracks.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Grid tracks",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const fill = (value = 1): Track => ({ kind: "fr", value })

function Tracks({ start }: { start: Draft }) {
  const [draft, set] = useDraft({ background: "card", radius: "radius-xl", gap: 12, ...start })

  return (
    <Playground
      comparisons={gridTrackComparisons}
      points={gridTrackPoints}
      writes={layoutWrites(draft)}
      preview={<LayerPreview draft={draft} />}
    >
      <LayoutSection draft={draft} set={set} />
    </Playground>
  )
}

/** Three equal columns, written `grid-cols-3`. Change the count, or open a track to size it. */
export const EqualColumns: Story = { render: () => <Tracks start={{ columns: [fill(), fill(), fill()], rows: [] }} /> }

/** Sized tracks: 200 pixels, Fill, and Fill ×2; one row that hugs. */
export const SizedTracks: Story = {
  render: () => <Tracks start={{ columns: [{ kind: "px", value: 200 }, fill(), fill(2)], rows: [{ kind: "auto" }] }} />
}

/** A range: at least 120 pixels, and up to a share of what's left, then two Fill tracks. */
export const RangeTrack: Story = {
  render: () => <Tracks start={{ columns: [{ kind: "range", min: 120, max: 1 }, fill(), fill()], rows: [] }} />
}

/** Children centered in their cells, both ways, with more room between the rows than the columns. */
export const CenteredInCells: Story = {
  render: () => (
    <Tracks start={{ columns: [fill(), fill(), fill()], rows: [], itemsX: "center", itemsY: "center", rowGap: 24 }} />
  )
}

/** Repeat to fit: as many columns as fit, each at least 160 pixels wide. */
export const RepeatToFit: Story = { render: () => <Tracks start={{ columns: { fit: 160 }, rows: [] }} /> }
