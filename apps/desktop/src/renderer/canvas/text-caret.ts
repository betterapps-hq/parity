/** A caret as it's drawn on screen: where it stands along the line, and the line's top and bottom. */
export interface CaretLine {
  x: number
  top: number
  bottom: number
}

/** An element's text nodes, in order. */
export function textNodes(element: Element): Text[] {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    // SAFETY: the walker shows only text nodes.
    nodes.push(node as Text)
  }

  return nodes
}

/** The text an element draws, from its text nodes in order. */
export function drawnText(element: Element): string {
  return textNodes(element)
    .map((node) => node.data)
    .join("")
}

/**
 * Where a caret before the character at `offset` of an element's text is drawn, counted across its text nodes as a
 * textarea counts them: at the left of that character, or at the right of the last one when it's at the end. An offset
 * past the end is taken as the end. Text with no characters drawn has none.
 */
export function caretLine(element: Element, offset: number): CaretLine | undefined {
  const nodes = textNodes(element).filter((node) => node.length > 0)
  const range = element.ownerDocument.createRange()
  let before = 0

  for (const [index, node] of nodes.entries()) {
    const at = offset - before
    const last = index === nodes.length - 1

    if (at < node.length) {
      range.setStart(node, Math.max(0, at))
      range.setEnd(node, Math.max(0, at) + 1)
      const rect = range.getClientRects()[0]

      if (rect) {
        return { x: rect.left, top: rect.top, bottom: rect.bottom }
      }
    } else if (last) {
      range.setStart(node, node.length - 1)
      range.setEnd(node, node.length)
      const rects = range.getClientRects()
      const rect = rects[rects.length - 1]

      if (rect) {
        return { x: rect.right, top: rect.top, bottom: rect.bottom }
      }
    }

    before += node.length
  }

  return undefined
}
