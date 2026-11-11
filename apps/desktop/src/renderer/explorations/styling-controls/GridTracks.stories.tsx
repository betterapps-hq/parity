import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { gridTrackComparisons, gridTrackPoints } from "./comparisons.tsx"
import { LayerPreview } from "./controls.tsx"
import type { Draft, Track } from "./data.ts"
import { LayoutSection } from "./layout-controls.tsx"
import { Playground, useDraft } from "./playground.tsx"
import { layoutWrites } from "./writes.ts"

/**
 * A grid's tracks (PAR-186), in Layout once Type is Grid. While every track is the same size, Columns and Rows are each
 * a count and a size side by side, as `grid-cols-3` writes them. The count takes Fit for columns (as many as fit, each
 * at least a width, CSS's auto-fit) and Auto for rows (as many as children need), each a chip saying how many it
 * makes. The size is Fill (a share of what's left, `minmax(0, 1fr)` so long content can't widen it), Hug, a length,
 * Fill with a minimum, or Min or Max content, from its menu or typed. Each column (or Each row), at the name's end as
 * padding's Each side is, lists the tracks one a row: a grip to reorder, the track's number and size, and − to remove,
 * with Add at the name's end; hovering a row highlights its track on the canvas. The grid picker sets both counts at
 * once, as Figma's does. The alignment box says where children sit in their cells, with Type and the gaps beside it.
 * More holds Fill gaps.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Controls/Grid tracks",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const fill = (value = 1): Track => ({ kind: "fr", value })

function Tracks({ start }: { start: Draft }) {
  const [draft, set] = useDraft({ background: "card", radius: "radius-xl", gap: { number: 12 }, ...start })

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

/** Three equal columns, written `grid-cols-3`: a count and a size. Shift+Up on the count adds ten, as every count steps. */
export const EqualColumns: Story = {
  render: () => <Tracks start={{ columns: [fill(), fill(), fill()], rows: [] }} />,
  play: async ({ canvasElement }) => {
    const count = within(canvasElement).getByRole("textbox", { name: "Column count" })
    await userEvent.click(count)
    await userEvent.keyboard("{Shift>}{ArrowUp}{/Shift}")
    await waitFor(() => expect(count).toHaveValue("13"))
    await userEvent.keyboard("{Shift>}{ArrowDown}{/Shift}")
    await waitFor(() => expect(count).toHaveValue("3"))
  }
}

/** Sized tracks, listed one a row: 200 pixels, Fill, and Fill ×2; one row that hugs. */
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
    <Tracks
      start={{
        columns: [fill(), fill(), fill()],
        rows: [],
        itemsX: "center",
        itemsY: "center",
        rowGap: { number: 24 }
      }}
    />
  )
}

/** Fit: as many columns as fit, each at least 160 pixels wide. */
export const RepeatToFit: Story = { render: () => <Tracks start={{ columns: { fit: 160 }, rows: [] }} /> }

/** Rows made as children need them, each filling an equal share: `auto-rows-fr`. */
export const AutoRowsFill: Story = {
  render: () => <Tracks start={{ columns: [fill(), fill(), fill()], rows: [], autoRows: fill() }} />
}

/** Many tracks of different sizes, each on its own row, so every size stays readable. */
export const ManyTracks: Story = {
  render: () => (
    <Tracks
      start={{
        columns: [{ kind: "px", value: 200 }, fill(), fill(2), fill(), { kind: "auto" }, fill(), fill(), fill()],
        rows: [{ kind: "auto" }, fill(), fill(), fill(), fill(), fill(), fill()]
      }}
    />
  )
}
