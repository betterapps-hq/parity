import type { DrawnNodes } from "@parity-app/core"

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
export function currentRootFiber(root: unknown, container: Element): Fiber | undefined {
  const fromRoot = (root as { _internalRoot?: { current?: unknown } } | undefined)?._internalRoot?.current
  const key = fromRoot ? undefined : Object.keys(container).find((name) => name.startsWith("__reactContainer$"))
  const fromContainer = key
    ? (container as unknown as Record<string, { stateNode?: { current?: unknown } } | undefined>)[key]?.stateNode
        ?.current
    : undefined
  const fiber = (fromRoot ?? fromContainer) as (Fiber & { tag?: unknown }) | undefined
  return fiber && fiber.tag === hostRootTag && isFiber(fiber) ? fiber : undefined
}

function isFiber(value: unknown): value is Fiber {
  return typeof value === "object" && value !== null && "child" in value && "sibling" in value && "stateNode" in value
}

interface Drawn {
  id: string
  parent?: string
  elements: Element[]
}

export interface IndexOptions {
  /** The design node a fiber stands for, if it stands for one. */
  nodeOf(fiber: Fiber): string | undefined
  /** Whether an element is drawn in the frame. Content portaled out of it, or hoisted to `<head>`, isn't. */
  inside(element: Element): boolean
}

/**
 * Every design node under a fiber, in tree order, with the elements each draws at its top level. Going down the tree,
 * an element is collected for every node that has no element of its own between it and the element, and isn't gone
 * into further for them: a card's box is its own root element, not the children inside it. So a component returning a
 * fragment gets each of its roots, and one that draws only its children (a provider) gets the children's.
 *
 * Each element also gets an owner, the innermost node it's collected for, so a point over a child layer's DOM belongs
 * to the child even when the parent draws it at its own top level.
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
      if (!isFiber(fiber)) throw new Error("Not a fiber")
      let here = open
      let entered = false
      const id = options.nodeOf(fiber)
      if (id !== undefined && !within.includes(id)) {
        let node = byId.get(id)
        if (!node) {
          node = { id, ...(within.length > 0 ? { parent: within.at(-1) } : {}), elements: [] }
          nodes.push(node)
          byId.set(id, node)
        }
        here = [...open, node]
        within.push(id)
        entered = true
      }
      const element = elementOf(fiber.stateNode)
      if (element) {
        if (options.inside(element)) {
          for (const node of here) node.elements.push(element)
          const owner = within.at(-1)
          if (owner !== undefined) owners.set(element, owner)
          visit(fiber.child, [])
        }
      } else {
        visit(fiber.child, here)
      }
      if (entered) within.pop()
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
    parent: (id) => byId.get(id)?.parent,
    nodeOf(element) {
      for (let current: Element | null = element; current; current = current.parentElement) {
        const owner = owners.get(current)
        if (owner !== undefined) return owner
      }
      return undefined
    }
  }
}

/** A host fiber's DOM element. Text nodes don't count: a component that draws only text has no box of its own. */
function elementOf(stateNode: unknown): Element | undefined {
  return typeof stateNode === "object" && stateNode !== null && (stateNode as Node).nodeType === 1
    ? (stateNode as Element)
    : undefined
}
