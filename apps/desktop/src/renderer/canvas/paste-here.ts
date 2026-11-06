import {
  childEntries,
  type ComponentNode,
  type ContainerSpec,
  type DesignNode,
  type LayoutNode,
  locateNode
} from "@parity-app/core"
import { type EditFrame, flowOf, type HereLayout, type HereSlot, type Point, slotHere } from "@parity-app/editor"
import { findNodeElement, flowingBoxes, nodeBox } from "../frame.ts"
import { spacingUnit } from "../tokens-store.ts"
import type { ProjectSession } from "../workspace.ts"
import { type Hit, hitTest, inside, pickedIn } from "./hit.ts"

/**
 * Paste here, from the canvas's right-click menu, for layers: this measures the layout under the pointer in its frame,
 * or the component's slot there, and `@parity-app/editor`'s `pasteHere` puts the copies there. Designs and notes go at
 * the pointer on the canvas, which needs no rules of its own (see `pasteAtPointer` in clipboard.ts).
 */

/** What's measured of a layout, or a component's slot, that doesn't depend on where the pointer is in it. */
type Measured = Omit<HereLayout, "point" | "box">

/**
 * The layout under the pointer as it was measured, kept while the pointer stays over it, so a drag over a big grid
 * doesn't measure every child's box and style again at each event (PAR-551). It's measured again once the pointer is
 * over another layout or slot, or the frame has changed under it: another design or version of it, another unit, or
 * the frame drawn elsewhere on screen, as when the canvas pans or zooms.
 */
export class HereMeasures {
  private frame: { host: HTMLElement; container: ContainerSpec; unit: number; at: string } | undefined
  private kept: { key: string; measured: Measured } | undefined

  /** The measurement kept for `key` in this frame, or `measure`'s, which is kept in its place. */
  get(hit: Hit, at: DOMRect, unit: number, key: string, measure: () => Measured | undefined): Measured | undefined {
    const where = `${at.left}:${at.top}:${at.width}:${at.height}`
    const frame = this.frame
    if (!frame || frame.host !== hit.host || frame.container !== hit.entry.container || frame.unit !== unit) {
      this.frame = { host: hit.host, container: hit.entry.container, unit, at: where }
      this.kept = undefined
    } else if (frame.at !== where) {
      frame.at = where
      this.kept = undefined
    }
    if (this.kept?.key === key) return this.kept.measured
    const measured = measure()
    this.kept = measured ? { key, measured } : undefined
    return measured
  }

  /** Forgets what was measured, as when the drag leaves the canvas or drops. */
  clear(): void {
    this.frame = undefined
    this.kept = undefined
  }
}

/** What's at a point on the canvas, for placing something there. */
export type PointPlace =
  /** Over no design's frame: the empty canvas, or a board around its frames. */
  | { kind: "canvas" }
  /** Over a design's frame, with no layout or component's slot under the point to place into. */
  | { kind: "none"; hit: Hit }
  /** Over a layout or a component's slot: what's placed goes in `slot`, in `frame`'s state and viewport. */
  | { kind: "layout"; hit: Hit; here: HereLayout; frame: EditFrame; slot: HereSlot }

/**
 * Where something placed at a point (client coordinates) lands, the one step inserting, dropping image files, Paste
 * here and the text tool share (PAR-570): the deepest of the design's own layouts or slots under it, measured in the
 * frame there, and the slot under the pointer in it, or the pointer itself in an absolutely placed layout (see
 * `slotHere`). It goes in the state and viewport of that frame (see `editFrame`). A drag passes `measures`, so the
 * layout under the pointer is measured once while it stays over it.
 */
export function placeAtPoint(
  session: ProjectSession,
  area: ParentNode,
  point: Point,
  measures?: HereMeasures
): PointPlace {
  const { store, editor } = session
  const hit = hitTest(area, store, point, editor)
  if (!hit) return { kind: "canvas" }
  const here = measureHere(hit, point, spacingUnit(session.tokens.get()), measures)
  const frame = store.editFrame(pickedIn(hit))
  const slot = here && frame && slotHere(frame.container, here, frame.state, frame.viewport)
  return here && frame && slot ? { kind: "layout", hit, here, frame, slot } : { kind: "none", hit }
}

/**
 * Measures the layout under a point in the frame `hit` found there, for `pasteHere`: the deepest of the design's own
 * layouts, or of its components' slots, never one inside an instance. A slot is under the point when the element its
 * layers are drawn in is, so only a slot that holds layers is found. Undefined when there's none, or the frame isn't
 * drawn. Given `measures`, what it measured for the same layout before is used again (see `HereMeasures`).
 */
