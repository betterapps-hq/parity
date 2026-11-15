import type { DrawnNodes } from "@parity-app/core"
// Imports nothing at runtime, so it runs in the project's own bundle with the guest.
import { isComposite } from "@parity-app/core/values/evaluate"
import type { Root } from "react-dom/client"

/**
 * Finds the DOM each design node draws from React's own tree, the way React DevTools highlights a component, so a
 * component is found even when it renders none of its props, such as `function MemberRow({ member })`.
 *
 * This reads React's internals, as of React 19: a fiber's `child`, `sibling`, `stateNode` and `memoizedProps`, and
 * the root's `_internalRoot.current`. Anything missing makes it give up (undefined), and the canvas falls back to the
 * `data-canvas-node` attribute. `drawn-nodes.test.ts` checks the walk, and `frame-nodes.test.ts` checks it on React
 * itself.
 */

/** The parts of a React fiber the walk reads. */
export interface Fiber {
  child: Fiber | null
  sibling: Fiber | null
  /** A host fiber's tag name (`div`), a component's function or class, or something else of React's. */
  type: unknown
  /** The DOM element of a host fiber, the instance of a class component, or something else of React's. */
  stateNode: unknown
  memoizedProps: unknown
}

/** HostRoot, the fiber at the top of every root, in every React since 16. */
const hostRootTag = 3

/**
 * The current fiber tree of a root `createRoot` made: through the root object (React 18 and 19), else through the
 * container's own key (`__reactContainer$…`), which React puts on it. Undefined when neither is there.
 */
export function currentRootFiber(root: Root, container: Element): Fiber | undefined {
  const internal = "_internalRoot" in root ? root._internalRoot : undefined
  const fromRoot = isComposite(internal) && "current" in internal ? internal.current : undefined

  const holder = fromRoot
    ? undefined
    : Object.entries(container).find(([name]) => name.startsWith("__reactContainer$"))?.[1]

  const stateNode = isComposite(holder) && "stateNode" in holder ? holder.stateNode : undefined
  const fromContainer = isComposite(stateNode) && "current" in stateNode ? stateNode.current : undefined
  const fiber = fromRoot ?? fromContainer

  return isFiber(fiber) && "tag" in fiber && fiber.tag === hostRootTag ? fiber : undefined
}

// React's internals are untyped, so these look for the fields the walk reads rather than parsing them: they're read on
// every hover and commit.

function isFiber(value: unknown): value is Fiber {
  return isComposite(value) && "child" in value && "sibling" in value && "stateNode" in value
}

/** A host fiber's DOM element. */
function isElement(stateNode: unknown): stateNode is Element {
  return isComposite(stateNode) && "nodeType" in stateNode && stateNode.nodeType === 1
}

/** A text fiber's DOM text. */
function isText(stateNode: unknown): stateNode is Text {
  return isComposite(stateNode) && "nodeType" in stateNode && stateNode.nodeType === 3
}

interface Drawn {
  id: string
  parent?: string
  elements: Element[]
  texts: Text[]
}

export interface IndexOptions {
  /** The design node a fiber stands for, if it stands for one. */
  nodeOf(fiber: Fiber): string | undefined
  /** Whether an element or text is drawn in the frame. Content portaled out of it, or hoisted to `<head>`, isn't. */
  inside(node: Node): boolean
}

/**
 * Every design node under a fiber, in tree order, with the elements each draws at its top level. Going down the tree,
 * an element is collected for every node that has no element of its own between it and the element, and isn't gone
 * into further for them: a card's box is its own root element, not the children inside it. So a component returning a
 * fragment gets each of its roots, and one that draws only its children (a provider) gets the children's.
 *
 * Each element also gets an owner, the innermost node it's collected for, so a point over a child layer's DOM belongs
 * to the child even when the parent draws it at its own top level. Text is collected the same way, for nodes that draw
 * it outside any element of their own, so a component that draws only text has its text's box.
 *
 * A fiber that carries the id of a node it's already inside is that node's: a component passes its props, `data-canvas-
 * node` included, to the element or component it wraps. A node drawn twice, as a list's `renderItem` slot is, is one
 * node whose elements are every copy's. Undefined when the tree isn't shaped as expected.
 */
