/**
 * Where among a layout's children a dragged or dropped layer lands, from where the pointer is. Only geometry, so the
 * rules are tested without a canvas: the canvas measures the boxes and passes them in.
 */

/** A box, as `getBoundingClientRect` gives one. */
export type Rect = Pick<DOMRectReadOnly, "left" | "top" | "right" | "bottom">

export interface Point {
  x: number
  y: number
}

/** How a layout places its children: along a row or a column, and whether they go on to further lines. */
export interface Flow {
  direction: "row" | "column"
  wraps: boolean
}

/**
 * A layout's flow, from its computed style. A grid fills a row at a time (or a column, flowing by columns), line after
 * line, as a wrapping flex box does, so both are found the same way.
 */
export function flowOf(style: {
  display: string
  flexDirection: string
  flexWrap: string
  gridAutoFlow: string
}): Flow {
  if (style.display.includes("grid")) {
    return { direction: style.gridAutoFlow.includes("column") ? "column" : "row", wraps: true }
  }
  if (style.display.includes("flex")) {
    return {
      direction: style.flexDirection.startsWith("column") ? "column" : "row",
      wraps: style.flexWrap.startsWith("wrap")
    }
  }
  return { direction: "column", wraps: false }
}

export interface SlotChild {
  /** Among all the layout's children. */
  index: number
  box: Rect
}

export interface Slot {
  /** Among the layout's children as they are before the move. */
  index: number
  /** The line that marks it, in the boxes' coordinates. */
  line: { x: number; y: number; w: number; h: number }
}

/**
 * The slot under a point. First the line of children the point is on: a grid's row, a wrapping layout's line, or the
 * nearest one when it's between them; past the last line, the slot is the end. Then, along that line, before the first
 * child whose middle is past the point, or after the line's last child. `children` are in the layout's order, without
 * the layers being moved, and `count` is how many children the layout has in all.
 */
export function slotAt(children: readonly SlotChild[], point: Point, flow: Flow, layout: Rect, count: number): Slot {
  const row = flow.direction === "row"
  const axis = row ? axes.row : axes.column
  const lines: readonly (readonly SlotChild[])[] = flow.wraps ? linesOf(children, axis) : [children]
  const across = axis.cross(point)
  const final = lines.at(-1)!
  const pastEnd = flow.wraps && final.length > 0 && across > Math.max(...final.map((child) => axis.crossEnd(child.box)))
  const line = pastEnd ? final : lineAt(lines, across, axis)
  const along = axis.main(point)
  const before = pastEnd ? undefined : line.find((child) => along < (axis.start(child.box) + axis.end(child.box)) / 2)
  const last = line.at(-1)
  // After a line's last child is before the next line's first; after the last line's, the end.
  let index = count
  if (before) index = before.index
  else if (last && line !== lines.at(-1)) index = last.index + 1
  return { index, line: marker(before, last, row, flow.wraps, layout) }
}

interface Axis {
  main(point: Point): number
  cross(point: Point): number
  start(box: Rect): number
  end(box: Rect): number
  crossStart(box: Rect): number
  crossEnd(box: Rect): number
}

const axes: Record<"row" | "column", Axis> = {
  row: {
    main: (point) => point.x,
    cross: (point) => point.y,
    start: (box) => box.left,
    end: (box) => box.right,
    crossStart: (box) => box.top,
    crossEnd: (box) => box.bottom
  },
  column: {
    main: (point) => point.y,
    cross: (point) => point.x,
    start: (box) => box.top,
    end: (box) => box.bottom,
    crossStart: (box) => box.left,
    crossEnd: (box) => box.right
  }
}

/**
 * Children split into the lines they're drawn on. A child starts a new line when it doesn't follow the one before along
 * the layout's direction (it went back to the start), or when it's past everything on the line so far across it.
 */
function linesOf(children: readonly SlotChild[], axis: Axis): SlotChild[][] {
  const lines: SlotChild[][] = []
  let crossStart = 0
  let crossEnd = 0
  for (const child of children) {
    const line = lines.at(-1)
    const previous = line?.at(-1)
    const wrapped =
      !line ||
      !previous ||
      axis.start(child.box) <= axis.start(previous.box) ||
      (crossEnd > crossStart && axis.crossStart(child.box) >= crossEnd - 0.5)
    if (wrapped) {
      lines.push([child])
      crossStart = axis.crossStart(child.box)
      crossEnd = axis.crossEnd(child.box)
    } else {
      line.push(child)
      crossStart = Math.min(crossStart, axis.crossStart(child.box))
      crossEnd = Math.max(crossEnd, axis.crossEnd(child.box))
    }
  }
  return lines.length > 0 ? lines : [[]]
}

/** The line a point is on across the layout's direction: the last one spanning it, else the nearest. */
function lineAt(lines: readonly (readonly SlotChild[])[], across: number, axis: Axis): readonly SlotChild[] {
  const spans = lines.map((line) => ({
    line,
    start: Math.min(...line.map((child) => axis.crossStart(child.box))),
    end: Math.max(...line.map((child) => axis.crossEnd(child.box)))
  }))
  const spanning = spans.findLast((span) => span.start <= across && across <= span.end)
  if (spanning) return spanning.line
  const distance = (span: (typeof spans)[number]) => Math.max(span.start - across, across - span.end)
  return spans.reduce((nearest, span) => (distance(span) < distance(nearest) ? span : nearest)).line
}

/**
 * The line that marks a slot: before a child or after the line's last, as tall as it in a row; across the whole layout
 * in a column, or as wide as the child when a column wraps; near the start when the layout is empty.
 */
function marker(
  before: SlotChild | undefined,
  last: SlotChild | undefined,
  row: boolean,
  wraps: boolean,
  layout: Rect
): Slot["line"] {
  const reference = before ?? last
  if (row) {
    let x = layout.left + 4
    if (before) x = before.box.left - 2
    else if (last) x = last.box.right + 1
    return reference
      ? { x, y: reference.box.top, w: 2, h: reference.box.bottom - reference.box.top }
      : { x, y: layout.top + 4, w: 2, h: Math.max(8, layout.bottom - layout.top - 8) }
  }
  let y = layout.top + 4
  if (before) y = before.box.top - 2
  else if (last) y = last.box.bottom + 1
  return wraps && reference
    ? { x: reference.box.left, y, w: reference.box.right - reference.box.left, h: 2 }
    : { x: layout.left + 4, y, w: Math.max(8, layout.right - layout.left - 8), h: 2 }
}
