/*
 * A grid as Grid placement's map draws it: its columns' widths, how many rows it has, and where each child sits, by
 * the cells it covers. In the app it's read from the canvas, as the browser lays the grid out, auto-placed children
 * included; a story builds one from its stand-in grid.
 */

/** Where a grid child sits in its cells along one axis. */
export type SelfAlign = "start" | "center" | "end" | "stretch"

/** The cells a child covers: its first column and row, counted from 0, and how many of each. */
export interface Area {
  col: number
  row: number
  cols: number
  rows: number
}

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

/** How a grid shares out room its tracks leave along one axis: its `justify-content` or `align-content`, and that room. */
export interface Distribution {
  /** The computed keyword: `normal`, `center`, `end`, `space-between` and the like. */
  content: string
  /** The grid's content box along the axis, in its own pixels. */
  size: number
}

/** Where the first track starts and what goes between tracks beyond the gap, as the browser shares out spare room. */
function shared(count: number, used: number, distribution: Distribution | undefined) {
  const room = distribution ? Math.max(0, distribution.size - used) : 0
  const word = distribution?.content.split(/\s+/).at(-1)

  if (room === 0 || count === 0) {
    return { offset: 0, between: 0 }
  }

  if (word === "center") {
    return { offset: room / 2, between: 0 }
  }

  if (word === "end" || word === "flex-end" || word === "right") {
    return { offset: room, between: 0 }
  }

  if (word === "space-between") {
    return { offset: 0, between: count > 1 ? room / (count - 1) : 0 }
  }

  if (word === "space-around") {
    return { offset: room / count / 2, between: room / count }
  }

  if (word === "space-evenly") {
    return { offset: room / (count + 1), between: room / (count + 1) }
  }

  return { offset: 0, between: 0 }
}

/** Where each track starts and ends, from the grid's content edge, with the gap and any shared-out room between. */
function trackEdges(
  sizes: readonly number[],
  gap: number,
  distribution?: Distribution
): { start: number; end: number }[] {
  const used = sizes.reduce((total, size) => total + size, 0) + gap * Math.max(0, sizes.length - 1)
  const { offset, between } = shared(sizes.length, used, distribution)
  let at = offset

  return sizes.map((size) => {
    const edge = { start: at, end: at + size }
    at += size + gap + between

    return edge
  })
}

/** A track's edges along one axis. */
type Edges = readonly { start: number; end: number }[]

/** The tracks a box covers along one axis, from its edges measured from the grid's content edge. */
function covered(edges: Edges, from: number, to: number) {
  // Half a pixel either way, for the fractions zoom and subpixel layout leave.
  const first = Math.max(
    0,
    edges.findLastIndex((edge) => edge.start <= from + 0.5)
  )

  const last = edges.findIndex((edge) => edge.end >= to - 0.5)

  return { at: first, span: Math.max(1, (last === -1 ? edges.length - 1 : last) - first + 1) }
}

/** A child's computed start and end lines along one axis: `2`, `-1`, `span 2` or `auto`. */
export interface Lines {
  start: string
  end: string
}

/** A child's box, measured from the grid's content edge, in the grid's own pixels. */
export interface MeasuredChild {
  id: string
  name: string
  auto: boolean
  box: { left: number; top: number; width: number; height: number }
  /** Its lines as its style gives them, which say its cells where its box doesn't fill them. */
  lines?: { column: Lines; row: Lines }
  /** Where it sits in its cells, across and down. */
  align?: { x?: SelfAlign; y?: SelfAlign }
}

const lineNumber = (line: string) => (/^-?\d+$/.test(line.trim()) ? Number(line) : undefined)
const spanNumber = (line: string) => Number(/^span\s+(\d+)$/.exec(line.trim())?.[1]) || undefined

/**
 * How many tracks a grid's template makes itself, before the grid adds any for children placed past them: from a
 * computed `grid-template-columns` or `-rows` as the style gives it, `repeat(3, minmax(0, 1fr))` or `100px [end] 1fr`.
 * None for a template it can't count, such as one that repeats to fill the grid.
 */