export function indexDrawnNodes(root: Fiber, options: IndexOptions): DrawnNodes | undefined {
  const nodes: Drawn[] = []
  const byId = new Map<string, Drawn>()
  const owners = new Map<Element, string>()
  /** The nodes the walk is inside, outermost first. */
  const within: string[] = []

  const visit = (first: Fiber | null, open: readonly Drawn[]): void => {
    for (let fiber = first; fiber; fiber = fiber.sibling) {
      if (!isFiber(fiber)) {
        throw new Error("Not a fiber")
      }

      let here = open
      let entered = false
      const id = options.nodeOf(fiber)

      if (id !== undefined && !within.includes(id)) {
        let node = byId.get(id)

        if (!node) {
          const parent = within.at(-1)
          node = parent === undefined ? { id, elements: [], texts: [] } : { id, parent, elements: [], texts: [] }
          nodes.push(node)
          byId.set(id, node)
        }

        here = [...open, node]
        within.push(id)
        entered = true
      }

      const element = isElement(fiber.stateNode) ? fiber.stateNode : undefined
      const text = element || !isText(fiber.stateNode) ? undefined : fiber.stateNode

      if (element) {
        if (options.inside(element)) {
          for (const node of here) {
            node.elements.push(element)
          }

          const owner = within.at(-1)

          if (owner !== undefined) {
            owners.set(element, owner)
          }

          visit(fiber.child, [])
        }
      } else if (text) {
        if (options.inside(text)) {
          for (const node of here) {
            node.texts.push(text)
          }
        }
      } else {
        visit(fiber.child, here)
      }

      if (entered) {
        within.pop()
      }
    }
  }

  try {
    visit(root.child, [])
  } catch {
    return undefined
  }

  return {
    ids: nodes.map((node) => node.id),
    elements: (id) => byId.get(id)?.elements ?? [],
    texts: (id) => byId.get(id)?.texts ?? [],
    parent: (id) => byId.get(id)?.parent,
    nodeOf(element) {
      for (let current: Element | null = element; current; current = current.parentElement) {
        const owner = owners.get(current)

        if (owner !== undefined) {
          return owner
        }
      }

      return undefined
    }
  }
}

/** Where a component put the `style` it was given, among the elements it drew. */
export type StylePlacement = "root" | "inner" | "none"

/**
 * Where a component, from its fiber, put the `style` it was given: on an element at its top level (`root`), on one
 * inside another element it drew (`inner`), as a field passing its props to its input does, or on none of them
 * (`none`). The element is the first whose `style` has every value of the one given, its top-level elements looked at
 * first. Fibers `isLayer` says are another layer's are left out, since a slot's layers draw their own styles. Undefined
 * when it was given no style or drew no element, as one still loading or failing hasn't. Throws when the tree isn't
 * shaped as expected.
 */
export function stylePlacement(component: Fiber, isLayer: (fiber: Fiber) => boolean): StylePlacement | undefined {
  const given = styleOf(component)

  if (!given) {
    return undefined
  }

  const top: Fiber[] = []

  const collect = (first: Fiber | null): void => {
    for (let fiber = first; fiber; fiber = fiber.sibling) {
      if (!isFiber(fiber)) {
        throw new Error("Not a fiber")
      }

      if (isLayer(fiber)) {
        continue
      }

      if (isElement(fiber.stateNode)) {
        top.push(fiber)
      } else {
        collect(fiber.child)
      }
    }
  }

  const carries = (fiber: Fiber) => {
    const style = styleOf(fiber)

    return style !== undefined && [...given].every(([key, value]) => style.get(key) === value)
  }

  const inside = (first: Fiber | null): boolean => {
    for (let fiber = first; fiber; fiber = fiber.sibling) {
      if (!isFiber(fiber)) {
        throw new Error("Not a fiber")
      }

      if (isLayer(fiber)) {
        continue
      }

      if ((isElement(fiber.stateNode) && carries(fiber)) || inside(fiber.child)) {
        return true
      }
    }

    return false
  }

  collect(component.child)

  if (top.length === 0) {
    return undefined
  }

  if (top.some(carries)) {
    return "root"
  }

  return top.some((fiber) => inside(fiber.child)) ? "inner" : "none"
}

/** The `style` a fiber was given, by property, when it has any values. */
export function styleOf(fiber: Fiber): ReadonlyMap<string, unknown> | undefined {
  const props = fiber.memoizedProps
  const style = isComposite(props) && "style" in props ? props.style : undefined
  const entries = isComposite(style) ? Object.entries(style) : []

  return entries.length > 0 ? new Map(entries) : undefined
}
