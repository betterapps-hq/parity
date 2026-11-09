import {
  boardTarget,
  childEntries,
  type ContainerSpec,
  type DesignNode,
  editNode,
  type FrameSize,
  frameSize,
  type Length,
  locateNode,
  moveNode,
  type NodeChange,
  type NodeStyle,
  type StateSpec,
  topmostNodes
} from "@parity-app/core"
import type { Flow, Point, Rect } from "./drop-slot.ts"
import { withFrameSize } from "./frames.ts"
import type { Edge } from "./handles.ts"
import { lengthSteps } from "./lengths.ts"
import { type BoardView, boardReader } from "./shown.ts"
import {
  type LayerSnapped,
  type LayerSnapScene,
  lockedEdgeMoves,
  resizedBox,
  resizeEdges,
  type SnapBox,
  snapLayer
} from "./snap.ts"

/**
 * Moving, resizing and nudging, as the canvas does them: the rules that turn the pointer's movement or an arrow key
 * into the style a layer takes, or the size a frame takes. The canvas measures the layer and its frame when a gesture
 * begins, passes each pointer move in, and writes what comes back. Lengths in a style are steps of the spacing scale:
 * insets go in half steps and sizes in whole ones, except where an edge snaps, which goes to the half pixel.
 */

/** How far, in screen pixels, the pointer goes before a press becomes a drag: moving, resizing or drawing a box. */
export const dragThreshold = 4

/**
 * How close, in screen pixels, a dragged edge comes to where it fills or hugs to go back to doing so: a layer's edge to
 * the inside of its parent, or a frame's to its viewport's width or its content's height.
 */
export const fillDistance = 6

/** A length in steps, to the half step. */
const halfSteps = (steps: number) => Math.round(steps * 2) / 2

/** A length in steps of `unit` pixels, to the half pixel. */
const halfPixels = (steps: number, unit: number) => Math.round(steps * unit * 2) / (2 * unit)

/** Which sizes a handle changes. */
export interface EdgeAxes {
  width: boolean
  height: boolean
}

/** The sizes a handle changes: a side's handle changes the one across it, a corner's both. */
export function edgeAxes(edge: Edge): EdgeAxes {
  return { width: edge.includes("e") || edge.includes("w"), height: edge.includes("n") || edge.includes("s") }
}

/** A change to a layer's style, where `undefined` takes a key away. */
export type StyleChange = NonNullable<NodeChange["style"]>

// Insets: moving and resizing an absolutely placed layer by the distances from its parent's edges it's placed at.

export type Side = "top" | "right" | "bottom" | "left"

/** Where a layer's sides are drawn, in steps of the spacing scale from its parent's edges. */
export type DrawnSteps = Record<Side, number>

/** Insets in steps of the spacing scale, for the sides that have one. */
export type SideSteps = Partial<Record<Side, number>>

/** What moving a layer by its insets changes, and the first side a length token kept from moving, if any. */
export interface InsetShift {
  change: SideSteps
  blocked?: Side
}

/** The sides along each axis: the one a layer is placed from by default first. */
const sides = { x: ["left", "right"], y: ["top", "bottom"] } as const

/**
 * The insets that move an absolutely placed layer `dx` and `dy` steps of the spacing scale, as dragging and nudging it
 * do. Along each axis it moves by the side it's placed from (the left or top, unless only the right or bottom is set),
 * or by both when it's stretched between them, so it keeps its size. Each side moves from where it is: its number,
 * negative too, or, for a length token or a side left unset, where `drawn` says it's drawn. Without `drawn`, an unset
 * side counts from 0 and an axis with a token stays, named by `blocked`. An axis it doesn't move along keeps what's
 * written, tokens included.
 */
