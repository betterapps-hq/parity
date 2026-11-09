import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { gridPlacementComparisons } from "./comparisons.tsx"
import { LayerPreview } from "./controls.tsx"
import type { Draft, Track } from "./data.ts"
import { ChildSizeSection } from "./layout-controls.tsx"
import { Playground, useDraft } from "./playground.tsx"
import { placementWrites } from "./writes.ts"

/**
 * A grid child's size and place (PAR-186), as Size shows them for Pro plan, a child of Plans' three-column grid: W and
 * H; its cells, as a map of the grid with the other children faint where the browser puts them, which is dragged
 * across to place Pro plan, or dragged to move it; Start and Span for each axis under the map, a negative line
 * counting from the end; and where it sits in its cell, across and down, as icon toggles that show the grid's own
 * faintly while unset. End lines, from More, place it by its end lines instead of a span. Click Pro plan in the
 * preview to see it selected.
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
    gap: 12,
    columns: [fill, fill, fill],
    rows: [],
    ...start
  })
  const [selected, setSelected] = useState(true)
  return (
    <Playground
      comparisons={gridPlacementComparisons}
      writes={placementWrites(draft)}
      preview={<LayerPreview draft={draft} childSelected={selected} onSelectChild={setSelected} />}
    >
      <ChildSizeSection draft={draft} set={set} />
    </Playground>
  )
}

/** Pro plan spans two columns from line 2: `col-span-2 col-start-2`. */
export const SpanAndStart: Story = { render: () => <Placement start={{ colSpan: 2, colStart: 2 }} /> }

/** Across every column, from Span all: `col-span-full`, `1 / -1` in CSS. */
export const AcrossAll: Story = { render: () => <Placement start={{ colSpan: "all" }} /> }

/** Placed by its end lines, from More: from line 2 to line 4, `2 / 4`. */
export const EndLines: Story = {
  render: () => <Placement start={{ endLines: true, colStart: 2, colEnd: 4, rowStart: 2, rowEnd: 3 }} />
}

/** Hugging its content, centered down its cell and at the cell's end across it. */
export const SelfAlignment: Story = {
  render: () => <Placement start={{ childWidth: "hug", childHeight: "hug", alignSelf: "center", justifySelf: "end" }} />
}

/** Unset: it fills its cell, at the grid's next free one, dashed in the map, and nothing is written. */
export const Unset: Story = { render: () => <Placement start={{}} /> }

/** In a grid whose children sit centered in their cells: unset, Pro plan's In its cell shows Center faintly. */
export const FollowsTheGrid: Story = { render: () => <Placement start={{ itemsX: "center", itemsY: "center" }} /> }
