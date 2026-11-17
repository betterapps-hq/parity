import { bodyAttribute, type DrawnNodes } from "@parity-app/core"
import type { FrozenElement } from "./snapshot.ts"

const namespaces = {
  html: "http://www.w3.org/1999/xhtml",
  svg: "http://www.w3.org/2000/svg",
  math: "http://www.w3.org/1998/Math/MathML"
}

const xlinkNamespace = "http://www.w3.org/1999/xlink"
const xmlNamespace = "http://www.w3.org/XML/1998/namespace"

/** A frozen copy's elements, ready to go into its shadow root, and the nodes they draw. */
export interface BuiltCopy {
  fragment: DocumentFragment
  drawn: DrawnNodes
}

/**
 * A copy's elements, made in `document` with `createElementNS` and `setAttribute` only, under a body stand-in marked
 * `inert`, and the `DrawnNodes` that maps their ids to them. Every element is created in `registry`, the copy's shadow
 * root's own, so none is upgraded by a definition in Parity's window. Each element's id is its path from the body,
 * counting elements only (`0.3.1`). `body` has been through `sanitizePage`.
 */
export function buildCopy(document: Document, body: FrozenElement, registry: CustomElementRegistry): BuiltCopy {
  const ids: string[] = []
  const elements = new Map<string, Element>()
  const parents = new Map<string, string>()
  const nodes = new WeakMap<Element, string>()

  const create = (frozen: FrozenElement) =>
    document.createElementNS(namespaces[frozen.namespace ?? "html"], frozen.tag, { customElementRegistry: registry })

  const standIn = create({ tag: "div", attributes: [], children: [] })
  standIn.setAttribute(bodyAttribute, "")
  setAttributes(standIn, body.attributes)
  standIn.setAttribute("inert", "")

  const pending: { frozen: FrozenElement; into: Element; parent: string | undefined }[] = [
    { frozen: body, into: standIn, parent: undefined }
  ]

  for (let next = pending.pop(); next; next = pending.pop()) {
    let index = 0
    const children: { frozen: FrozenElement; into: Element; parent: string | undefined }[] = []

    for (const child of next.frozen.children) {
      if (!(child instanceof Object)) {
        next.into.append(document.createTextNode(child))
        continue
      }

      const id = next.parent === undefined ? String(index) : `${next.parent}.${index}`
      index += 1
      const element = create(child)
      setAttributes(element, child.attributes)
      next.into.append(element)
      ids.push(id)
      elements.set(id, element)
      nodes.set(element, id)

      if (next.parent !== undefined) {
        parents.set(id, next.parent)
      }

      children.push({ frozen: child, into: element, parent: id })
    }

    pending.push(...children.reverse())
  }

  const fragment = document.createDocumentFragment()
  fragment.append(standIn)

  return { fragment, drawn: drawnCopy(depthFirst(ids, parents), elements, parents, nodes, standIn) }
}

/** Sets attributes as the page had them; `xlink:` and `xml:` names go in their namespaces, as the page parsed them. */
function setAttributes(element: Element, attributes: readonly [string, string][]) {
  for (const [name, value] of attributes) {
    if (name.startsWith("xlink:")) {
      element.setAttributeNS(xlinkNamespace, name, value)
    } else if (name.startsWith("xml:")) {
      element.setAttributeNS(xmlNamespace, name, value)
    } else {
      element.setAttribute(name, value)
    }
  }
}

/** The ids in document order, parents before their children, from the order the walk made them in. */
function depthFirst(made: readonly string[], parents: ReadonlyMap<string, string>): string[] {
  const children = new Map<string | undefined, string[]>()

  for (const id of made) {
    const parent = parents.get(id)
    children.set(parent, [...(children.get(parent) ?? []), id])
  }

  const ordered: string[] = []
  const pending = [...(children.get(undefined) ?? [])].reverse()

  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    ordered.push(id)
    pending.push(...[...(children.get(id) ?? [])].reverse())
  }

  return ordered
}

function drawnCopy(
  ids: readonly string[],
  elements: ReadonlyMap<string, Element>,
  parents: ReadonlyMap<string, string>,
  nodes: WeakMap<Element, string>,
  standIn: Element
): DrawnNodes {
  return {
    ids,
    elements: (id) => {
      const element = elements.get(id)

      return element ? [element] : []
    },
    // Every element of a copy is a node, so a node's text is inside its own element.
    texts: () => [],
    parent: (id) => parents.get(id),
    nodeOf: (element) => {
      for (let at: Element | null = element; at && at !== standIn; at = at.parentElement) {
        const id = nodes.get(at)

        if (id !== undefined) {
          return id
        }
      }

      return undefined
    }
  }
}
