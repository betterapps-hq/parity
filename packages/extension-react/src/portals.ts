// Compiled by the customer's build tool, with the guest: this runs in the same window as the canvas.
// Imports nothing at runtime, so it runs in the project's own bundle with the guest.
import { isComposite } from "@parity-app/core/values/evaluate"

/**
 * Content a frame's components portal to `document.body`, as Base UI's and Radix's selects, menus, popovers and dialogs
 * do, drawn in the frame instead (PAR-881). Out in Parity's page it's outside the frame's shadow root, so it had none of
 * the project's styles and wasn't in the frame's screenshots. Neither library lets a project say where every portal
 * goes, so the frame takes what React puts in the page's body for it: the element goes in the frame's own body, after
 * what's drawn there, as it would on the project's page. React keeps rendering into it wherever it is, and takes it out
 * again through the page's body, which finds it in the frame.
 *
 * Which frame an element is for is read from React's tree: the root its fiber is under. Content added to the body
 * without React, or by a root that isn't a frame's (Parity's own menus), stays where it was put.
 */

/** Marks content a frame took from the page's body. */
export const framePortalAttribute = "data-canvas-portal"

/** Each frame's body, by the element React renders the frame into. */
const bodies = new Map<object, Element>()

/**
 * Takes what React portals to the page's body for the frame rendered into `target` into the frame's body, the element
 * standing in for `<body>`. Gives back a function that stops, once the frame's root is unmounted.
 */
export function framePortals(target: Element, body: Element): () => void {
  install()
  bodies.set(target, body)

  return () => {
    if (bodies.get(target) === body) {
      bodies.delete(target)
    }
  }
}

/** The frame body a node React is adding to the page's body belongs in, if it's for a frame. */
function frameBodyOf(node: Node): Element | undefined {
  if (bodies.size === 0 || node.nodeType !== 1) {
    return undefined
  }

  const container = rootContainerOf(node)
  const body = container && bodies.get(container)

  return body?.isConnected ? body : undefined
}

/** The parts of a fiber read here. */
interface Fiber {
  return: Fiber | null
  stateNode: unknown
}

/**
 * The element a React element's root renders into: up from the fiber React keeps on the element (`__reactFiber$…`,
 * React 17 to 19) to the top of its tree, whose root holds its container. Portals are on the way and are passed.
 */
function rootContainerOf(node: Node): object | undefined {
  let fiber: unknown = Object.entries(node).find(([name]) => name.startsWith("__reactFiber$"))?.[1]

  if (!isFiber(fiber)) {
    return undefined
  }

  while (fiber.return) {
    fiber = fiber.return

    if (!isFiber(fiber)) {
      return undefined
    }
  }

  const root = fiber.stateNode
  const container = isComposite(root) && "containerInfo" in root ? root.containerInfo : undefined

  return isComposite(container) ? container : undefined
}

function isFiber(value: unknown): value is Fiber {
  return isComposite(value) && "return" in value && "stateNode" in value
}

let installed = false

/**
 * Answers the page body's `appendChild`, `insertBefore` and `removeChild` for frames, once per window. React adds a
 * portal's children to its container with the first two and takes them out with the third.
 */
function install(): void {
  if (installed || typeof document === "undefined") {
    return
  }

  installed = true
  const page = document.body
  const append = page.appendChild.bind(page)
  const insert = page.insertBefore.bind(page)
  const remove = page.removeChild.bind(page)

  const take = (node: Node, body: Element, before: Node | null) => {
    if (node instanceof Element) {
      node.setAttribute(framePortalAttribute, "")
    }

    if (before && before.parentNode === body) {
      body.insertBefore(node, before)
    } else {
      body.append(node)
    }

    return node
  }

  // Each takes and returns what the body's own does, and passes anything not for a frame on to it.
  Object.defineProperty(page, "appendChild", {
    configurable: true,
    value(node: Node): Node {
      const body = frameBodyOf(node)

      return body ? take(node, body, null) : append(node)
    }
  })

  Object.defineProperty(page, "insertBefore", {
    configurable: true,
    value(node: Node, before: Node | null): Node {
      const body = frameBodyOf(node)

      if (body) {
        return take(node, body, before)
      }

      // A sibling a frame took isn't in the page's body any more, so the node goes last, as React expects it to.
      return before && before.parentNode !== page ? append(node) : insert(node, before)
    }
  })

  Object.defineProperty(page, "removeChild", {
    configurable: true,
    value(node: Node): Node {
      if (node.parentNode !== page && node instanceof Element && node.hasAttribute(framePortalAttribute)) {
        node.removeAttribute(framePortalAttribute)
        node.remove()

        return node
      }

      return remove(node)
    }
  })
}
