import { describe, expect, it } from "vite-plus/test"
import { currentRootFiber, type Fiber, indexDrawnNodes } from "./drawn-nodes.ts"

// Fibers shaped as React 19 makes them, with stand-ins for DOM elements. frame.test.ts checks the same walk on React
// itself, in Chrome.

interface FakeElement {
  nodeType: 1
  tag: string
  parentElement: FakeElement | null
}

/** A spec of a fiber: a host element, a component, a design node's boundary, a portal, or bare text. */
type Spec =
  | { host: string; props?: Record<string, unknown>; outside?: boolean; children?: Spec[] }
  | { component: string; props?: Record<string, unknown>; children?: Spec[] }
  | { boundary: string; children?: Spec[] }
  | { portal: true; children?: Spec[] }
  | { text: string }

const Boundary = class Boundary {}

/** Builds the fibers for a spec, with host elements nested as the DOM would nest them, and the root above them. */
function build(specs: Spec[]) {
  const elements = new Map<string, FakeElement>()
  const outside = new Set<FakeElement>()
  const make = (spec: Spec, parent: FakeElement | null): Fiber => {
    const fiber: Fiber = { child: null, sibling: null, type: null, stateNode: null, memoizedProps: {} }
    let children: Spec[] = []
    let below = parent
    if ("host" in spec) {
      const element: FakeElement = { nodeType: 1, tag: spec.host, parentElement: spec.outside ? null : parent }
      elements.set(String((spec.props?.id ?? spec.host) as unknown), element)
      if (spec.outside) outside.add(element)
      Object.assign(fiber, { type: spec.host, stateNode: element, memoizedProps: spec.props ?? {} })
      children = spec.children ?? []
      below = element
    } else if ("component" in spec) {
      Object.assign(fiber, { type: () => null, memoizedProps: spec.props ?? {} })
      children = spec.children ?? []
    } else if ("boundary" in spec) {
      Object.assign(fiber, { type: Boundary, stateNode: Object.assign(new Boundary(), { nodeId: spec.boundary }) })
      children = spec.children ?? []
    } else if ("portal" in spec) {
      Object.assign(fiber, { stateNode: { containerInfo: {} } })
      children = spec.children ?? []
    } else {
      Object.assign(fiber, { stateNode: { nodeType: 3, data: spec.text }, memoizedProps: spec.text })
    }
    const made = children.map((child) => make(child, below))
    fiber.child = made[0] ?? null
    made.forEach((child, index) => (child.sibling = made[index + 1] ?? null))
    return fiber
  }
  const root: Fiber & { tag: number } = {
    tag: 3,
    child: null,
    sibling: null,
    type: null,
    stateNode: {},
    memoizedProps: {}
  }
  const top = specs.map((spec) => make(spec, null))
  root.child = top[0] ?? null
  top.forEach((child, index) => (child.sibling = top[index + 1] ?? null))
  const drawn = indexDrawnNodes(root, {
    nodeOf: (fiber) => {
      if (fiber.stateNode instanceof Boundary) return (fiber.stateNode as { nodeId: string }).nodeId
      const id =
        typeof fiber.type === "string"
          ? (fiber.memoizedProps as Record<string, unknown>)["data-canvas-node"]
          : undefined
      return typeof id === "string" ? id : undefined
    },
    inside: (element) => !outside.has(element as unknown as FakeElement)
  })
  const element = (id: string) => elements.get(id) as unknown as Element
  return { drawn: drawn!, element, root }
}

const tags = (elements: readonly Element[]) => elements.map((element) => (element as unknown as FakeElement).tag)