export function measureHere(hit: Hit, point: Point, unit: number, measures?: HereMeasures): HereLayout | undefined {
  const width = parseFloat(hit.host.style.width)
  if (!(width > 0)) return undefined
  const at = hit.host.getBoundingClientRect()
  const scale = at.width / width
  const kept = (key: string, measure: () => Measured | undefined) =>
    measures ? measures.get(hit, at, unit, key, measure) : measure()
  for (let depth = hit.chain.length - 1; depth >= 0; depth--) {
    const node = hit.chain[depth]!
    if (node.type === "layout") {
      const box = nodeBox(hit.host, node.id)
      const measured = box && kept(node.id, () => measureLayout(hit, node, scale, unit))
      return measured && { ...measured, box, point }
    }
    if (node.type !== "component") continue
    const slot = slotUnder(hit, node, hit.chain[depth + 1], point)
    if (!slot) continue
    const measured = kept(`${node.id}/${slot.slot}`, () => measureSlot(hit, node, slot, scale, unit))
    if (measured) return { ...measured, box: slot.box, point }
  }
  return undefined
}

function measureLayout(hit: Hit, layout: LayoutNode, scale: number, unit: number): Measured | undefined {
  const element = findNodeElement(hit.host, layout.id)
  if (!element) return undefined
  return {
    layout: layout.id,
    children: drawnChildren(hit, layout.children),
    flow: flowOf(getComputedStyle(element)),
    origin: insideBorder(element, scale),
    scale,
    unit
  }
}

/** A component's slot under the point, with the element its layers are drawn in and that element's box. */
interface SlotUnder {
  slot: string
  nodes: readonly DesignNode[]
  element: HTMLElement
  /** The layers' containing block, which their insets count from. */
  around: HTMLElement
  box: DOMRect
}

/**
 * A component's slot under the point: the one the layer under it is in first, then any other whose layers are drawn in
 * an element under it.
 */
function slotUnder(
  hit: Hit,
  component: ComponentNode,
  under: DesignNode | undefined,
  point: Point
): SlotUnder | undefined {
  const first = under && locateNode(component, under.id)?.slot
  const slots = childEntries(component).toSorted((a, b) => Number(b.slot === first) - Number(a.slot === first))
  for (const { slot, nodes } of slots) {
    const drawn = nodes.map((node) => findNodeElement(hit.host, node.id)).find((element) => element !== undefined)
    const element = drawn && drawnIn(drawn)
    const around = drawn?.offsetParent
    if (!slot || !element || !(around instanceof HTMLElement)) continue
    const box = element.getBoundingClientRect()
    if (inside(box, point)) return { slot, nodes, element, around, box }
  }
  return undefined
}

/** A slot is measured as a layout is: its flow is the element's its layers are drawn in. */
function measureSlot(hit: Hit, component: ComponentNode, under: SlotUnder, scale: number, unit: number): Measured {
  return {
    layout: component.id,
    slot: under.slot,
    children: drawnChildren(hit, under.nodes),
    flow: flowOf(getComputedStyle(under.element), flowingBoxes(under.element)),
    origin: insideBorder(under.around, scale),
    scale,
    unit
  }
}

/** The element a layer is drawn in: its parent element, through those that draw no box of their own. */
function drawnIn(element: HTMLElement): HTMLElement | undefined {
  let parent = element.parentElement
  while (parent && getComputedStyle(parent).display === "contents") parent = parent.parentElement
  return parent ?? undefined
}

/** Children that are drawn, by their index among them, with their boxes. */
function drawnChildren(hit: Hit, nodes: readonly DesignNode[]): HereLayout["children"] {
  return nodes.flatMap((child, index) => {
    const childBox = nodeBox(hit.host, child.id)
    // A child that isn't drawn (hidden in this state) has an empty box at the frame's corner: it's no slot.
    return childBox && (childBox.width > 0 || childBox.height > 0) ? [{ index, box: childBox }] : []
  })
}

/** The inside of an element's border, on screen, where the insets of what it contains count from. */
function insideBorder(element: HTMLElement, scale: number): Point {
  const style = getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  return {
    x: rect.left + (parseFloat(style.borderLeftWidth) || 0) * scale,
    y: rect.top + (parseFloat(style.borderTopWidth) || 0) * scale
  }
}
