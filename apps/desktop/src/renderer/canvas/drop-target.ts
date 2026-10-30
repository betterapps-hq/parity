import { type DesignNode, locateNode, walkNodes } from "@parity-app/core"
import type { ContainerEntry } from "../design-store.ts"
import { findNodeElement, nodeBox } from "../frame.ts"
import { flowOf, type Point, type Rect, slotAt } from "./drop-slot.ts"

/** Where dragged layers go: a layout, and a place among its children. */
export interface MoveTarget {
  design: string
  parent: string
  /** Among the parent's children as they are before the move. */
  index: number
  /** The component slot, when the parent is a component. */
  slot?: string
}

/** A frame's layers as they were laid out when a drag began. */
interface FrameLayout {
  /** The frame's box then, which points now are mapped back into. */
  frame: Rect & { width: number }
  /** The design's layers drawn in the frame, parents before children, so the last one under a point is the deepest. */
  layers: { id: string; box: Rect }[]
  boxes: Map<string, Rect>
}

/**
 * Frames' layouts as they were when a drag began. While layers are dragged they're hidden where they were and copies
 * show where they'd land, so the layouts on screen keep changing under the pointer. Drop targets are found in these
 * instead: a neighbour that slid into the dragged layer's place isn't under the pointer, and a slot doesn't move because
 * a copy was shown in it. The frame the drag starts in is measured before anything is hidden; any other frame, the first
 * time the pointer is over it, before a copy is shown in it.
 */
export class DragLayouts {
  private readonly frames = new Map<HTMLElement, FrameLayout>()

  /** Measures a frame of a design now, as it's laid out. */
  measure(host: HTMLElement, root: DesignNode): FrameLayout {
    const frame = host.getBoundingClientRect()
    const layers: FrameLayout["layers"] = []
    const boxes = new Map<string, Rect>()
    walkNodes(root, (node) => {
      const box = nodeBox(host, node.id)
      // A layer that isn't drawn (a hidden one) has an empty box at the frame's corner: it's no target.
      if (!box || (box.width === 0 && box.height === 0)) return
      layers.push({ id: node.id, box })
      boxes.set(node.id, box)
    })
    const layout = { frame, layers, boxes }
    this.frames.set(host, layout)
    return layout
  }

  get(host: HTMLElement, root: DesignNode): FrameLayout {
    return this.frames.get(host) ?? this.measure(host, root)
  }
}

export interface DropAt {
  target: MoveTarget
  /** The line marking it, in client coordinates now. */
  line: { x: number; y: number; w: number; h: number }
  /** The frame it lands in, and the layout's children there, in order. */
  host: HTMLElement
  siblings: string[]
}

/**
 * Where layers dropped at a point in a frame would go, by the frame's layout when the drag began: the deepest layout
 * under the point, in the slot under the point (see `slotAt`). Over the layout the layers are being dragged in, they
 * stay in it and change places with their neighbours, so a neighbour, or anything inside one, never takes the drop;
 * nor do the layers themselves. `source` is the design the layers are in.
 */
export function dropTargetAt(
  layouts: DragLayouts,
  entry: ContainerEntry,
  host: HTMLElement,
  point: Point,
  source: string,
  ids: readonly string[]
): DropAt | undefined {
  const layout = layouts.get(host, entry.container.root)
  // Points now map back to where they were in the frame then, in case the camera moved.
  const now = host.getBoundingClientRect()
  const scale = now.width > 0 ? layout.frame.width / now.width : 1
  const then = {
    x: layout.frame.left + (point.x - now.left) * scale,
    y: layout.frame.top + (point.y - now.top) * scale
  }
  const deepest = layout.layers.findLast(({ box }) => inside(box, then))?.id
  const location = deepest ? locateNode(entry.container.root, deepest) : undefined
  const chain = location ? [...location.ancestors, location.node] : [entry.container.root]
  const moving = new Set(ids)
  const same = entry.key === source
  // The layouts the layers are in now: under the point, the drop stops at the deepest of them.
  const own = new Set(same ? ids.map((id) => locateNode(entry.container.root, id)?.ancestors.at(-1)?.id) : [])
  const stop = chain.findLastIndex((node) => own.has(node.id))
  const parent = (stop === -1 ? chain : chain.slice(0, stop + 1)).findLast((node) => node.type === "layout")
  if (parent?.type !== "layout") return undefined
  const element = findNodeElement(host, parent.id)
  const box = layout.boxes.get(parent.id)
  if (!element || !box) return undefined
  const children = parent.children.flatMap((child, index) => {
    const childBox = layout.boxes.get(child.id)
    // Layers being moved within their design aren't slots, nor are children that aren't drawn.
    return childBox && !(same && moving.has(child.id)) ? [{ index, box: childBox }] : []
  })
  const slot = slotAt(children, then, flowOf(getComputedStyle(element)), box, parent.children.length)
  return {
    target: { design: entry.key, parent: parent.id, index: slot.index },
    line: {
      x: now.left + (slot.line.x - layout.frame.left) / scale,
      y: now.top + (slot.line.y - layout.frame.top) / scale,
      w: slot.line.w / scale,
      h: slot.line.h / scale
    },
    host,
    siblings: parent.children.map((child) => child.id)
  }
}

function inside(box: Rect, point: Point): boolean {
  return point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom
}
