import type { Meta, StoryObj } from "@storybook/react-vite"
import { LayerPreview, LayoutSection } from "./controls.tsx"
import type { Draft, Track } from "./data.ts"
import { Playground, useDraft } from "./playground.tsx"
import { layoutWrites } from "./writes.ts"

/**
 * A grid's tracks (PAR-186), in Layout once Type is Grid. Columns is a count until a track is edited; then each track
 * is a chip that opens to its size: Fill (a share of what's left, `minmax(0, 1fr)` so long content can't widen it), a
 * fixed length, Hug, Min or Max content, or a range from a length up to a share. The last button adds a track. Repeat
 * to fit lays out as many columns as fit, each at least the width given (CSS's auto-fit). Rows are added as children
 * need them until one is set.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Grid tracks",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const fill = (value = 1): Track => ({ kind: "fr", value })

function Tracks({ start }: { start: Draft }) {
  const [draft, set] = useDraft({ background: "card", radius: "radius-xl", ...start })
  return (
    <Playground writes={layoutWrites(draft)} preview={<LayerPreview draft={draft} />}>
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

/** Repeat to fit: as many columns as fit, each at least 160 pixels wide. */
export const RepeatToFit: Story = { render: () => <Tracks start={{ columns: { fit: 160 }, rows: [] }} /> }
