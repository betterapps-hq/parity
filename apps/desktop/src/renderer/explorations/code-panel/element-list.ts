import { elementSourceAttribute, parseElementSource } from "@parity-app/core"
import type { SourcedElement } from "../../canvas/element-sources.ts"

/** At most this many elements are listed for a layer; a layer that draws a long list is cut off there. */
const listedElements = 60

/**
 * The elements under `roots` that the project's files wrote, in the order they're drawn, each as deep as the written
 * elements around it, so the list reads as the code nests. The roots themselves count when they were written so.
 */
export function sourcedElements(roots: readonly Element[], limit = listedElements): SourcedElement[] {
  const found: SourcedElement[] = []

  const visit = (element: Element, depth: number) => {
    if (found.length >= limit) {
      return
    }

    const sourced = sourcedElement(element, depth)

    if (sourced) {
      found.push(sourced)
    }

    for (const child of element.children) {
      visit(child, sourced ? depth + 1 : depth)
    }
  }

  for (const root of roots) {
    visit(root, 0)
  }

  return found
}

/** The elements under `roots` written at one place in the code, as a list's items all are. */
export function elementsWrittenAt(roots: readonly Element[], at: string): Element[] {
  const selector = `[${elementSourceAttribute}="${CSS.escape(at)}"]`

  return roots.flatMap((root) => [...(root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)])
}

function sourcedElement(element: Element, depth: number): SourcedElement | undefined {
  const at = element.getAttribute(elementSourceAttribute)
  const source = parseElementSource(at)

  if (!source || !at) {
    return undefined
  }

  return { element, tag: element.localName, source, at, depth }
}