export function shiftInsets(style: NodeStyle, dx: number, dy: number, drawn?: DrawnSteps): InsetShift {
  const change: SideSteps = {}
  let blocked: Side | undefined

  for (const [start, end, by] of [
    ["left", "right", dx],
    ["top", "bottom", dy]
  ] as const) {
    if (by === 0) {
      continue
    }

    let placed: Side[] = [start]

    if (style[end] !== undefined) {
      placed = style[start] === undefined ? [end] : [start, end]
    }

    const at = (side: Side): number | undefined => {
      const value = style[side]

      return lengthSteps(value) ?? drawn?.[side] ?? (value === undefined ? 0 : undefined)
    }

    const token = placed.find((side) => at(side) === undefined)

    if (token) {
      blocked ??= token
      continue
    }

    for (const side of placed) {
      change[side] = at(side)! + (side === start ? by : -by)
    }
  }

  const shift: InsetShift = { change }

  if (blocked) {
    shift.blocked = blocked
  }

  return shift
}

/** What resizing a layer along one axis changes: its size, when it changes, and its insets. */
export interface InsetResize {
  size?: number
  insets: NodeStyle
}

/**
 * One axis of resizing an absolutely placed layer by a handle, keeping the opposite edge where it was. `end` says the
 * handle is on the right (or bottom) edge rather than the left (or top); `delta` is how far it moved, and `size` the
 * layer's size along the axis when the drag began, both in layout pixels; `unit` is the pixels in a step.
 *
 * A layer placed from both sides with no size of its own is sized by its insets, so the dragged side's inset moves. A
 * layer placed from the far side alone grows from there, so a handle on that side moves its inset as the size changes.
 * Otherwise it's placed from the near side, which moves with a handle there. A side moves from where it is, as in
 * `shiftInsets`, and only a side that moves is written, so one that stays keeps a token. With `exact`, as when the edge
 * snaps to a line, sizes and insets go to the half pixel rather than to steps.
 */
export function resizeInsets(
  style: NodeStyle,
  drawn: DrawnSteps,
  axis: "x" | "y",
  end: boolean,
  delta: number,
  size: number,
  unit: number,
  exact = false,
  centre = false
): InsetResize {
  // Both to the half pixel, or insets to half steps and sizes to whole ones.
  const fine = (steps: number) => halfPixels(steps, unit)
  const inset = exact ? fine : halfSteps
  const length = exact ? fine : Math.round
  const [near, far] = sides[axis]
  const hasNear = style[near] !== undefined
  const hasFar = style[far] !== undefined
  const sized = style[axis === "x" ? "width" : "height"] !== undefined

  const shift = (side: Side, by: number): NodeStyle => {
    const value = style[side]
    const from = lengthSteps(value) ?? drawn[side]
    const to = inset(from + by)

    return to === from ? {} : { [side]: to }
  }

  if (centre) {
    // Both edges move, each by the handle's movement, so the middle stays where it was.
    const grows = end ? delta : -delta

    if (hasNear && hasFar && !sized) {
      return { insets: { ...shift(near, -grows / unit), ...shift(far, -grows / unit) } }
    }

    const next = Math.max(0, length((size + 2 * grows) / unit))
    const half = (next - size / unit) / 2

    return { size: next, insets: hasFar && !hasNear ? shift(far, -half) : shift(near, -half) }
  }

  if (hasNear && hasFar && !sized) {
    return { insets: end ? shift(far, -delta / unit) : shift(near, delta / unit) }
  }

  const next = Math.max(0, length((size + (end ? delta : -delta)) / unit))
  // How far the edge that isn't anchored moved, in steps, once the size is rounded to whole steps.
  const grown = next - size / unit
  const fromFar = hasFar && !hasNear

  if (fromFar && end) {
    return { size: next, insets: shift(far, -grown) }
  }

  if (!fromFar && !end) {
    return { size: next, insets: shift(near, -grown) }
  }

  return { size: next, insets: {} }
}

// Dragging an absolutely placed layer.

/** A layer's box and what it snaps to, measured in its frame when a gesture begins, in the frame's own pixels. */
export interface LayerSnapStart {
  box: SnapBox
  scene: LayerSnapScene
}

