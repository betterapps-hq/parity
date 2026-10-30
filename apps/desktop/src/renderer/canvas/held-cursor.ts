/**
 * The cursor a gesture shows wherever the pointer goes until it ends: grabbing while layers or designs are dragged, the
 * handle's arrows while resizing. A cursor set on the page's body was hidden over the canvas, whose own elements set
 * tldraw's cursor, and over a title, which sets its own. So the cursor is held by a transparent layer over the whole
 * window, above everything, for as long as the gesture lasts. The gesture follows the pointer through window
 * listeners or pointer capture, and finds what's under it by layout boxes, so the layer takes nothing from it; and
 * while it's there, nothing under the pointer reacts to being hovered.
 *
 * Returns what lets it go. Letting go twice is harmless.
 */
export function holdCursor(cursor: string): () => void {
  const layer = document.createElement("div")
  layer.dataset.heldCursor = cursor
  layer.style.cssText = `position: fixed; inset: 0; z-index: 2147483647; cursor: ${cursor}`
  document.body.append(layer)
  return () => layer.remove()
}
