import { sizeEdit, type StyleValues } from "@parity-app/editor"
import type { NodeStyle } from "@parity-app/style-schema"
import type { Draft } from "../controls/data.ts"
import { GridCellSection } from "../controls/grid-cell.tsx"
import { sizeOf, sizeShown } from "../style-values.ts"
import type { SectionProps } from "./section-edits.ts"

/** The grid lines and spans Grid placement changes together, as one edit. */
const cellKeys = ["colSpan", "rowSpan", "colStart", "colEnd", "rowStart", "rowEnd"] as const

/** Across every column: from the first line to the last, as `NodeStyle` holds All, which a span can't. */
const isAll = (style: NodeStyle) => style.colStart === 1 && style.colEnd === -1

/** A span as `NodeStyle` holds it: one, the default, unset. */
const spanStored = (span: Draft["colSpan"]) => (span !== undefined && span !== "all" && span > 1 ? span : undefined)

/**
 * Grid placement, the approved section (PAR-186) for a child of a grid, in Size's place: W and H, the cells it takes
 * as a map of the grid the canvas draws, auto-placed children and all, then where it sits in its cell. It reads and
 * writes the layer's `NodeStyle`: start and end lines, spans, All as lines 1 to -1, and Align and Justify self.
 */
export function GridPlacementSection({ editor, edit }: SectionProps) {
  const { style, parent } = editor.selection
  const { unit } = editor
  const grid = editor.grid?.()

  if (!grid) {
    return null
  }

  const all = isAll(style)
  const ends = !all && (style.colEnd !== undefined || style.rowEnd !== undefined)

  const draft: Draft = {
    colStart: all ? undefined : style.colStart,
    colSpan: all ? "all" : style.colSpan,
    colEnd: all ? undefined : style.colEnd,
    rowStart: style.rowStart,
    rowSpan: style.rowSpan,
    rowEnd: style.rowEnd,
    endLines: ends || undefined,
    childWidth: sizeShown(style.width, unit),
    childHeight: sizeShown(style.height, unit),
    alignSelf: style.alignSelf,
    justifySelf: style.justifySelf,
    itemsX: grid.items.x,
    itemsY: grid.items.y
  }

  const set = (change: Partial<Draft>) => {
    if (cellKeys.some((key) => key in change) || "endLines" in change) {
      const next = { ...draft, ...change }
      const across = next.colSpan === "all"
      let colEnd = next.endLines ? next.colEnd : undefined

      if (across) {
        colEnd = -1
      }

      const values: StyleValues = {
        colStart: across ? 1 : next.colStart,
        colEnd,
        rowStart: next.rowStart,
        rowEnd: next.endLines ? next.rowEnd : undefined,
        // End lines say where it ends, so a span would only be in their way.
        colSpan: across || next.endLines ? undefined : spanStored(next.colSpan),
        rowSpan: next.endLines ? undefined : spanStored(next.rowSpan)
      }

      edit("cells", values, "Change grid cells")
    }

    for (const [key, axis] of [
      ["childWidth", "width"],
      ["childHeight", "height"]
    ] as const) {
      if (key in change) {
        const size = change[key]
        edit(axis, sizeEdit(axis, size === undefined ? undefined : sizeOf(size, unit), parent), `Change ${axis}`)
      }
    }

    if ("alignSelf" in change) {
      edit("self", { alignSelf: change.alignSelf }, "Change align self")
    }

    if ("justifySelf" in change) {
      edit("justifySelf", { justifySelf: change.justifySelf }, "Change justify self")
    }
  }

  const measured = (axis: "width" | "height") => {
    const steps = editor.measure(axis, (exact) => exact)

    return steps === undefined ? undefined : Math.round(steps * unit)
  }

  const width = measured("width")
  const height = measured("height")

  return (
    <GridCellSection
      draft={draft}
      set={set}
      grid={grid}
      measured={width === undefined || height === undefined ? undefined : { width, height, parent: width }}
    />
  )
}
