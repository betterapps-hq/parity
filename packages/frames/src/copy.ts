import { bodyAttribute, type DrawnNodes } from "@parity-app/core"
import type { FrozenElement, FrozenShadow } from "./snapshot.ts"

const namespaces = {
  html: "http://www.w3.org/1999/xhtml",
  svg: "http://www.w3.org/2000/svg",
  math: "http://www.w3.org/1998/Math/MathML"
}

const xlinkNamespace = "http://www.w3.org/1999/xlink"
const xmlNamespace = "http://www.w3.org/XML/1998/namespace"

/** How a board prepares a copy's CSS for its mode: shadow roots' stylesheets, and inline `style` attributes. */
export interface CopyPreparation {
  sheet?: (css: string) => string
  inline?: (css: string) => string
}

/** A frozen copy's elements, ready to go into its shadow root, and the nodes they draw. */
export interface BuiltCopy {
  fragment: DocumentFragment
  drawn: DrawnNodes
}

/**
 * A copy's elements, made in `document` with `createElementNS` and `setAttribute` only, under a body stand-in marked
 * `inert`, and the `DrawnNodes` that maps their ids to them. Every element is created in `registry`, the copy's shadow
 * root's own, so none is upgraded by a definition in Parity's window. Each element's id is its path from the body,
 * counting elements only (`0.3.1`). What's inside an `<svg>` has no id: its layer is the picture (`elementLayers`), so
 * selecting a shape in it finds the `<svg>`. An element's open shadow root is attached again, in the same registry,
 * with its own styles, each through `prepare.sheet` (the board's media queries and viewport units, as the page's sheets
 * get); each inline `style` goes through `prepare.inline`; what's in it has no id either, as the page's DOM has none for it, so it selects its host. `body`
 * has been through `sanitizePage`.
 */
export function buildCopy(
  document: Document,
  body: FrozenElement,
  registry: CustomElementRegistry,
  prepare: CopyPreparation = {}
): BuiltCopy {
  return runSteps(buildingCopy(document, body, registry, prepare))
}

/** How many elements `buildingCopy` makes between the pauses it offers. */
const elementsPerStep = 32

/**
 * Builds a copy as `buildCopy` does, pausing after every few elements so a caller can spread it over several frames
 * (PAR-1336). Nothing it makes is in a document until the caller puts the fragment in one, so a pause leaves no half-built
 * copy on screen.
 */
export function* buildingCopy(
  document: Document,
  body: FrozenElement,
  registry: CustomElementRegistry,
  prepare: CopyPreparation = {}
): Generator<void, BuiltCopy> {
  const ids: string[] = []
  const elements = new Map<string, Element>()
  const parents = new Map<string, string>()
  const nodes = new WeakMap<Element, string>()

  const create = (frozen: FrozenElement) =>
    document.createElementNS(namespaces[frozen.namespace ?? "html"], frozen.tag, { customElementRegistry: registry })

  const standIn = create({ tag: "div", attributes: [], children: [] })
  standIn.setAttribute(bodyAttribute, "")
  setAttributes(standIn, body.attributes, prepare.inline)
  standIn.setAttribute("inert", "")

  interface Pending {
    frozen: Pick<FrozenElement, "children">
    into: Element | ShadowRoot
    parent: string | undefined
    /** Inside an `<svg>` or a shadow root, whose elements aren't layers of their own. */
    unlayered: boolean
  }

  /** Attaches a host's shadow root, its styles first, and gives what to build into it, without ids. */
  const shadowContent = (host: Element, shadow: FrozenShadow, id: string): Pending[] => {
    let root: ShadowRoot

    try {
      root = host.attachShadow({ mode: "open", customElementRegistry: registry })
    } catch {
      // An element that can't hold a shadow root keeps only its own children.
      return []
    }

    for (const text of shadow.styles) {
      const style = create({ tag: "style", attributes: [], children: [] })
      style.textContent = prepare.sheet ? prepare.sheet(text) : text
      root.append(style)
    }

    return [{ frozen: shadow, into: root, parent: id, unlayered: true }]
  }

  const pending: Pending[] = [{ frozen: body, into: standIn, parent: undefined, unlayered: false }]

  let made = 0

  for (let next = pending.pop(); next; next = pending.pop()) {
    let index = 0
    const children: Pending[] = []

    for (const child of next.frozen.children) {
      // Within a parent's children too, so a list of thousands of siblings is built over frames as a deep page is.
      if (made >= elementsPerStep) {
        made = 0
        yield
      }

      made += 1

      if (!(child instanceof Object)) {
        next.into.append(document.createTextNode(child))
        continue
      }

      const id = next.parent === undefined ? String(index) : `${next.parent}.${index}`
      index += 1
      const element = create(child)
      setAttributes(element, child.attributes, prepare.inline)
      next.into.append(element)

      if (child.shadow) {
        children.push(...shadowContent(element, child.shadow, id))
      }

      if (next.unlayered) {
        children.push({ frozen: child, into: element, parent: id, unlayered: true })
        continue
      }

      ids.push(id)
      elements.set(id, element)
      nodes.set(element, id)

      if (next.parent !== undefined) {
        parents.set(id, next.parent)
      }

      children.push({
        frozen: child,
        into: element,
        parent: id,
        unlayered: child.namespace === "svg" && child.tag === "svg"
      })
    }

    pending.push(...children.reverse())
  }

  const fragment = document.createDocumentFragment()
  fragment.append(standIn)

  return { fragment, drawn: drawnCopy(depthFirst(ids, parents), elements, parents, nodes, standIn) }
}

/** Runs `steps` to the end and gives what they return. */
export function runSteps<Result>(steps: Generator<void, Result>): Result {
  for (;;) {
    const step = steps.next()

    if (step.done) {
      return step.value
    }
  }
}

/** Sets attributes as the page had them; `xlink:` and `xml:` names go in their namespaces, as the page parsed them. */
function setAttributes(
  element: Element,
  attributes: readonly [string, string][],
  inline: ((css: string) => string) | undefined
) {
  for (const [name, raw] of attributes) {
    const value = name === "style" && inline ? inline(raw) : raw

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
    const siblings = children.get(parent)

    if (siblings) {
      siblings.push(id)
    } else {
      children.set(parent, [id])
    }
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
