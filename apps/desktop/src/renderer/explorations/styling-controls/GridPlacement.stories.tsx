import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { gridPlacementComparisons, gridPlacementPoints } from "./comparisons.tsx"
import { LayerPreview } from "./controls.tsx"
import type { Draft, Track } from "./data.ts"
import { GridCellSection } from "./grid-cell.tsx"
import { Playground, useDraft } from "./playground.tsx"
import { placementWrites } from "./writes.ts"

/**
 * Grid placement (PAR-186): Pro plan, a child of Plans' three-column grid, as Size shows it. The map is where it's
 * placed: its lines numbered along the top and down the side, Pro plan's own in the layer's color. Drag across cells to
 * place it, drag it to move it, or drag an edge to move that line; a click on a cell moves it there, keeping its span,
 * as the faint outline under the pointer shows. Auto and Manual, beside Cells, say how it's placed: Auto leaves it to
 * the grid's next free cell, and Manual pins it where it is, for the map to move. Under the map, where it sits in its
 * cell is a box of spots, as Layout's is, beside Start and Span for columns and rows, lined up as a table; hovering or
 * focusing a field lights up its line, or the tracks it spans, in the map. Span takes All, a chip, from its menu. W and
 * H show a word as a chip, Fill or Hug, with what it comes to faintly, as Gap's Auto does; the chevron at their end is
 * always there and opens Sizing, and their unit is only ever a unit. A spot on an axis Pro plan fills makes it hug, and
 * Fill stretches it again, so the box and W and H always agree. End lines, from More, place it by its end lines instead
 * of a span. Click Pro plan in the preview to see it selected.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Grid placement",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const fill: Track = { kind: "fr", value: 1 }

function Placement({ start }: { start: Draft }) {
  const [draft, set] = useDraft({
    background: "card",
    radius: "radius-xl",
    gap: { number: 12 },
    columns: [fill, fill, fill],
    rows: [],
    ...start
  })

  const [selected, setSelected] = useState(true)

  return (
    <Playground
      comparisons={gridPlacementComparisons}
      points={gridPlacementPoints}
      writes={placementWrites(draft)}
      preview={<LayerPreview draft={draft} childSelected={selected} onSelectChild={setSelected} />}
    >
      <GridCellSection draft={draft} set={set} />
    </Playground>
  )
}

/** Pro plan spans two columns from line 2: `col-span-2 col-start-2`. Lines 2 and 4, its own, are in its color. */
export const SpanAndStart: Story = { render: () => <Placement start={{ colSpan: 2, colStart: 2 }} /> }

/** Across every column: Span is All, a chip, `col-span-full`, `1 / -1` in CSS. Start says 1, faintly. */
export const AcrossAll: Story = { render: () => <Placement start={{ colSpan: "all" }} /> }

/** Placed by its end lines, from More: from line 2 to line 4, `2 / 4`. The table's second column is End. */
export const EndLines: Story = {
  render: () => <Placement start={{ endLines: true, colStart: 2, colEnd: 4, rowStart: 2, rowEnd: 3 }} />
}

/** Hugging its content at the end of its cell across and centered down: the box shows it there. */
export const InItsCell: Story = {
  render: () => <Placement start={{ childWidth: "hug", childHeight: "hug", alignSelf: "center", justifySelf: "end" }} />
}

/**
 * Unset: it fills its cell at the grid's next free one, dashed in the map and in the box, and Auto is pressed. Start
 * says Auto, with the line it lands on faintly after. Nothing is written.
 */
export const Unset: Story = { render: () => <Placement start={{}} /> }

/** In a grid whose children sit centered in their cells: unset, the box shows Pro plan centered, dashed. */
export const FollowsTheGrid: Story = { render: () => <Placement start={{ itemsX: "center", itemsY: "center" }} /> }

/** A twelve-column grid, numbered 1 to 13 along the top, with Pro plan across 4 to 9. */
export const TwelveColumns: Story = {
  render: () => <Placement start={{ columns: Array.from({ length: 12 }, () => fill), colStart: 4, colSpan: 5 }} />
}

/** Column Start focused: its line, 2, lights up in the map. */
export const PointingAtALine: Story = {
  render: () => <Placement start={{ colSpan: 2, colStart: 2 }} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("textbox", { name: "Column start line" }))
  }
}
