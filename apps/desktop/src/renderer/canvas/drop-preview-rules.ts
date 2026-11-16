/**
 * What a drop preview's copies carry in place of `data-canvas-node`, naming the same node: a frame looks for its layers
 * by that attribute in its own shadow root, where the copies are, so with it they'd be taken for layers.
 */
export const previewNodeAttribute = "data-drop-preview-node"

/** Marks a copy of layers, and everything in it, as a drop preview's, so nothing that looks for layers finds it. */
export function markPreviewCopy(copy: Element): void {
  for (const element of [copy, ...copy.querySelectorAll("[data-canvas-node]")]) {
    const node = element.getAttribute("data-canvas-node")

    if (node !== null) {
      element.setAttribute(previewNodeAttribute, node)
      element.removeAttribute("data-canvas-node")
    }
  }
}

/**
 * A frame's own rules (`frameRuleSheets`), written for a drop preview's copies: the same rules, in the same order and
 * cascade layers, against `previewNodeAttribute`. A frame draws a layer that has no classes from rules about its node
 * alone, so without these its copy would lose its size and place, and the layout would make the wrong room. Whichever
 * frame shows the copies adopts it, since a layer dragged into another design takes its rules along.
 */
export function dropPreviewSheet(sheets: readonly CSSStyleSheet[]): CSSStyleSheet {
  const css = sheets.flatMap((sheet) => [...sheet.cssRules].map((rule) => rule.cssText)).join("\n")
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(css.replaceAll("data-canvas-node", previewNodeAttribute))

  return sheet
}