/** A pointer's move through a drag. */
export interface DragMove {
  /** How far the pointer is from where it was pressed, in screen pixels. */
  dx: number
  dy: number
  /** Whether the layer snaps: snapping is turned on, and Ctrl (Cmd on a Mac) isn't held (see `snaps`). */
  snaps: boolean
}

export interface AbsoluteDragStart {
  /** The layer's style as the board being edited shows it. */
  style: NodeStyle
  /** Where its sides are drawn, in steps, when it's drawn, for those set by a token or not at all. */
  drawn?: DrawnSteps
  /** Layout pixels per spacing step. */
  unit: number
  /** Screen pixels per layout pixel. */
  scale: number
  /** What it snaps to, when it's drawn. */
  snapping?: LayerSnapStart
}

/** Where a drag moves a layer: the insets that put it there, and where it snapped, if it did. */
export interface LayerMoved {
  change: NodeStyle
  snapped?: LayerSnapped
}

/**
 * Follows one drag of an absolutely placed layer, giving for each pointer position the insets that move it there and
 * where it snapped. It moves by its insets as nudging does (see `shiftInsets`), in half steps, except along an axis
 * where it snaps to its siblings or its parent (see `snapLayer`), where it goes exactly where it locks, to the half
 * pixel.
 */
export function absoluteDrag(start: AbsoluteDragStart): (move: DragMove) => LayerMoved {
  const { style, drawn, unit, scale, snapping } = start

  return ({ dx, dy, snaps }) => {
    const free = { x: dx / scale, y: dy / scale }
    const from = snapping?.box

    const snapped =
      from && snaps ? snapLayer({ ...from, x: from.x + free.x, y: from.y + free.y }, snapping.scene, scale) : undefined

    const along = (axis: "x" | "y") =>
      snapped?.locked[axis] && from
        ? halfPixels((snapped.box[axis] - from[axis]) / unit, unit)
        : halfSteps(free[axis] / unit)

    const moved: LayerMoved = { change: shiftInsets(style, along("x"), along("y"), drawn).change }

    if (snapped) {
      moved.snapped = snapped
    }

    return moved
  }
}

// Resizing a layer by its handles.

/**
 * What resizing the layer `id` starts from, as the board being edited shows it: the layer's style, and the direction of
 * the layout it's in (a column unless the board shows a row), or none outside a layout. Undefined when there's no such
 * layer among the design's own.
 */
export function resizeStart(
  container: ContainerSpec,
  id: string,
  view: BoardView
): { style: NodeStyle; parentDirection?: "row" | "column" } | undefined {
  const location = locateNode(container.root, id)

  if (!location) {
    return undefined
  }

  const read = boardReader(container, view)
  const parent = location.ancestors.at(-1)
  const style = read(location.node).style ?? {}

  if (parent?.type !== "layout") {
    return { style }
  }

  return { style, parentDirection: read(parent).style?.direction ?? "column" }
}

export interface ResizeStart {
  edge: Edge
  /** The layer's box in screen pixels when the drag began. */
  rect: Rect
  /** The box its parent lays it out in, inside the padding, in screen pixels. */
  inner?: Rect
  /** Screen pixels per layout pixel. */
  scale: number
  /** Layout pixels per spacing step. */
  unit: number
  /** For an absolutely placed layer: its style as written, and where its sides are drawn, in steps. */
  absolute?: { style: NodeStyle; drawn: DrawnSteps }
  /** How far the pointer goes along the handle's axes before anything changes: `dragThreshold` unless given. */
  threshold?: number
}

export interface ResizeMove {
  /** How far the pointer is from where it was pressed, in screen pixels. */
  dx: number
  dy: number
  /** Keeps a corner's proportions, and turns off filling. */
  shift: boolean
  /** Resizes from the middle, as Alt does: the opposite edges move too, and it doesn't fill. */
  centre?: boolean
  /**
   * For an absolutely placed layer, how far each edge that snapped to a line moves, in layout pixels, in place of the
   * pointer's movement along that axis. It goes exactly there, rather than in steps.
   */
  snapped?: { x?: number; y?: number }
}

