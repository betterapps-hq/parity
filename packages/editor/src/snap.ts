import type { Edge } from "./handles.ts"

/**
 * Snapping, Figma style, for designs dragged on the canvas and for layers moved or resized inside a design: a box's
 * left, centre or right lines up with another's left, centre or right when they come close, and likewise top, middle
 * and bottom. A layer also locks to its parent's edges and centre, and to even spacing among its siblings. The canvas
 * passes the boxes in and draws the guides, distances and spacing marks that come back.
 */

/** How close, in screen pixels, an edge or centre has to come to another's to lock to it. */
export const snapDistance = 8

/** A box: its top left, width and height, as tldraw's `Box` has them. */
export interface SnapBox {
  x: number
  y: number
  w: number
  h: number
}

export interface SnapPoint {
  x: number
  y: number
}

/** A line to draw where a box locked, along one axis: `x` is a vertical line, `y` a horizontal one. */
export interface SnapGuide {
  axis: "x" | "y"
  from: SnapPoint
  to: SnapPoint
}

export interface Snapped {
  /** Where the box goes. */
  x: number
  y: number
  /** A guide for each axis it locked along, spanning it and the box it locked to. */
  guides: SnapGuide[]
}

type Axis = "x" | "y"

/** One axis of a box: where it starts and how long it is. */
const span = (box: SnapBox, axis: Axis) =>
  axis === "x" ? { start: box.x, size: box.w } : { start: box.y, size: box.h }

/** A box's start, centre and end along an axis. */
const lines = (box: SnapBox, axis: Axis) => {
  const { start, size } = span(box, axis)

  return [start, start + size / 2, start + size]
}

/** Where one of a box's lines locks to another box's. */
interface Lock {
  delta: number
  line: number
  other: SnapBox
}

/**
 * Of the lines given and each other box's start, centre and end along an axis, the nearest pair within `threshold`.
 * Of lines just as near, the first box's comes first.
 */
function nearestLine(mine: readonly number[], others: readonly SnapBox[], axis: Axis, threshold: number) {
  let found: Lock | undefined

  for (const other of others) {
    for (const line of lines(other, axis)) {
      for (const edge of mine) {
        const delta = line - edge

        if (Math.abs(delta) <= threshold && (!found || Math.abs(delta) < Math.abs(found.delta))) {
          found = { delta, line, other }
        }
      }
    }
  }

  return found
}

/** A guide along the line a box locked to, spanning the box and the one it locked to. */
function guideFor(axis: Axis, lock: Lock, box: SnapBox): SnapGuide {
  if (axis === "x") {
    const top = Math.min(box.y, lock.other.y)
    const bottom = Math.max(box.y + box.h, lock.other.y + lock.other.h)

    return { axis, from: { x: lock.line, y: top }, to: { x: lock.line, y: bottom } }
  }

  const left = Math.min(box.x, lock.other.x)
  const right = Math.max(box.x + box.w, lock.other.x + lock.other.w)

  return { axis, from: { x: left, y: lock.line }, to: { x: right, y: lock.line } }
}

/**
 * Where a box being dragged to `box`'s position goes, snapped to `others`: along each axis, the nearest of its three
 * lines (start, centre, end) to any of theirs, within `snapDistance` screen pixels at `zoom`. Of lines just as near, the
 * first box's comes first. An axis with nothing near stays where it is.
 */
export function snapBox(box: SnapBox, others: readonly SnapBox[], zoom: number): Snapped {
  const threshold = snapDistance / zoom
  const x = nearestLine(lines(box, "x"), others, "x", threshold)
  const y = nearestLine(lines(box, "y"), others, "y", threshold)
  const snapped = { ...box, x: box.x + (x?.delta ?? 0), y: box.y + (y?.delta ?? 0) }
  const guides: SnapGuide[] = []

  if (x) {
    guides.push(guideFor("x", x, snapped))
  }

  if (y) {
    guides.push(guideFor("y", y, snapped))
  }

  return { x: snapped.x, y: snapped.y, guides }
}

/**
 * Whether a drag snaps: when snapping is turned on, unless Ctrl (Cmd on a Mac) is held to move freely. The same for
 * designs and layers, moving and resizing.
 */
export function snaps(held: { ctrlKey: boolean; metaKey: boolean }, enabled: boolean): boolean {
  return enabled && !held.ctrlKey && !held.metaKey
}

/** A distance measured between two boxes: a straight line along one axis, and its length. */
export interface SnapDistance {
  from: SnapPoint
  to: SnapPoint
  length: number
}

/**
 * The distances between a box and another, Figma style: to each edge of a box that contains it (its insets),
 * otherwise the gaps between them along each axis, drawn across the middle of where they overlap, or from the box's
 * middle where they don't.
 */
