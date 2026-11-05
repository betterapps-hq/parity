import { childEntries, type ComponentNode, type DesignNode, type LayoutNode, locateNode } from "@parity-app/core"
import { flowOf, type HereLayout, type Point } from "@parity-app/editor"
import { findNodeElement, flowingBoxes, nodeBox } from "../frame.ts"
import { type Hit, inside } from "./hit.ts"

/**
 * Paste here, from the canvas's right-click menu, for layers: this measures the layout under the pointer in its frame,
 * or the component's slot there, and `@parity-app/editor`'s `pasteHere` puts the copies there. Designs and notes go at
 * the pointer on the canvas, which needs no rules of its own (see `pasteAtPointer` in clipboard.ts).
 */

/**
 * Measures the layout under a point in the frame `hit` found there, for `pasteHere`: the deepest of the design's own
 * layouts, or of its components' slots, never one inside an instance. A slot is under the point when the element its
 * layers are drawn in is, so only a slot that holds layers is found. Undefined when there's none, or the frame isn't
 * drawn.
 */
export function measureHere(hit: Hit, point: Point, unit: number): HereLayout | undefined {
  const width = parseFloat(hit.host.style.width)
  if (!(width > 0)) return undefined
  const scale = hit.host.getBoundingClientRect().width / width
  for (let depth = hit.chain.length - 1; depth >= 0; depth--) {
    const node = hit.chain[depth]!
    if (node.type === "layout") return measureLayout(hit, node, point, scale, unit)
    if (node.type !== "component") continue
    const slot = measureSlot(hit, node, hit.chain[depth + 1], point, scale, unit)
    if (slot) return slot
  }
  return undefined
}

function measureLayout(
  hit: Hit,
  layout: LayoutNode,
  point: Point,
  scale: number,
  unit: number
): HereLayout | undefined {
  const element = findNodeElement(hit.host, layout.id)
  const box = nodeBox(hit.host, layout.id)
  if (!element || !box) return undefined
  const style = getComputedStyle(element)
  return {
    layout: layout.id,
    children: drawnChildren(hit, layout.children),
    flow: flowOf(style),
    box,
    point,
    origin: insideBorder(element, scale),
    scale,
    unit
  }
}

/**
 * A component's slot under the point: the one the layer under it is in first, then any other whose layers are drawn in
 * an element under it. Its flow and box are that element's, and its layers' insets count from their containing block.
 */
function measureSlot(
  hit: Hit,
  component: ComponentNode,
  under: DesignNode | undefined,
  point: Point,
  scale: number,
  unit: number
): HereLayout | undefined {
  const first = under && locateNode(component, under.id)?.slot
  const slots = childEntries(component).toSorted((a, b) => Number(b.slot === first) - Number(a.slot === first))
  for (const { slot, nodes } of slots) {
    const drawn = nodes.map((node) => findNodeElement(hit.host, node.id)).find((element) => element !== undefined)
    const element = drawn && drawnIn(drawn)
    const around = drawn?.offsetParent
    if (!slot || !element || !(around instanceof HTMLElement)) continue
    const box = element.getBoundingClientRect()
    if (!inside(box, point)) continue
    return {
      layout: component.id,
      slot,
      children: drawnChildren(hit, nodes),
      flow: flowOf(getComputedStyle(element), flowingBoxes(element)),
      box,
      point,
      origin: insideBorder(around, scale),
      scale,
      unit
    }
  }
  return undefined
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