/**
 * Follows one drag of a resize handle, giving the style each pointer position makes, or nothing while the drag hasn't
 * started. A handle changes only its own axes, and nothing changes until the pointer has moved along them, so pressing a
 * handle or dragging a side's handle along its side does nothing.
 *
 * A layer in a layout takes a size in whole spacing steps, or fill when its edge comes back to the inside of its parent
 * after leaving it, so an edge that starts there, as the last child in a row does, doesn't fill at once. An absolutely
 * placed layer keeps its far edge where it was: dragging its left or top handle moves that inset too (see
 * `resizeInsets`), and it never fills.
 */
export function resizeGesture(start: ResizeStart): (move: ResizeMove) => NodeStyle | undefined {
  const { edge, rect, inner, scale, unit, absolute } = start
  const axes = edgeAxes(edge)
  const ratio = (rect.right - rect.left) / Math.max(1, rect.bottom - rect.top)

  // How far each moving edge is from the inside of the parent; it fills only once it has been away.
  const gaps = (dx: number, dy: number) => ({
    width: edge.includes("e")
      ? Math.abs(rect.right + dx - (inner?.right ?? Infinity))
      : Math.abs(rect.left + dx - (inner?.left ?? -Infinity)),
    height: edge.includes("s")
      ? Math.abs(rect.bottom + dy - (inner?.bottom ?? Infinity))
      : Math.abs(rect.top + dy - (inner?.top ?? -Infinity))
  })

  const away = gaps(0, 0)
  const armed = { width: away.width >= fillDistance, height: away.height >= fillDistance }
  let started = false

  return ({ dx: pointerX, dy: pointerY, shift, centre = false, snapped }) => {
    const dx = axes.width ? pointerX : 0
    let dy = axes.height ? pointerY : 0

    // Shift on a corner keeps the proportions, following the horizontal movement.
    if (shift && axes.width && axes.height) {
      const signX = edge.includes("w") ? -1 : 1
      const signY = edge.includes("n") ? -1 : 1
      dy = ((signX * dx) / ratio) * signY
    }

    // Measured along the handle's axes, so a pointer moving across them changes nothing.
    if (!started && Math.hypot(dx, dy) < (start.threshold ?? dragThreshold)) {
      return undefined
    }

    started = true
    const style: NodeStyle = {}

    if (absolute) {
      for (const [axis, size] of [
        ["x", "width"],
        ["y", "height"]
      ] as const) {
        if (!axes[size]) {
          continue
        }

        const end = axis === "x" ? edge.includes("e") : edge.includes("s")
        const exact = snapped?.[axis]
        const moved = exact ?? (axis === "x" ? dx : dy) / scale
        const length = (axis === "x" ? rect.right - rect.left : rect.bottom - rect.top) / scale

        const result = resizeInsets(
          absolute.style,
          absolute.drawn,
          axis,
          end,
          moved,
          length,
          unit,
          exact !== undefined,
          centre
        )

        if (result.size !== undefined) {
          style[size] = result.size
        }

        Object.assign(style, result.insets)
      }

      return style
    }

    const gap = gaps(dx, dy)

    for (const size of ["width", "height"] as const) {
      if (!axes[size]) {
        continue
      }

      if (gap[size] >= fillDistance) {
        armed[size] = true
      }

      // How much the size grows from the dragged edge; from the middle, the opposite edge moves as far.
      const flipped = size === "width" ? edge.includes("w") : edge.includes("n")
      const by = (size === "width" ? dx : dy) * (flipped ? -1 : 1)
      const drawnSize = size === "width" ? rect.right - rect.left : rect.bottom - rect.top
      const fills = armed[size] && gap[size] < fillDistance && !shift && !centre
      style[size] = fills ? "fill" : Math.max(0, Math.round((drawnSize + (centre ? 2 : 1) * by) / scale / unit))
    }

    return style
  }
}