export function distancesBetween(a: SnapBox, b: SnapBox): SnapDistance[] {
  const found: SnapDistance[] = []

  const add = (x1: number, y1: number, x2: number, y2: number) => {
    const length = Math.hypot(x2 - x1, y2 - y1)

    if (length > 0) {
      found.push({ from: { x: x1, y: y1 }, to: { x: x2, y: y2 }, length })
    }
  }

  const [aRight, aBottom, bRight, bBottom] = [a.x + a.w, a.y + a.h, b.x + b.w, b.y + b.h]
  const cx = a.x + a.w / 2
  const cy = a.y + a.h / 2

  if (b.x <= a.x && bRight >= aRight && b.y <= a.y && bBottom >= aBottom) {
    add(b.x, cy, a.x, cy)
    add(aRight, cy, bRight, cy)
    add(cx, b.y, cx, a.y)
    add(cx, aBottom, cx, bBottom)

    return found
  }

  const overlapY = a.y < bBottom && b.y < aBottom
  const overlapX = a.x < bRight && b.x < aRight
  const midY = overlapY ? (Math.max(a.y, b.y) + Math.min(aBottom, bBottom)) / 2 : cy
  const midX = overlapX ? (Math.max(a.x, b.x) + Math.min(aRight, bRight)) / 2 : cx

  if (b.x >= aRight) {
    add(aRight, midY, b.x, midY)
  }

  if (bRight <= a.x) {
    add(bRight, midY, a.x, midY)
  }

  if (b.y >= aBottom) {
    add(midX, aBottom, midX, b.y)
  }

  if (bBottom <= a.y) {
    add(midX, bBottom, midX, a.y)
  }

  return found
}

/**
 * Even spacing along one axis: a run of three or more boxes, the snapped one among them, with the same gap between
 * each. Each gap runs from the end edge of one box to the start edge of the next, each edge drawn across where the two
 * overlap, as tldraw's gap indicators take them.
 */
export interface SnapSpacing {
  axis: Axis
  gap: number
  gaps: { start: [SnapPoint, SnapPoint]; end: [SnapPoint, SnapPoint] }[]
}

/** What a layer snaps to: its siblings and the parent it's placed in, in the same units as its box. */
export interface LayerSnapScene {
  siblings: readonly SnapBox[]
  parent: SnapBox
  /**
   * The places among the siblings that space a box evenly, kept through a gesture, since the siblings don't move
   * meanwhile (see `EvenSpacing`). Without it, they're worked out at each move.
   */
  spacing?: EvenSpacing
}

/** Which edge a resize handle moves along each axis: the start (left or top) or the end (right or bottom). */
export type SnapEdges = { x?: "start" | "end"; y?: "start" | "end" }

/** The edges a handle drags: a side's handle one, a corner's two. */
export function resizeEdges(edge: Edge): SnapEdges {
  const edges: SnapEdges = {}

  if (edge.includes("w")) {
    edges.x = "start"
  }

  if (edge.includes("e")) {
    edges.x = "end"
  }

  if (edge.includes("n")) {
    edges.y = "start"
  }

  if (edge.includes("s")) {
    edges.y = "end"
  }

  return edges
}

/** A box resized by a handle on `edges` with the pointer moved `delta`: the dragged edges move, the others stay. */
export function resizedBox(box: SnapBox, edges: SnapEdges, delta: SnapPoint): SnapBox {
  const next = { ...box }

  if (edges.x === "start") {
    Object.assign(next, { x: box.x + delta.x, w: box.w - delta.x })
  }

  if (edges.x === "end") {
    next.w = box.w + delta.x
  }

  if (edges.y === "start") {
    Object.assign(next, { y: box.y + delta.y, h: box.h - delta.y })
  }

  if (edges.y === "end") {
    next.h = box.h + delta.y
  }

  return next
}

/** How far a resize moved the edges that locked, along each axis that did, in layout pixels. */
export interface EdgeMoves {
  x?: number
  y?: number
}

/** How far a resize moved each edge that locked, from `from` to the snapped box. */
export function lockedEdgeMoves(from: SnapBox, snapped: LayerSnapped, edges: SnapEdges): EdgeMoves {
  const moves: EdgeMoves = {}

  for (const axis of ["x", "y"] as const) {
    const edge = edges[axis]

    if (!edge || !snapped.locked[axis]) {
      continue
    }

    const [before, after] = [span(from, axis), span(snapped.box, axis)]
    moves[axis] =
      edge === "start" ? after.start - before.start : after.start + after.size - (before.start + before.size)
  }

  return moves
}

export interface LayerSnapped {
  /** Where the layer goes, or the size it takes. */
  box: SnapBox
  /** The axes it locked along, which are written exactly rather than in steps. */
  locked: { x: boolean; y: boolean }
  guides: SnapGuide[]
  /** The distances to what it lined up with: a sibling's gap, or the parent's four insets. */
  distances: SnapDistance[]
  spacing: SnapSpacing[]
}

