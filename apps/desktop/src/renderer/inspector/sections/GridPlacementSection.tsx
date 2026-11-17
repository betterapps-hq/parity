import { sizeEdit, type StyleValues } from "@parity-app/editor"
import type { Draft } from "../controls/data.ts"
import { useTokens } from "../controls/field-parts.tsx"
import { GridCellSection } from "../controls/grid-cell.tsx"
import { lengthPx, sizeOf, sizeShown } from "../style-values.ts"
import type { SectionProps } from "./section-edits.ts"
import { limits, limitValues, SizeSection } from "./SizeSection.tsx"

/** The grid lines and spans Grid placement changes together, as one edit. */
const cellKeys = ["colSpan", "rowSpan", "colStart", "colEnd", "rowStart", "rowEnd"] as const

/** Across every column or row: from the first line to the last, as `NodeStyle` holds All, which a span can't. */
const isAll = (start: number | undefined, end: number | undefined) => start === 1 && end === -1

/** A span as `NodeStyle` holds it: one, the default, unset. */
const spanStored = (span: Draft["colSpan"]) => (span !== undefined && span !== "all" && span > 1 ? span : undefined)

/**
 * Grid placement, the approved section (PAR-186) for a child of a grid, in Size's place: W and H, the cells it takes
 * as a map of the grid the canvas draws, auto-placed children and all, then where it sits in its cell. It reads and
 * writes the layer's `NodeStyle`: start and end lines, spans, All as lines 1 to -1, and Align and Justify self.
 */
export function GridPlacementSection(props: SectionProps) {
  const { editor, edit } = props
  const { style, parent } = editor.selection
  const { unit } = editor
  const grid = editor.grid?.()
  const spacing = useTokens("spacing").tokens

  // Several layers have no one map to draw; their sizes still change together.
  if (!grid) {
    return <SizeSection {...props} />
  }

  const all = isAll(style.colStart, style.colEnd)
  const allRows = isAll(style.rowStart, style.rowEnd)
  const ends = (!all && style.colEnd !== undefined) || (!allRows && style.rowEnd !== undefined)

  const draft: Draft = {
    colStart: all ? undefined : style.colStart,
    colSpan: all ? "all" : style.colSpan,
    colEnd: all ? undefined : style.colEnd,
    rowStart: allRows ? undefined : style.rowStart,
    rowSpan: allRows ? "all" : style.rowSpan,
    rowEnd: allRows ? undefined : style.rowEnd,
    endLines: ends || undefined,
    childWidth: sizeShown(style.width, unit),
    childHeight: sizeShown(style.height, unit),
    minWidth: lengthPx(style.minWidth, unit, spacing),
    maxWidth: lengthPx(style.maxWidth, unit, spacing),
    minHeight: lengthPx(style.minHeight, unit, spacing),
    maxHeight: lengthPx(style.maxHeight, unit, spacing),
    alignSelf: style.alignSelf,
    justifySelf: style.justifySelf,
    itemsX: grid.items.x,
    itemsY: grid.items.y
  }

  const set = (change: Partial<Draft>) => {
    if (cellKeys.some((key) => key in change) || "endLines" in change) {
      const next = { ...draft, ...change }

      // Choosing End lines leaves All, so the lines it was given stay.
      if (change.endLines) {
        next.colSpan = change.colSpan === "all" ? "all" : undefined
        next.rowSpan = change.rowSpan === "all" ? "all" : undefined
      }

      const across = next.colSpan === "all"
      const down = next.rowSpan === "all"

      const lines = (all: boolean, start: number | undefined, end: number | undefined) =>
        all ? { start: 1, end: -1 } : { start, end: next.endLines ? end : undefined }

      const col = lines(across, next.colStart, next.colEnd)
      const row = lines(down, next.rowStart, next.rowEnd)

      const values: StyleValues = {
        colStart: col.start,
        colEnd: col.end,
        rowStart: row.start,
        rowEnd: row.end,
        // End lines say where it ends, so a span would only be in their way.
        colSpan: across || next.endLines ? undefined : spanStored(next.colSpan),
        rowSpan: down || next.endLines ? undefined : spanStored(next.rowSpan)
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

    for (const { key, row, label } of limits) {
      if (key in change) {
        const px = change[key]
        const verb = px === undefined ? "Remove" : "Change"
        edit(row, limitValues(key, px === undefined ? undefined : px / unit), `${verb} ${label}`)
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