export interface LayerResizeStart extends Omit<ResizeStart, "absolute"> {
  /** The layer as the board being edited shows it (see `resizeStart`). */
  layer: { style: NodeStyle; parentDirection?: "row" | "column" }
  /** For an absolutely placed layer, where its sides are drawn, in steps: it resizes by its insets from there. */
  drawn?: DrawnSteps
  /** For an absolutely placed layer, what its dragged edges snap to. */
  snapping?: LayerSnapStart
}

export interface LayerResizeMove extends DragMove {
  /** Keeps a corner's proportions, and turns off filling and snapping. */
  shift: boolean
  /** Resizes from the middle, as Alt does, without filling or snapping. */
  centre?: boolean
}

/** What a resize gives a layer: its style, once the drag has started, and where its dragged edges snapped. */
export interface LayerResized {
  style?: StyleChange
  snapped?: LayerSnapped
}

/**
 * Follows one drag of a layer's resize handle, giving for each pointer position the style it takes, or none while the
 * drag hasn't started (see `resizeGesture`), and where its dragged edges snapped. An absolutely placed layer's dragged
 * edges snap to its siblings' and its parent's lines (see `snapLayer`), and go exactly where they lock, unless Shift
 * keeps a corner's proportions. A size along the direction of the layout the layer is in takes `grow` away, since a
 * size on that axis replaces it.
 */
export function layerResize(start: LayerResizeStart): (move: LayerResizeMove) => LayerResized {
  const { edge, layer, drawn, snapping, scale } = start
  const axes = edgeAxes(edge)
  const edges = resizeEdges(edge)
  const gesture = resizeGesture({ ...start, absolute: drawn ? { style: layer.style, drawn } : undefined })
  // `grow` was the older way to fill along the parent's direction.
  const takesGrow = layer.style.grow === true && (layer.parentDirection === "column" ? axes.height : axes.width)

  return ({ dx, dy, shift, centre = false, snaps }) => {
    const proportional = shift && axes.width && axes.height
    const from = snapping?.box

    const snapped =
      from && snaps && !proportional && !centre
        ? snapLayer(resizedBox(from, edges, { x: dx / scale, y: dy / scale }), snapping.scene, scale, edges)
        : undefined

    const change = gesture({
      dx,
      dy,
      shift,
      centre,
      snapped: from && snapped ? lockedEdgeMoves(from, snapped, edges) : {}
    })

    const resized: LayerResized = {}

    if (change) {
      resized.style = takesGrow ? { ...change, grow: undefined } : change
    }

    if (snapped) {
      resized.snapped = snapped
    }

    return resized
  }
}

/**
 * What a double-click on a layer's handle changes: its size on the handle's axes hugs its content, or with Alt fills its
 * parent. A size along the direction of the layout it's in takes `grow` away, as a resize does.
 */
export function layerSizeReset(
  edge: Edge,
  fill = false,
  layer?: { style: NodeStyle; parentDirection?: "row" | "column" }
): StyleChange {
  const axes = edgeAxes(edge)
  const size = fill ? "fill" : "hug"
  const takesGrow = layer?.style.grow === true && (layer.parentDirection === "column" ? axes.height : axes.width)

  const change: StyleChange = {}

  if (axes.width) {
    change.width = size
  }

  if (axes.height) {
    change.height = size
  }

  if (takesGrow) {
    change.grow = undefined
  }

  return change
}

/**
 * Follows one drag of a handle on several selected layers together, each from its own box, giving each layer's style
 * for each pointer position. The handle sits on the box around them all; each layer takes its share of the movement,
 * its size across that box's, so the layers grow in proportion and the box's edge follows the pointer. They don't snap.
 */
