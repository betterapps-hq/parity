/*
 * A grid as Grid placement's map draws it: its columns' widths, how many rows it has, and where each child sits, by
 * the cells it covers. In the app it's read from the canvas, as the browser lays the grid out, auto-placed children
 * included; a story builds one from its stand-in grid.
 */
import type { SelfAlign } from "./controls/data.ts"
import type { Area } from "./controls/layout-controls.tsx"

/** A child of the grid and the cells it covers. */
export interface GridChild {
  id: string
  name: string
  area: Area
  /** The grid places it, in its next free cell, rather than lines of its own. */
  auto: boolean
}

export interface GridLayout {
  /** Each column's share of the grid's width, as the map draws them. */
  weights: number[]
  rows: number
  children: GridChild[]
  /** The selected child's id. */
  self: string
  /** Where the grid puts its children in their cells, across and down, unless one says otherwise. */
  items: { x?: SelfAlign; y?: SelfAlign }
}

/** Tracks' sizes in pixels from a computed `grid-template-columns` or `-rows`: `120px 240.5px`; none for `none`. */
export function trackSizes(template: string): number[] {
  return template
    .split(/\s+/)
    .filter((part) => part.endsWith("px"))
    .map((part) => parseFloat(part))
}

/** Where each track starts and ends, from the grid's content edge, with the gap between tracks. */
function trackEdges(sizes: readonly number[], gap: number): { start: number; end: number }[] {
  let at = 0

  return sizes.map((size) => {
    const edge = { start: at, end: at + size }
    at += size + gap

    return edge
  })
}

/** The tracks a box covers along one axis, from its edges measured from the grid's content edge. */
function covered(edges: readonly { start: number; end: number }[], from: number, to: number) {
  // Half a pixel either way, for the fractions zoom and subpixel layout leave.
  const first = Math.max(
    0,
    edges.findLastIndex((edge) => edge.start <= from + 0.5)
  )
  const last = edges.findIndex((edge) => edge.end >= to - 0.5)

  return { at: first, span: Math.max(1, (last === -1 ? edges.length - 1 : last) - first + 1) }
}

/** A child's box, measured from the grid's content edge, in the grid's own pixels. */
export interface MeasuredChild {
  id: string
  name: string
  auto: boolean
  box: { left: number; top: number; width: number; height: number }
}

/** A computed align or justify keyword as a grid child's place in its cell; `normal` and the like stretch. */
export function selfAlign(keyword: string): SelfAlign | undefined {
  const word = keyword.split(/\s+/).at(-1)

  if (word === "start" || word === "flex-start" || word === "self-start" || word === "left") {
    return "start"
  }

  if (word === "end" || word === "flex-end" || word === "self-end" || word === "right") {
    return "end"
  }

  if (word === "center") {
    return "center"
  }

  return word === "stretch" ? "stretch" : undefined
}

/**
 * The grid as the canvas lays it out: its columns' widths and rows from its computed tracks, and each child's cells
 * from where its box is drawn against them.
 */
export function measuredGrid(grid: {
  columns: readonly number[]
  rows: readonly number[]
  gap: { column: number; row: number }
  children: readonly MeasuredChild[]
  self: string
  items: GridLayout["items"]
}): GridLayout {
  const columns = trackEdges(grid.columns, grid.gap.column)
  const rows = trackEdges(grid.rows, grid.gap.row)

  return {
    weights: [...grid.columns],
    rows: Math.max(1, grid.rows.length),
    self: grid.self,
    items: grid.items,
    children: grid.children.map(({ id, name, auto, box }) => {
      const col = covered(columns, box.left, box.left + box.width)
      const row = covered(rows, box.top, box.top + box.height)

      return { id, name, auto, area: { col: col.at, cols: col.span, row: row.at, rows: row.span } }
    })
  }
}
