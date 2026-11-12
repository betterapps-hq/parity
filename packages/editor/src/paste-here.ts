import {
  type ContainerSpec,
  type DesignNode,
  insertNode,
  lengthSteps,
  locateNode,
  nodeIds,
  type NodeStyle,
  type StateSpec,
  withFreshIds
} from "@parity-app/core"
import { fitBindings, type Pasted } from "./clipboard.ts"
import { type Box, type Flow, type Point, type Rect, type SlotChild, slotAt } from "./drop-slot.ts"
import { boardReader } from "./shown.ts"

/**
 * Paste here, from the canvas's right-click menu, for layers: what's on the clipboard goes into the layout under the
 * pointer, or the component's slot under it, in the place under it, as a dragged layer would land; in an absolutely
 * placed layout, at the pointer. The canvas measures the layout under the pointer and passes it in.
 */

/** The layout under the pointer, or a component's slot, measured in the frame that was right-clicked. */
export interface HereLayout {
  /** The deepest of the design's own layouts, or components with a slot, under the pointer. */
  layout: string
  /** When `layout` is a component, the slot under the pointer. */
  slot?: string
  /**
   * Its children that are drawn, by their index among all its children (in a component, the slot's), with their boxes
   * on screen.
   */
  children: readonly SlotChild[]
  flow: Flow
  /** The layout's box on screen; for a slot, the box of the element its layers are drawn in. */
  box: Rect
  /** The pointer, on screen. */
  point: Point
  /** Where its children's insets count from, on screen: the inside of their containing block's border. */
  origin: Point
  /** Screen pixels to a pixel of the frame: the canvas's zoom times the frame's scale. */
  scale: number
  /** Pixels in a step of the spacing scale. */
  unit: number
}

/** Spacing steps between copies placed side by side at the pointer, as a pasted screen spaces its layers. */
const besideGap = 4

/**
 * Pastes copies of `nodes`, with fresh ids, where `here` says the pointer was. In a layout that flows, they go in the
 * slot under the pointer (see `slotAt`), and in a component's slot the same way. In a layout that's absolutely placed,
 * as the board shows it in `state` and `viewport`, they go last, on top of what's in it, placed absolutely at the
 * pointer. A copy that's absolutely placed itself goes in the slot and at the pointer. At the pointer is its left and
 * top in half steps of the spacing scale, in place of its own insets, though one stretched between its insets keeps its
 * right or bottom (see `placedAt`); several copies placed there go side by side from it. Copies keep the bindings the
 * design has params for (see `fitBindings`). Image files dropped onto the canvas land the same way. Returns the design
 * and the copies' ids; none when `here` isn't one of the design's layouts or a slot of one of its components.
 */
export function pasteHere(
  container: ContainerSpec,
  nodes: readonly DesignNode[],
  here: HereLayout,
  state: StateSpec,
  viewport?: string
): Pasted {
  const target = slotHere(container, here, state, viewport)

  if (!target) {
    return { container, copies: [] }
  }

  const { layout, slot, free, index, at } = target
  const taken = nodeIds(container.root)
  // Several copies placed at the pointer go side by side from it, each a gap right of the one before when that one has
  // a width of its own; one that fills or hugs leaves the next where it starts.
  let left = at.left

  const copies = nodes.map((node) => {
    const copy = withFreshIds(fitBindings(node, container), taken)

    if (!free && copy.style?.position !== "absolute") {
      return copy
    }

    const placed = placedAt(copy, { left, top: at.top })
    const width = lengthSteps(copy.style?.width)

    if (width !== undefined) {
      left += width + besideGap
    }

    return placed
  })

  let root = container.root

  for (const [offset, copy] of copies.entries()) {
    root = insertNode(root, layout, copy, { index: index + offset, slot })
  }

  return { container: { ...container, root }, copies: copies.map((copy) => copy.id) }
}

/** Where layers pasted, dropped or inserted `here` go. */
export interface HereSlot {
  /** The layout, or the component whose slot it is. */
  layout: string
  /** The component's slot, when `layout` is a component. */
  slot?: string
  /** Whether the layout is absolutely placed as the board shows it, so what goes in it goes at the pointer. */
  free: boolean
  /** Among the layout's children, or the slot's. */
  index: number
  /** The pointer from inside the layout's border, in half steps of the spacing scale. */
  at: { left: number; top: number }
  /** In a layout that flows, the line that marks the slot on screen. */
  line?: Box
}

/**
 * Where layers pasted, dropped or inserted `here` go, for Paste here, image files and components dragged from the
 * panel alike: the slot under the pointer in a layout that flows (see `slotAt`), so in a grid or a wrapping row the
 * line of children the pointer is on comes first; or last in an absolutely placed one, at the pointer. A component's
 * slot is placed in as a layout that flows is, by how the element its layers are drawn in places them. Undefined when
 * `here` isn't one of the design's layouts or a slot its component has.
 */
export function slotHere(
  container: ContainerSpec,
  here: HereLayout,
  state: StateSpec,
  viewport?: string
): HereSlot | undefined {
  const layout = locateNode(container.root, here.layout)?.node

  const at = {
    left: halfSteps(here.point.x - here.origin.x, here),
    top: halfSteps(here.point.y - here.origin.y, here)
  }

  if (layout?.type === "component") {
    const { slot } = here
    const children = slot ? layout.slots?.[slot] : undefined

    if (!slot || !children) {
      return undefined
    }

    const place = slotAt(here.children, here.point, here.flow, here.box, children.length)

    return { layout: layout.id, slot, free: false, index: place.index, at, line: place.line }
  }

  if (layout?.type !== "layout") {
    return undefined
  }

  const free = boardReader(container, { state, viewport })(layout).style?.position === "absolute"
  const count = layout.children.length

  if (free) {
    return { layout: layout.id, free, index: count, at }
  }

  const slot = slotAt(here.children, here.point, here.flow, here.box, count)

  return { layout: layout.id, free, index: slot.index, at, line: slot.line }
}

/** A distance on screen in half steps of the spacing scale, as dragging an absolutely placed layer writes them. */
function halfSteps(screen: number, here: HereLayout): number {
  return Math.round((screen / here.scale / here.unit) * 2) / 2
}

/**
 * A layer placed absolutely from its parent's top left, its own insets dropped. One stretched between its insets, set
 * from both sides with no width (or height) of its own, keeps its right (or bottom), so it still reaches that far.
 */
export function placedAt(node: DesignNode, at: { left: number; top: number }): DesignNode {
  const style = node.style ?? {}
  const { top: _top, right: _right, bottom: _bottom, left: _left, ...own } = style

  const stretched = (start: "left" | "top", end: "right" | "bottom", size: "width" | "height") =>
    style[start] !== undefined && style[end] !== undefined && style[size] === undefined

  const placed: NodeStyle = { ...own, position: "absolute", left: { step: at.left }, top: { step: at.top } }

  if (stretched("left", "right", "width")) {
    placed.right = style.right
  }

  if (stretched("top", "bottom", "height")) {
    placed.bottom = style.bottom
  }

  return { ...node, style: placed }
}
