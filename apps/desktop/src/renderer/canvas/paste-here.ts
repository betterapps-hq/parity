import { flowOf, type HereLayout, type Point } from "@parity-app/editor"
import { findNodeElement, nodeBox } from "../frame.ts"
import type { Hit } from "./hit.ts"

/**
 * Paste here, from the canvas's right-click menu, for layers: this measures the layout under the pointer in its frame,
 * and `@parity-app/editor`'s `pasteHere` puts the copies there. Designs and notes go at the pointer on the canvas, which
 * needs no rules of its own (see `pasteAtPointer` in clipboard.ts).
 */

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
