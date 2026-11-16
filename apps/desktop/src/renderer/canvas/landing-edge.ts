import { landingEdgeStyle } from "./drag-motion.ts"

/** How a landing outline is drawn: its color, the frame's scale, the layer's corners, and whether the layer clips. */
export interface LandingEdgeLook {
  color: string
  scale: number
  radius: number
  clips: boolean
}

/** Anchor names handed out so far, so each copy's is its own. */
let anchors = 0

/**
 * Draws a dragged layer's landing outline, `edge`, round `copy`, the hidden copy holding the layer's place in a layout,
 * each time the copy is put somewhere. It goes inside the copy, which carries it wherever the copy goes, just outside
 * the copy's corners, or just inside them when the copy clips what overflows it. A copy that can't draw what it holds,
 * as an image, a field or a custom element without a slot can't, gets it beside it instead, pinned round it by anchor
 * positioning, where nothing of the copy's clips it.
 */
export function drawLandingEdge(
  copy: HTMLElement,
  edge: HTMLElement,
  { color, scale, radius, clips }: LandingEdgeLook
) {
  edge.style.cssText = ""
  copy.append(edge)
  setStyles(edge, landingEdgeStyle(color, scale, radius, { inside: clips }))

  if (edge.getClientRects().length > 0) {
    return
  }

  const anchor = copy.style.getPropertyValue("anchor-name") || `--landing-edge-${++anchors}`
  copy.style.setProperty("anchor-name", anchor, "important")
  copy.after(edge)
  edge.style.cssText = ""
  setStyles(edge, landingEdgeStyle(color, scale, radius, { anchor }))
}

function setStyles(element: HTMLElement, styles: Record<string, string>): void {
  for (const [name, value] of Object.entries(styles)) {
    element.style.setProperty(name, value, "important")
  }
}
