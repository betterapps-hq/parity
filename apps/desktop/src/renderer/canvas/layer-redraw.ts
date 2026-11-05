/** The attribute that takes a layer off its own compositing while it's drawn again (see `.tl-html-layer` in styles.css). */
export const redrawingAttribute = "data-redrawing"

/** How many animation frames a layer spends off its own compositing: one to draw it as part of the page, one to show it. */
export const redrawFrames = 2

/**
 * Draws a composited layer again at the scale it's shown at, as a browser draws anything else whose size changed.
 * Chrome draws a layer marked `will-change: transform` once and then scales what it drew as its transform changes,
 * never drawing it again, so the canvas's layer drawn zoomed far out stayed blurry zoomed in close (PAR-556). Marked
 * `data-redrawing` for a couple of frames, it goes without the hint, so it's drawn at its scale, then composited again
 * from that. Returns what ends the redraw at once, giving the layer its hint back.
 */
export function redrawLayer(layer: Pick<Element, "toggleAttribute">): () => void {
  let frame = 0
  let left = redrawFrames
  const done = () => {
    cancelAnimationFrame(frame)
    frame = 0
    layer.toggleAttribute(redrawingAttribute, false)
  }
  const step = () => {
    left--
    if (left > 0) frame = requestAnimationFrame(step)
    else done()
  }
  layer.toggleAttribute(redrawingAttribute, true)
  frame = requestAnimationFrame(step)
  return done
}
