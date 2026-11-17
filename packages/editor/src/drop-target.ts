import { type DesignNode, locateNode } from "@parity-app/core"
import { type Flow, type Point, type Rect, slotAt } from "./drop-slot.ts"

/**
 * Where dragged layers land: the layout and the slot under the pointer, by the frame's layout as it was when the drag
 * began. The canvas measures the frame, its layers' boxes and its layouts' flows, and passes them in; this finds the
 * target and the line that marks it.
 */

/** Where dragged layers go: a layout, and a place among its children. */
export interface MoveTarget {
  design: string
  parent: string
  /** Among the parent's children as they are before the move. */
  index: number
  /** The component slot, when the parent is a component. */
  slot?: string
}

/** A frame's box on screen: where it is, and how wide it's drawn, which gives its scale. */
export interface FrameBox {
  left: number
  top: number
  width: number
}

/** A layer of a frame as the canvas measured it: its box, if it's drawn, and how it places its children, if a layout. */
export interface MeasuredLayer {
  id: string
  box: Rect | undefined
  flow?: Flow
}

/** A frame's layers as they were laid out when a drag began. */
export interface FrameLayout {
  /** The frame's box then, which points now are mapped back into. */
  frame: FrameBox
  /** The design's layers drawn in the frame, parents before children, so the last one under a point is the deepest. */
  layers: { id: string; box: Rect }[]
  boxes: Map<string, Rect>
  /** How each layout drawn in the frame places its children. */
  flows: Map<string, Flow>
}

/**
 * A frame's layout from its layers' measures, parents before children. A layer that isn't drawn (a hidden one) has an
 * empty box at the frame's corner, or none: it's no target.
 */
export function frameLayout(frame: FrameBox, measured: Iterable<MeasuredLayer>): FrameLayout {
  const layers: FrameLayout["layers"] = []
  const boxes = new Map<string, Rect>()
  const flows = new Map<string, Flow>()

  for (const { id, box, flow } of measured) {
    if (!box || (box.right - box.left === 0 && box.bottom - box.top === 0)) {
      continue
    }

    layers.push({ id, box })
    boxes.set(id, box)

    if (flow) {
      flows.set(id, flow)
    }
  }

  return { frame, layers, boxes, flows }
}

/** What `dropTargetAt` looks at. */
export interface DropQuery {
  /** The frame's layout when the drag began, or the first time the pointer was over it. */
  layout: FrameLayout
  /** The frame's box now, which may have moved or zoomed since. */
  frame: FrameBox
  /** The design drawn in the frame, and its root. */
  design: string
  root: DesignNode
  /** The pointer, on screen. */
  point: Point
  /** The design the dragged layers are in, and their ids. */
  source: string
  ids: readonly string[]
  /**
   * Into the deepest layout under the point, even a neighbour of the layers or one inside it, as Ctrl pressed during the
   * drag asks. Never into the layers themselves.
   */
  into?: boolean
}

export interface DropTarget {
  target: MoveTarget
  /** The line marking it, on screen now. */
  line: { x: number; y: number; w: number; h: number }
  /** The layout's children there, in order. */
  siblings: string[]
}

/**
 * Where layers dropped at a point in a frame would go, by the frame's layout when the drag began: the deepest layout
 * under the point, in the slot under the point (see `slotAt`). Over the layout the layers are being dragged in, they
 * stay in it and change places with their neighbours, so a neighbour, or anything inside one, never takes the drop,
 * unless `into` asks for it. The layers themselves never do. Undefined when no layout that's drawn is under the point.
 */
export function dropTargetAt({
  layout,
  frame: now,
  design,
  root,
  point,
  source,
  ids,
  into = false
}: DropQuery): DropTarget | undefined {
  // Points now map back to where they were in the frame then, in case the camera moved.
  const scale = now.width > 0 ? layout.frame.width / now.width : 1

  const then = {
    x: layout.frame.left + (point.x - now.left) * scale,
    y: layout.frame.top + (point.y - now.top) * scale
  }

  const deepest = layout.layers.findLast(({ box }) => inside(box, then))?.id
  const location = deepest ? locateNode(root, deepest) : undefined
  const moving = new Set(ids)
  const same = design === source
  const under = location ? [...location.ancestors, location.node] : [root]
  // Nothing inside the layers being moved can take them.
  const cut = same ? under.findIndex((node) => moving.has(node.id)) : -1
  const chain = cut === -1 ? under : under.slice(0, cut)
  // The layouts the layers are in now: under the point, the drop stops at the deepest of them, unless asked into.
  const own = new Set(same && !into ? ids.map((id) => locateNode(root, id)?.ancestors.at(-1)?.id) : [])
  const stop = chain.findLastIndex((node) => own.has(node.id))
  const parent = (stop === -1 ? chain : chain.slice(0, stop + 1)).findLast((node) => node.type === "layout")

  if (parent?.type !== "layout") {
    return undefined
  }

  const flow = layout.flows.get(parent.id)
  const box = layout.boxes.get(parent.id)

  if (!flow || !box) {
    return undefined
  }

  const children = parent.children.flatMap((child, index) => {
    const childBox = layout.boxes.get(child.id)

    // Layers being moved within their design aren't slots, nor are children that aren't drawn.
    return childBox && !(same && moving.has(child.id)) ? [{ index, box: childBox }] : []
  })

  const slot = slotAt(children, then, flow, box, parent.children.length)

  return {
    target: { design, parent: parent.id, index: slot.index },
    line: {
      x: now.left + (slot.line.x - layout.frame.left) / scale,
      y: now.top + (slot.line.y - layout.frame.top) / scale,
      w: slot.line.w / scale,
      h: slot.line.h / scale
    },
    siblings: parent.children.map((child) => child.id)
  }
}

function inside(box: Rect, point: Point): boolean {
  return point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom
}

/** The modifier keys held, as an event has them. */
export interface Held {
  ctrlKey: boolean
  metaKey: boolean
}

/**
 * Whether Ctrl (Cmd on a Mac) asks a drag to drop into the layout under the pointer, even a neighbour (PAR-206). It
 * counts once it's pressed during the drag: held from the press, it picked the deepest layer to drag (as Ctrl-click
 * selects it), so it must be let go and pressed again, and Ctrl-dragging a card still changes places as a drag does.
 */
export function intoNeighbour(start: Held): (held: Held) => boolean {
  let armed = !(start.ctrlKey || start.metaKey)

  return (held) => {
    const down = held.ctrlKey || held.metaKey

    if (!down) {
      armed = true
    }

    return armed && down
  }
}
