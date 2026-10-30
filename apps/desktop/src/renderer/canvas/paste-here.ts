import {
  type ContainerSpec,
  type DesignNode,
  insertNode,
  locateNode,
  nodeIds,
  nodeInState,
  type NodeStyle,
  shownVariants,
  type StateSpec,
  withFreshIds
} from "@parity-app/core"
import { findNodeElement, nodeBox } from "../frame.ts"
import { type Flow, flowOf, type Point, type Rect, type Slot, type SlotChild, slotAt } from "./drop-slot.ts"
import type { Hit } from "./hit.ts"

/**
 * Paste here, from the canvas's right-click menu, for layers: what's on the clipboard goes into the layout under the
 * pointer, in the slot under it, as a dragged layer would land; in an absolutely placed layout, at the pointer. Designs
 * and notes go at the pointer on the canvas, which needs no rules of its own (see `pasteAtPointer` in clipboard.ts).
 */

/** The layout under the pointer, measured in the frame that was right-clicked. */
export interface HereLayout {
  /** The deepest of the design's own layouts under the pointer. */
  layout: string
  /** Its children that are drawn, by their index among all its children, with their boxes on screen. */
  children: readonly SlotChild[]
  flow: Flow
  /** The layout's box on screen. */
  box: Rect
  /** The pointer, on screen. */
  point: Point
  /** Where its children's insets count from, on screen: the inside of its border. */
  origin: Point
  /** Screen pixels to a pixel of the frame: the canvas's zoom times the frame's scale. */
  scale: number
  /** Pixels in a step of the spacing scale. */
  unit: number
}

const insets = ["top", "right", "bottom", "left"] as const

/** Spacing steps between copies placed side by side at the pointer, as a pasted screen spaces its layers. */
const besideGap = 4

/**
 * Pastes copies of `nodes`, with fresh ids, where `here` says the pointer was. In a layout that flows, they go in the
 * slot under the pointer (see `slotAt`). In a layout that's absolutely placed, as the state shown places it, they go
 * last, on top of what's in it, placed absolutely at the pointer. A copy that's absolutely placed itself goes in the slot
 * and at the pointer. At the pointer is its left and top in half steps of the spacing scale, in place of its own insets;
 * several copies placed there go side by side from it. Image files dropped onto the canvas land the same way. Returns
 * the design and the copies' ids; none when `here` isn't one of the design's layouts.
 */
export function pasteHere(
  container: ContainerSpec,
  nodes: readonly DesignNode[],
  here: HereLayout,
  state: StateSpec
): { container: ContainerSpec; copies: string[] } {
  const slot = slotHere(container, here, state)
  if (!slot) return { container, copies: [] }
  const { layout, free, index } = slot
  const at = {
    left: halfSteps(here.point.x - here.origin.x, here),
    top: halfSteps(here.point.y - here.origin.y, here)
  }
  const taken = nodeIds(container.root)
  // Several copies placed at the pointer go side by side from it, each a gap right of the one before when that one has
  // a width of its own; one that fills or hugs leaves the next where it starts.
  let left = at.left
  const copies = nodes.map((node) => {
    const copy = withFreshIds(node, taken)
    if (!free && copy.style?.position !== "absolute") return copy
    const placed = placedAt(copy, { left, top: at.top })
    const width = copy.style?.width
    if (typeof width === "number") left += width + besideGap
    return placed
  })
  let root = container.root
  for (const [offset, copy] of copies.entries()) {
    root = insertNode(root, layout, copy, { index: index + offset })
  }
  return { container: { ...container, root }, copies: copies.map((copy) => copy.id) }
}

/**
 * Where layers pasted or dropped `here` go: the layout, whether it's absolutely placed in the state shown, the index
 * they go in at, and, in a layout that flows, the line that marks the slot on screen. Undefined when `here` isn't one of
 * the design's layouts.
 */
export function slotHere(
  container: ContainerSpec,
  here: HereLayout,
  state: StateSpec
): { layout: string; free: boolean; index: number; line?: Slot["line"] } | undefined {
  const layout = locateNode(container.root, here.layout)?.node
  if (layout?.type !== "layout") return undefined
  const free = nodeInState(layout, state, shownVariants(container)).style?.position === "absolute"
  const count = layout.children.length
  if (free) return { layout: layout.id, free, index: count }
  const slot = slotAt(here.children, here.point, here.flow, here.box, count)
  return { layout: layout.id, free, index: slot.index, line: slot.line }
}

/** A distance on screen in half steps of the spacing scale, as dragging an absolutely placed layer writes them. */
function halfSteps(screen: number, here: HereLayout): number {
  return Math.round((screen / here.scale / here.unit) * 2) / 2
}

/** A layer placed absolutely from its parent's top left, its own insets dropped. */
function placedAt(node: DesignNode, at: { left: number; top: number }): DesignNode {
  const own = Object.fromEntries(
    Object.entries(node.style ?? {}).filter(([key]) => !(insets as readonly string[]).includes(key))
  )
  const style: NodeStyle = { ...own, position: "absolute", left: at.left, top: at.top }
  return { ...node, style }
}

/**
 * Measures the layout under a point in the frame `hit` found there, for `pasteHere`: the deepest of the design's own
 * layouts, never one inside an instance. Undefined when there's none, or the frame isn't drawn.
 */
export function measureHere(hit: Hit, point: Point, unit: number): HereLayout | undefined {
  const layout = hit.chain.findLast((node) => node.type === "layout")
  if (layout?.type !== "layout") return undefined
  const element = findNodeElement(hit.host, layout.id)
  const box = nodeBox(hit.host, layout.id)
  const width = parseFloat(hit.host.style.width)
  if (!element || !box || !(width > 0)) return undefined
  const scale = hit.host.getBoundingClientRect().width / width
  const style = getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  const children = layout.children.flatMap((child, index) => {
    const childBox = nodeBox(hit.host, child.id)
    // A child that isn't drawn (hidden in this state) has an empty box at the frame's corner: it's no slot.
    return childBox && (childBox.width > 0 || childBox.height > 0) ? [{ index, box: childBox }] : []
  })
  return {
    layout: layout.id,
    children,
    flow: flowOf(style),
    box,
    point,
    origin: {
      x: rect.left + (parseFloat(style.borderLeftWidth) || 0) * scale,
      y: rect.top + (parseFloat(style.borderTopWidth) || 0) * scale
    },
    scale,
    unit
  }
}
