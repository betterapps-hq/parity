import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { ChildSizeSection, LayerPreview } from "./controls.tsx"
import type { Draft, Track } from "./data.ts"
import { Playground, useDraft } from "./playground.tsx"
import { placementWrites } from "./writes.ts"

/**
 * A grid child's size and place (PAR-186), as Size shows them for Pro plan, a child of Plans' three-column grid: W and
 * H, Align self and Justify self, then Span with the start lines beside it. A negative line counts from the end. End
 * lines, from More, place it by its end lines instead of a span.
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
    columns: [fill, fill, fill],
    rows: [],
    ...start
  })
  const [selected, setSelected] = useState(true)
  return (
    <Playground
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

/** Unset: it fills its cell, at the grid's next free one, and nothing is written. */
export const Unset: Story = { render: () => <Placement start={{}} /> }