/**
 * Where a layer being moved or resized goes, snapped to its siblings and its parent, within `snapDistance` screen
 * pixels at `zoom` (screen pixels per unit of the boxes). `box` is where the pointer puts it.
 *
 * Moving, along each axis its start, centre and end lock to the nearest of its siblings' and its parent's starts,
 * centres and ends, siblings first, or it takes the place that spaces it evenly with its siblings along that axis: in
 * the middle between two, or a gap from a run of them that's already evenly spaced. Of the two, the nearer wins; when
 * both come to the same place, both show. Resizing, only the edges the handle moves lock, to the same lines, and the
 * spacing doesn't count. An axis with nothing near stays where the pointer puts it.
 */
export function snapLayer(box: SnapBox, scene: LayerSnapScene, zoom: number, edges?: SnapEdges): LayerSnapped {
  const threshold = snapDistance / zoom
  const targets = [...scene.siblings, scene.parent]
  const even = edges ? undefined : (scene.spacing ?? new EvenSpacing(scene.siblings))
  const result = { ...box }
  const locks: Partial<Record<Axis, Lock>> = {}
  const spaced: Partial<Record<Axis, EvenPlace[]>> = {}

  for (const axis of ["x", "y"] as const) {
    const { start, size } = span(box, axis)
    const edge = edges?.[axis]

    if (edges && !edge) {
      continue
    }

    let mine = lines(box, axis)

    if (edge) {
      mine = [edge === "start" ? start : start + size]
    }

    const lock = nearestLine(mine, targets, axis, threshold)
    const spacing = even ? even.near(box, axis, threshold) : []
    const spacingDelta = spacing[0] ? spacing[0].at - start : undefined
    const nearer = lock && (spacingDelta === undefined || Math.abs(lock.delta) <= Math.abs(spacingDelta))
    const delta = nearer ? lock.delta : spacingDelta

    if (delta === undefined) {
      continue
    }

    const keep = (candidate: number | undefined) => candidate !== undefined && Math.abs(candidate - delta) < 1e-6
    // A resize that would turn the layer inside out doesn't lock.
    let sized = size

    if (edge === "start") {
      sized = size - delta
    }

    if (edge === "end") {
      sized = size + delta
    }

    if (sized < 0) {
      continue
    }

    if (keep(lock?.delta)) {
      locks[axis] = lock
    }

    if (keep(spacingDelta)) {
      spaced[axis] = spacing
    }

    const moved = edge === "end" ? start : start + delta

    if (axis === "x") {
      Object.assign(result, { x: moved, w: sized })
    } else {
      Object.assign(result, { y: moved, h: sized })
    }
  }

  const guides: SnapGuide[] = []
  const distances: SnapDistance[] = []
  const measured = new Set<SnapBox>()

  for (const axis of ["x", "y"] as const) {
    const lock = locks[axis]

    if (!lock) {
      continue
    }

    guides.push(guideFor(axis, lock, result))

    if (measured.has(lock.other)) {
      continue
    }

    measured.add(lock.other)
    distances.push(...distancesBetween(result, lock.other))
  }

  const spacing = (["x", "y"] as const).flatMap((axis) => {
    const runs = spaced[axis]

    return runs ? [spacingMarks(axis, runs, result)] : []
  })

  return {
    box: result,
    locked: { x: !!(locks.x || spaced.x), y: !!(locks.y || spaced.y) },
    guides,
    distances,
    spacing
  }
}

/** A place that spaces a box evenly with its siblings along an axis: the box's start there, and the run it joins. */
export interface EvenPlace {
  at: number
  /** The siblings in the run, in order along the axis, with `undefined` where the box goes. */
  run: (SnapBox | undefined)[]
  gap: number
}

/**
 * Even spacing among a layer's siblings, which don't move while it's dragged: the places that space it evenly with a
 * row of them are worked out once for each row it's beside and kept, so a move only finds its row and the places near
 * it (PAR-551). A gesture makes one with the siblings it measured.
 */
export class EvenSpacing {
  private readonly places = new Map<string, EvenPlace[]>()
  private readonly siblings: readonly SnapBox[]

  constructor(siblings: readonly SnapBox[]) {
    this.siblings = siblings
  }