export function explicitTracks(template: string): number | undefined {
  const text = template.trim()

  if (text === "none" || text === "") {
    return 0
  }

  let count = 0

  for (const track of topLevelWords(text.replace(/\[[^\]]*\]/g, " "))) {
    if (!track.startsWith("repeat(")) {
      count += 1
      continue
    }

    const repeat = /^repeat\(\s*(\d+)\s*,(.*)\)$/s.exec(track)
    const inner = repeat ? explicitTracks(repeat[2] ?? "") : undefined

    if (!repeat || inner === undefined) {
      return undefined
    }

    count += Number(repeat[1]) * inner
  }

  return count
}

/** A list split at the spaces outside any brackets: `minmax(0, 1fr) 100px` is two words. */
function topLevelWords(text: string): string[] {
  const words: string[] = []
  let depth = 0
  let word = ""

  for (const char of text) {
    depth += Number(char === "(") - Number(char === ")")

    if (depth === 0 && /\s/.test(char)) {
      words.push(word)
      word = ""
    } else {
      word += char
    }
  }

  return [...words, word].filter((part) => part !== "")
}

/**
 * The tracks a child takes along one axis. Lines its style names say so outright, negative ones counted back from the
 * end of the grid's own tracks; a span, one unless it says, gives how many, and its box, where it sits in them, which.
 * Without its lines, the tracks its box covers.
 */
function placed(
  edges: Edges,
  explicit: number,
  from: number,
  to: number,
  lines: Lines | undefined,
  align: SelfAlign | undefined
) {
  const box = covered(edges, from, to)

  if (!lines) {
    return box
  }

  // Line 1 is before the first track; -1 after the last of the template's own.
  const track = (line: number) => (line > 0 ? line - 1 : explicit + 1 + line)
  const start = lineNumber(lines.start)
  const end = lineNumber(lines.end)

  if (start !== undefined && end !== undefined) {
    const [first, last] = [track(start), track(end)].toSorted((a, b) => a - b)

    return { at: Math.max(0, first), span: Math.max(1, last - first) }
  }

  // An auto-placed child takes one track, however far its box runs past it.
  const span = spanNumber(lines.start) ?? spanNumber(lines.end) ?? 1

  if (start !== undefined) {
    return { at: Math.max(0, track(start)), span }
  }

  if (end !== undefined) {
    return { at: Math.max(0, track(end) - span), span }
  }

  // Auto-placed: the run of tracks whose edge, or middle, lines up with its box where its alignment puts it.
  const runs = Array.from({ length: Math.max(1, edges.length - span + 1) }, (_, at) => at)

  const offBy = (at: number) => {
    const first = edges[at]
    const last = edges[Math.min(edges.length - 1, at + span - 1)]

    if (!first || !last) {
      return Infinity
    }

    if (align === "end") {
      return Math.abs(last.end - to)
    }

    if (align === "center") {
      return Math.abs((first.start + last.end) / 2 - (from + to) / 2)
    }

    return Math.abs(first.start - from)
  }

  const at = runs.reduce((best, run) => (offBy(run) < offBy(best) ? run : best), runs[0] ?? 0)

  return { at, span }
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
  /** How it shares out room its tracks leave, across and down. */
  distribution?: { x?: Distribution; y?: Distribution }
  /** How many columns and rows its template makes, which negative lines count back from; all of them otherwise. */
  explicit?: { columns?: number; rows?: number }
  children: readonly MeasuredChild[]
  self: string
  items: GridLayout["items"]
}): GridLayout {
  const columns = trackEdges(grid.columns, grid.gap.column, grid.distribution?.x)
  const rows = trackEdges(grid.rows, grid.gap.row, grid.distribution?.y)

  return {
    weights: [...grid.columns],
    rows: Math.max(1, grid.rows.length),
    self: grid.self,
    items: grid.items,
    children: grid.children.map(({ id, name, auto, box, lines, align }) => {
      const across = grid.explicit?.columns ?? columns.length
      const down = grid.explicit?.rows ?? rows.length
      const col = placed(columns, across, box.left, box.left + box.width, lines?.column, align?.x ?? grid.items.x)
      const row = placed(rows, down, box.top, box.top + box.height, lines?.row, align?.y ?? grid.items.y)

      return { id, name, auto, area: { col: col.at, cols: col.span, row: row.at, rows: row.span } }
    })
  }
}
