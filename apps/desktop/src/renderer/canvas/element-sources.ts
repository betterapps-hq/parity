import { type ElementSource, elementSourceAttribute, parseElementSource } from "@parity-app/core"
import { frameContent } from "../frame-host.ts"

/**
 * The elements a project's own files wrote, found by the line each carries in development (PAR-167, see
 * `@parity-app/code`'s `tagElementSources`). A library's elements carry none, so they're left out.
 */

/** An element a project file wrote, where it's written, and how many such elements it's inside of. */
export interface SourcedElement {
  element: Element
  /** Its tag, as `button`. */
  tag: string
  source: ElementSource
  /** The attribute's value, `path:line:column`, which every element written there shares. */
  at: string
  depth: number
}

/**
 * The element a project file wrote under a point of a frame (client coordinates): the one drawn on top there, or the
 * nearest written element around it, as a library's element inside a project's is the project's to change. Found by
 * the elements' boxes, since frames don't take the pointer outside Interact.
 */
export function sourcedElementAt(host: Element, x: number, y: number): SourcedElement | undefined {
  const content = frameContent(host)
  const found = content ? writtenAt(content, x, y) : undefined

  return found && sourcedElement(found, 0)
}

/** The frame under a point (client coordinates), the one drawn last where boards overlap. */
export function frameAt<T extends Element>(frames: readonly T[], x: number, y: number): T | undefined {
  return frames.findLast((host) => holds(host.getBoundingClientRect(), x, y))
}

/**
 * The innermost written element under a point among `parent`'s children, those drawn later first. An element with no
 * box, as one that's `display: contents`, is looked through.
 */
function writtenAt(parent: ParentNode, x: number, y: number): Element | undefined {
  const { children } = parent

  for (let index = children.length - 1; index >= 0; index--) {
    const child = children[index]!

    if (child.localName === "style" || child.localName === "script") {
      continue
    }

    const rect = child.getBoundingClientRect()
    const boxless = rect.width === 0 && rect.height === 0

    if (!boxless && !holds(rect, x, y)) {
      continue
    }

    const inner = writtenAt(child, x, y)

    if (inner) {
      return inner
    }

    if (boxless) {
      continue
    }

    // The element on top here: it, if a project file wrote it, else the written element around it.
    return child.hasAttribute(elementSourceAttribute) ? child : undefined
  }

  return undefined
}

function holds(rect: DOMRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

/** A file's name without its folders, as `button.tsx`. */
export function fileName(path: string): string {
  return path.split("/").at(-1) ?? path
}

/** Where an element is written, short: the file's name and the line, as `button.tsx:44`. */
export function shortSource({ path, line }: ElementSource): string {
  return `${fileName(path)}:${line}`
}

function sourcedElement(element: Element, depth: number): SourcedElement | undefined {
  const at = element.getAttribute(elementSourceAttribute)
  const source = parseElementSource(at)

  if (!source || !at) {
    return undefined
  }

  return { element, tag: element.localName, source, at, depth }
}