  /**
   * The places along an axis where `box` would be evenly spaced with its siblings, within `threshold` of where it is,
   * the nearest first, with every run that comes to that same place. Only siblings beside it across the axis count, as
   * a row (or a column) does: those that overlap it the other way.
   */
  near(box: SnapBox, axis: "x" | "y", threshold: number): EvenPlace[] {
    const across: Axis = axis === "x" ? "y" : "x"
    const mine = span(box, across)
    const { start, size } = span(box, axis)
    const row: number[] = []
    this.siblings.forEach((other, index) => {
      const theirs = span(other, across)

      if (theirs.start < mine.start + mine.size && mine.start < theirs.start + theirs.size) {
        row.push(index)
      }
    })
    // Gaps within a screen pixel of each other are the same.
    const tolerance = threshold / snapDistance
    const key = `${axis}:${size}:${tolerance}:${row.join(",")}`
    let found = this.places.get(key)

    if (!found) {
      found = evenPlaces(
        row.map((index) => this.siblings[index]!),
        axis,
        size,
        tolerance
      )
      this.places.set(key, found)
    }

    const near = found.filter((spacing) => Math.abs(spacing.at - start) <= threshold)
    const best = near.toSorted((a, b) => Math.abs(a.at - start) - Math.abs(b.at - start))[0]

    return best ? near.filter((spacing) => Math.abs(spacing.at - best.at) < 1e-6) : []
  }
}

/**
 * Every place along an axis where a box `size` long would be evenly spaced with a row of siblings: in the middle
 * between two neighbours, or a gap after or before a run of them that's already evenly spaced. Gaps within
 * `tolerance` of each other are the same.
 */
function evenPlaces(siblings: readonly SnapBox[], axis: Axis, size: number, tolerance: number): EvenPlace[] {
  const end = (other: SnapBox) => span(other, axis).start + span(other, axis).size
  const begin = (other: SnapBox) => span(other, axis).start
  const row = siblings.toSorted((a, b) => begin(a) - begin(b))
  const same = (a: number, b: number) => Math.abs(a - b) <= tolerance
  // Neighbours: one box ending before the next begins, with nothing else between them.
  const pairs: { first: SnapBox; second: SnapBox; gap: number }[] = []

  for (const first of row) {
    const second = row.find((other) => other !== first && begin(other) >= end(first))

    if (!second) {
      continue
    }

    const between = row.some(
      (other) => other !== first && other !== second && begin(other) < begin(second) && end(other) > end(first)
    )

    const gap = begin(second) - end(first)

    if (!between && gap > 0) {
      pairs.push({ first, second, gap })
    }
  }

  // Nothing of the row may sit where the box would go, from the run's edge to the box's far side.
  const clear = (from: number, to: number) => !row.some((other) => begin(other) < to && end(other) > from)

  // A run extended back (or forward) through neighbours with the same gap.
  const runBack = (last: SnapBox, gap: number): SnapBox[] => {
    const before = pairs.find((pair) => pair.second === last && same(pair.gap, gap))

    return before ? [...runBack(before.first, gap), last] : [last]
  }

  const runOn = (first: SnapBox, gap: number): SnapBox[] => {
    const after = pairs.find((pair) => pair.first === first && same(pair.gap, gap))

    return after ? [first, ...runOn(after.second, gap)] : [first]
  }

  const found: EvenPlace[] = []

  for (const { first, second, gap } of pairs) {
    // In the middle between two neighbours.
    const room = gap - size

    if (room > 0) {
      const at = end(first) + room / 2
      found.push({ at, run: [...runBack(first, room / 2), undefined, ...runOn(second, room / 2)], gap: room / 2 })
    }

    // A gap after a run, or before one.
    const after = end(second) + gap

    if (clear(end(second), after + size)) {
      found.push({ at: after, run: [...runBack(second, gap), undefined], gap })
    }

    const before = begin(first) - gap - size

    if (clear(before, begin(first))) {
      found.push({ at: before, run: [undefined, ...runOn(first, gap)], gap })
    }
  }

  return found
}

/** The marks for the runs a box joined, at its snapped place: each gap in them once. */
function spacingMarks(axis: Axis, runs: readonly EvenPlace[], box: SnapBox): SnapSpacing {
  const across: Axis = axis === "x" ? "y" : "x"
  const point = (along: number, at: number): SnapPoint => (axis === "x" ? { x: along, y: at } : { x: at, y: along })
  const seen = new Set<string>()
  const gaps: SnapSpacing["gaps"] = []

  for (const { run } of runs) {
    const boxes = run.map((each) => each ?? box)

    for (let index = 1; index < boxes.length; index++) {
      const [first, second] = [boxes[index - 1]!, boxes[index]!]
      const from = span(first, axis).start + span(first, axis).size
      const to = span(second, axis).start
      const key = `${from}:${to}`

      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      const [a, b] = [span(first, across), span(second, across)]
      let low = Math.max(a.start, b.start)
      let high = Math.min(a.start + a.size, b.start + b.size)

      if (low > high) {
        ;[low, high] = [high, low]
      }

      gaps.push({ start: [point(from, low), point(from, high)], end: [point(to, low), point(to, high)] })
    }
  }

  return { axis, gap: runs[0]!.gap, gaps }
}