describe("finding the DOM a design node draws", () => {
  it("finds a component that renders none of its props by its boundary", () => {
    // function MemberRow({ member }) { return <tr>…</tr> }
    const { drawn, element } = build([
      {
        boundary: "row",
        children: [
          {
            component: "MemberRow",
            props: { member: {}, "data-canvas-node": "row" },
            children: [{ host: "tr", children: [{ host: "td" }] }]
          }
        ]
      }
    ])
    expect(drawn.ids).toEqual(["row"])
    expect(tags(drawn.elements("row"))).toEqual(["tr"])
    expect(drawn.nodeOf(element("td"))).toBe("row")
  })

  it("collects every root of a fragment, and none for a component that draws nothing", () => {
    const { drawn } = build([
      { boundary: "pair", children: [{ component: "Pair", children: [{ host: "h3" }, { host: "p" }] }] },
      { boundary: "nothing", children: [{ component: "Nothing" }] }
    ])
    expect(tags(drawn.elements("pair"))).toEqual(["h3", "p"])
    expect(drawn.elements("nothing")).toEqual([])
    expect(drawn.ids).toEqual(["pair", "nothing"])
  })

  it("takes a field's outer element, not the inner input its props are passed to", () => {
    const { drawn, element } = build([
      {
        boundary: "email",
        children: [
          {
            component: "Field",
            children: [
              {
                host: "label",
                children: [{ host: "span" }, { host: "input", props: { id: "input", "data-canvas-node": "email" } }]
              }
            ]
          }
        ]
      }
    ])
    expect(drawn.ids).toEqual(["email"])
    expect(tags(drawn.elements("email"))).toEqual(["label"])
    expect(drawn.nodeOf(element("input"))).toBe("email")
  })

  it("stops at nested nodes, so their DOM belongs to them", () => {
    const { drawn, element } = build([
      {
        host: "div",
        props: { id: "row", "data-canvas-node": "row" },
        children: [
          {
            boundary: "card",
            children: [
              {
                component: "Card",
                children: [
                  {
                    host: "section",
                    children: [
                      { host: "p", props: { id: "title", "data-canvas-node": "title" }, children: [{ text: "Hi" }] }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ])
    expect(drawn.ids).toEqual(["row", "card", "title"])
    expect(tags(drawn.elements("row"))).toEqual(["div"])
    expect(tags(drawn.elements("card"))).toEqual(["section"])
    expect(tags(drawn.elements("title"))).toEqual(["p"])
    expect([drawn.parent("row"), drawn.parent("card"), drawn.parent("title")]).toEqual([undefined, "row", "card"])
    expect(drawn.nodeOf(element("section"))).toBe("card")
    expect(drawn.nodeOf(element("title"))).toBe("title")
  })

  it("gives a component that draws only its children their elements, which still belong to the children", () => {
    const { drawn, element } = build([
      {
        boundary: "provider",
        children: [
          {
            component: "Provider",
            children: [
              { host: "p", props: { id: "first", "data-canvas-node": "first" } },
              { host: "p", props: { id: "second", "data-canvas-node": "second" } }
            ]
          }
        ]
      }
    ])
    expect(tags(drawn.elements("provider"))).toEqual(["p", "p"])
    expect(drawn.nodeOf(element("second"))).toBe("second")
    expect(drawn.parent("second")).toBe("provider")
  })

  it("leaves out what's portaled out of the frame, and keeps what's portaled within it", () => {
    const { drawn } = build([
      {
        boundary: "dialog",
        children: [
          {
            component: "Dialog",
            children: [
              { host: "button" },
              {
                portal: true,
                children: [
                  { host: "aside", outside: true, children: [{ host: "p", props: { "data-canvas-node": "body" } }] }
                ]
              },
              { portal: true, children: [{ host: "nav" }] }
            ]
          }
        ]
      }
    ])
    expect(tags(drawn.elements("dialog"))).toEqual(["button", "nav"])
    expect(drawn.ids).toEqual(["dialog"])
  })

  it("makes one node of a slot drawn twice, with both copies", () => {
    const item = { host: "li", props: { "data-canvas-node": "item" } }
    const { drawn } = build([
      { boundary: "list", children: [{ component: "List", children: [{ host: "ul", children: [item, item] }] }] }
    ])
    expect(drawn.ids).toEqual(["list", "item"])
    expect(tags(drawn.elements("item"))).toEqual(["li", "li"])
  })

  it("gives up on a tree that isn't made of fibers", () => {
    const root = { child: { child: null, type: "div" }, sibling: null, type: null, stateNode: {}, memoizedProps: {} }
    expect(indexDrawnNodes(root as unknown as Fiber, { nodeOf: () => undefined, inside: () => true })).toBeUndefined()
  })
})

describe("reaching a root's fibers", () => {
  const container = {} as Element
  const hostRoot = { tag: 3, child: null, sibling: null, type: null, stateNode: {}, memoizedProps: null }

  it("goes through the root createRoot returns", () => {
    expect(currentRootFiber({ _internalRoot: { current: hostRoot } }, container)).toBe(hostRoot)
  })

  it("goes through the container's key when the root doesn't say", () => {
    const marked = { __reactContainer$abc: { stateNode: { current: hostRoot } } } as unknown as Element
    expect(currentRootFiber({}, marked)).toBe(hostRoot)
  })

  it("gives up when neither leads to a root fiber", () => {
    expect(currentRootFiber({}, container)).toBeUndefined()
    expect(currentRootFiber({ _internalRoot: { current: { ...hostRoot, tag: 5 } } }, container)).toBeUndefined()
    expect(currentRootFiber({ _internalRoot: { current: { tag: 3 } } }, container)).toBeUndefined()
  })
})