export function layersResize(
  starts: readonly LayerResizeStart[],
  union: Rect
): (move: LayerResizeMove) => (StyleChange | undefined)[] {
  const width = Math.max(1, union.right - union.left)
  const height = Math.max(1, union.bottom - union.top)
  const axes = edgeAxes(starts[0]?.edge ?? "se")

  // Each layer moves only its share, so the drag starts for them all once the pointer has gone the threshold.
  const follow = starts.map((start) => ({
    resize: layerResize({ ...start, snapping: undefined, threshold: 0 }),
    shareX: (start.rect.right - start.rect.left) / width,
    shareY: (start.rect.bottom - start.rect.top) / height
  }))

  let started = false

  return (move) => {
    const along = Math.hypot(axes.width ? move.dx : 0, axes.height ? move.dy : 0)

    if (!started && along < dragThreshold) {
      return follow.map(() => undefined)
    }

    started = true

    return follow.map(
      ({ resize, shareX, shareY }) => resize({ ...move, dx: move.dx * shareX, dy: move.dy * shareY }).style
    )
  }
}

// Resizing a frame by its handles.

/** The narrowest and the shortest a frame can be dragged to, in its own pixels. */
export const smallestFrame = { width: 160, height: 80 }

export interface FrameResizeStart {
  /** The design whose frame it is. */
  design: ContainerSpec
  /** The frame's mode: its viewport, and the width that viewport gives a frame. */
  mode: { viewport: string; width: number }
  edge: Edge
  /** The frame's box in screen pixels when the drag began. */
  rect: Rect
  /** Screen pixels per pixel of the frame. */
  scale: number
}

/**
 * Follows one drag of a frame's handle, giving the size the design keeps for the frame's viewport at each pointer
 * position, in whole pixels, at least `smallestFrame`. Within `fillDistance` screen pixels of the viewport's width, the
 * width is left unset, so it follows the viewport again. A frame that hugged its content when the drag began hugs it
 * again likewise, within that distance of its height then; one with a height of its own doesn't.
 */
export function frameResize(start: FrameResizeStart): (move: { dx: number; dy: number }) => FrameSize {
  const { design, mode, edge, rect, scale } = start
  const axes = edgeAxes(edge)
  const size = frameSize(design, mode)
  const drawn = (rect.bottom - rect.top) / scale
  const content = size.height === undefined ? drawn : undefined
  const height = size.height ?? drawn

  return ({ dx, dy }) => {
    const next: FrameSize = { ...(design.kind === "frame" ? design.size : design.frames?.[mode.viewport]) }

    if (axes.width) {
      const width = Math.round(size.width + dx / scale)

      if (Math.abs(width - mode.width) * scale < fillDistance) {
        delete next.width
      } else {
        next.width = Math.max(smallestFrame.width, width)
      }
    }

    if (axes.height) {
      const to = Math.round(height + dy / scale)

      if (content !== undefined && Math.abs(to - content) * scale < fillDistance) {
        delete next.height
      } else {
        next.height = Math.max(smallestFrame.height, to)
      }
    }

    return next
  }
}

/**
 * The size the design keeps for a frame's viewport after a double-click on the frame's handle: on the handle's axes it
 * goes back to the viewport's width and the content's height.
 */
export function frameSizeReset(frame: FrameSize | undefined, edge: Edge): FrameSize {
  const axes = edgeAxes(edge)
  const next: FrameSize = { ...frame }

  if (axes.width) {
    delete next.width
  }

  if (axes.height) {
    delete next.height
  }

  return next
}

/**
 * The design with `size` for a viewport's frame, keeping no entry for a frame that takes its viewport's size. A frame
 * (the kind) has one size whatever the viewport, which this sets (see `withFrameSize`).
 */
export function withFrame(container: ContainerSpec, viewport: string, size: FrameSize): ContainerSpec {
  if (container.kind === "frame") {
    return withFrameSize(container, size)
  }

  const frames = { ...container.frames }

  if (size.width === undefined && size.height === undefined) {
    delete frames[viewport]
  } else {
    frames[viewport] = size
  }

  const next: ContainerSpec = { ...container, frames }

  if (Object.keys(frames).length === 0) {
    delete next.frames
  }

  return next
}

