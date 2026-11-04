/**
 * Where among a layout's children a dragged or dropped layer lands, from where the pointer is. Only geometry, so the
 * rules are tested without a canvas: the canvas measures the boxes and passes them in.
 */

/** A box, as `getBoundingClientRect` gives one. */
export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface Point {
  x: number
  y: number
}

/**
 * How a layout places its children on screen, for dropping, dragging and nudging alike (PAR-205): along a row or down a
 * column, whether they go on to further lines, whether each line runs right to left or bottom to top (`reversed`), and
 * whether the lines follow one another upwards or leftwards (`linesReversed`), as `wrap-reverse` and right-to-left
 * columns do. A grid that fills rows has a `stride`, how many places one row down is, when its columns can be counted.
 */
export interface Flow {
  direction: "row" | "column"
  wraps: boolean
  reversed: boolean
  linesReversed: boolean
  stride?: number
}

/** The computed styles of the element a layout's children sit in, as `getComputedStyle` gives them. */
export interface FlowStyle {
  display: string
  flexDirection: string
  flexWrap: string
  gridTemplateColumns: string
  gridAutoFlow: string
  direction: string
}

/**
 * A layout's flow, from its computed style: a flex box, a grid, or blocks one under another. A grid fills a row at a
 * time (or a column, flowing by columns), line after line, as a wrapping flex box does, so both are found the same way.
 * In a right-to-left page a row runs right to left, and so do the lines of a column that wraps. `children` are the
 * boxes of the children in the layout's flow, when they're measured, for counting a grid's columns when its style
 * doesn't (see `trackCount`).
 */
export function flowOf(style: FlowStyle, children: readonly Rect[] = []): Flow {
  const rtl = style.direction === "rtl"
  if (style.display.includes("grid")) {
    if (style.gridAutoFlow.startsWith("column")) {
      return { direction: "column", wraps: true, reversed: false, linesReversed: rtl }
    }
    const stride = trackCount(style.gridTemplateColumns, children)
    return { direction: "row", wraps: true, reversed: rtl, linesReversed: false, ...(stride ? { stride } : {}) }
  }
  if (style.display.includes("flex")) {
    const reversed = style.flexDirection.endsWith("reverse")
    const wraps = style.flexWrap.startsWith("wrap")
    const wrapsBack = style.flexWrap === "wrap-reverse"
    return style.flexDirection.startsWith("row")
      ? { direction: "row", wraps, reversed: reversed !== rtl, linesReversed: wrapsBack }
      : { direction: "column", wraps, reversed, linesReversed: wrapsBack !== rtl }
  }
  return { direction: "column", wraps: false, reversed: false, linesReversed: false }
}

/**
 * How many columns a grid has. Its computed `grid-template-columns` lists them once it's laid out (`120px 120px`), and
 * `repeat(3, …)` says how many before. One that only layout resolves, such as `repeat(auto-fill, …)` before layout or
 * a `subgrid`, is counted from where its children are drawn: one column for each place a child starts. Undefined when
 * neither tells.
 */
function trackCount(columns: string, children: readonly Rect[]): number | undefined {
  const written = writtenTracks(columns)
  if (written) return written
  const starts = new Set(children.map((child) => Math.round(child.left * 2) / 2))
  return starts.size > 0 ? starts.size : undefined
}

/** The tracks a `grid-template-columns` value lists, line names aside; undefined when it takes layout to count them. */
function writtenTracks(value: string): number | undefined {
  let count = 0
  for (const track of topLevel(value.replace(/\[[^\]]*\]/g, " "))) {
    const repeat = /^repeat\(\s*(\d+)\s*,(.*)\)$/s.exec(track)
    if (repeat) {
      const each = writtenTracks(repeat[2]!)
      if (!each) return undefined
      count += Number(repeat[1]) * each
    } else if (/^(repeat\(|subgrid$|none$|masonry$)/.test(track)) {
      return undefined
    } else {
      count += 1
    }
  }
  return count > 0 ? count : undefined
}

/** A value's space-separated parts, keeping what's in parentheses whole: `minmax(0, 1fr) 2fr` is two. */
function topLevel(value: string): string[] {
  const parts: string[] = []
  let depth = 0
  let part = ""
  for (const char of value) {
    if (char === "(") depth++
    if (char === ")") depth--
    if (depth === 0 && /\s/.test(char)) {
      if (part) parts.push(part)
      part = ""
    } else {
      part += char
    }
  }
  if (part) parts.push(part)
  return parts
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
 * the layers being moved, and `count` is how many children the layout has in all. "Past" and "last" go the way the
 * layout runs: leftwards along a right-to-left row, upwards past lines that wrap in reverse.
 */
export function slotAt(children: readonly SlotChild[], point: Point, flow: Flow, layout: Rect, count: number): Slot {
  // Mirrored so the layout runs right and down, the slot is found there and its line mirrored back.
  const row = flow.direction === "row"
  const mirror = {
    x: row ? flow.reversed : flow.wraps && flow.linesReversed,
    y: row ? flow.wraps && flow.linesReversed : flow.reversed
  }
  const slot = forwardSlotAt(
    children.map((child) => ({ index: child.index, box: mirrored(child.box, mirror) })),
    { x: mirror.x ? -point.x : point.x, y: mirror.y ? -point.y : point.y },
    flow,
    mirrored(layout, mirror),
    count
  )
  const { x, y, w, h } = slot.line
  return { index: slot.index, line: { x: mirror.x ? -(x + w) : x, y: mirror.y ? -(y + h) : y, w, h } }
}

/** A box flipped across the axes `mirror` says. */
function mirrored(box: Rect, mirror: { x: boolean; y: boolean }): Rect {
  return {
    left: mirror.x ? -box.right : box.left,
    right: mirror.x ? -box.left : box.right,
    top: mirror.y ? -box.bottom : box.top,
    bottom: mirror.y ? -box.top : box.bottom
  }
}

/** `slotAt` for a layout whose lines run right or down, each after the one before rightwards or downwards. */
function forwardSlotAt(children: readonly SlotChild[], point: Point, flow: Flow, layout: Rect, count: number): Slot {
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