// Nudging: the arrow keys, as Figma's. A layer in a layout moves one place earlier or later along the layout's
// direction; an absolutely placed layer moves by one step of the spacing scale, or ten with Shift; designs and text
// notes move by 1px, or 10px with Shift.

export type Arrow = "left" | "right" | "up" | "down"

const arrows = new Map<string, Arrow>([
  ["ArrowLeft", "left"],
  ["ArrowRight", "right"],
  ["ArrowUp", "up"],
  ["ArrowDown", "down"]
])

/** The arrow a key is, by `KeyboardEvent.key`. */
export function arrowOf(key: string): Arrow | undefined {
  return arrows.get(key)
}

/** How a layout node lays out its children as the design says, for when its frame doesn't draw it. */
export function modelFlow(parent: DesignNode): Flow {
  const forward = { reversed: false, linesReversed: false }

  if (parent.type !== "layout") {
    return { direction: "column", wraps: false, ...forward }
  }

  const style = parent.style ?? {}

  if (style.display === "grid") {
    return { direction: "row", wraps: true, ...forward, stride: style.columns ?? 2 }
  }

  return { direction: style.direction === "row" ? "row" : "column", wraps: style.wrap === true, ...forward }
}

/**
 * How many places an arrow moves a layer in a layout: one earlier or later along its direction, a row's worth up or
 * down a grid, and nothing across a row or column.
 */
export function reorderStep(flow: Flow, arrow: Arrow): number | undefined {
  const horizontal = arrow === "left" || arrow === "right"
  const forward = arrow === "right" || arrow === "down"

  if (horizontal !== (flow.direction === "row")) {
    // Up and down a grid move a row's worth of places.
    if (!horizontal && flow.stride) {
      return forward ? flow.stride : -flow.stride
    }

    return undefined
  }

  return forward !== flow.reversed ? 1 : -1
}

/**
 * The children's order once the selected ones move `step` places. A place is a child in the layout's flow, so
 * absolutely placed and hidden children (`inFlow` false) keep where they are in the list. Selected layers move
 * together, as a block; one at the end stays. A move of more than one place, a row of a grid, happens only when every
 * selected layer has somewhere to go.
 */
export function reorder(
  children: readonly { id: string; inFlow: boolean }[],
  selected: ReadonlySet<string>,
  step: number
): string[] {
  const order = children.map((child) => child.id)
  const places = children.flatMap((child, index) => (child.inFlow || selected.has(child.id) ? [index] : []))
  const flow = places.map((index) => order[index]!)

  if (Math.abs(step) > 1) {
    const fits = flow.every((id, index) => !selected.has(id) || (index + step >= 0 && index + step < flow.length))

    if (!fits) {
      return order
    }
  }

  for (let pass = 0; pass < Math.abs(step); pass++) {
    if (step < 0) {
      for (let index = 1; index < flow.length; index++) {
        if (selected.has(flow[index]!) && !selected.has(flow[index - 1]!)) {
          swap(flow, index, index - 1)
        }
      }
    } else {
      for (let index = flow.length - 2; index >= 0; index--) {
        if (selected.has(flow[index]!) && !selected.has(flow[index + 1]!)) {
          swap(flow, index, index + 1)
        }
      }
    }
  }

  places.forEach((at, index) => (order[at] = flow[index]!))

  return order
}

function swap(list: string[], a: number, b: number): void {
  ;[list[a], list[b]] = [list[b]!, list[a]!]
}

const deltas: Record<Arrow, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 }
}

/** How far an arrow moves something along its direction, in pixels: one, or ten with Shift. */
function nudgeBy(arrow: Arrow, big: boolean): Point {
  const steps = big ? 10 : 1
  const { x, y } = deltas[arrow]

  return { x: x * steps, y: y * steps }
}

/** Where an arrow moves a design or a text note: 1px, or 10px with Shift, to the whole pixel. */
export function nudgedPosition(position: Point, arrow: Arrow, big: boolean): Point {
  const by = nudgeBy(arrow, big)

  return { x: Math.round(position.x + by.x), y: Math.round(position.y + by.y) }
}

/** What arrows do to a design's layers: the design changed, and the side of a layer that couldn't move, if any. */
export interface LayersNudge {
  container: ContainerSpec
  blocked?: { layer: string; side: Side; token: Length }
}

/** What nudging reads from the frame a selection was picked in. Each says nothing when the layer isn't drawn. */
export interface Drawn {
  /** How the layout a layer sits in places its children. */
  flow(layer: string): Flow | undefined
  /** Where an absolutely placed layer's sides are. */
  insets(layer: string): DrawnSteps | undefined
}

/**
 * Nudges layers of one design, as the board shows them in the state being edited and the frame's viewport. Absolutely
 * placed ones move by their insets, in that state, 1px or 10px with Shift (PAR-194), so an inset can leave the spacing
 * scale, `unit` pixels a step; the rest move among their siblings, in the layout each sits in, as the frame draws it (or
 * as the design says, when it isn't drawn). Layers inside instances don't move.
 */
export function nudgeLayers(
  container: ContainerSpec,
  ids: readonly string[],
  state: StateSpec,
  arrow: Arrow,
  big: boolean,
  unit: number,
  drawn: Drawn,
  viewport?: string
): LayersNudge {
  const shown = boardReader(container, { state, viewport })
  const layers = topmostNodes(container.root, ids).filter((node) => node.id !== container.root.id)
  let next = container
  let blocked: LayersNudge["blocked"]

  const by = nudgeBy(arrow, big)
  const flowing: DesignNode[] = []

  for (const node of layers) {
    const style = shown(node).style ?? {}

    if (style.position !== "absolute") {
      flowing.push(node)
      continue
    }

    const shift = shiftInsets(style, by.x / unit, by.y / unit, drawn.insets(node.id))

    if (shift.blocked) {
      blocked ??= { layer: node.id, side: shift.blocked, token: style[shift.blocked]! }
    }

    if (Object.keys(shift.change).length > 0) {
      // To the hundredth of a pixel, so a run of presses with a 6px unit doesn't drift.
      const change: SideSteps = {}

      for (const side of ["left", "right", "top", "bottom"] as const) {
        const steps = shift.change[side]

        if (steps !== undefined) {
          change[side] = Math.round(steps * unit * 100) / (unit * 100)
        }
      }

      next = editNode(next, boardTarget(next, state.id), node.id, { style: change })
    }
  }

  // Layers in the same layout move together, as one block.
  const groups = new Map<string, { parent: DesignNode; slot?: string; ids: Set<string> }>()

  for (const node of flowing) {
    const location = locateNode(next.root, node.id)
    const parent = location?.ancestors.at(-1)

    if (!location || !parent) {
      continue
    }

    const key = `${parent.id}\n${location.slot ?? ""}`
    const group = groups.get(key) ?? { parent, slot: location.slot, ids: new Set<string>() }
    group.ids.add(node.id)
    groups.set(key, group)
  }

  for (const { parent, slot, ids: selected } of groups.values()) {
    const flow = drawn.flow([...selected][0]!) ?? modelFlow(shown(parent))
    const step = reorderStep(flow, arrow)

    if (!step) {
      continue
    }

    const siblings = childEntries(parent).find((entry) => entry.slot === slot)?.nodes ?? []

    const children = siblings.map((child) => {
      const look = shown(child)

      return { id: child.id, inFlow: !look.hidden && look.style?.position !== "absolute" }
    })

    const order = reorder(children, selected, step)

    if (order.every((id, index) => id === siblings[index]?.id)) {
      continue
    }

    let root = next.root

    for (const [index, id] of order.entries()) {
      root = moveNode(root, id, parent.id, { index, slot })
    }

    next = { ...next, root }
  }

  const nudge: LayersNudge = { container: next }

  if (blocked) {
    nudge.blocked = blocked
  }

  return nudge
}
