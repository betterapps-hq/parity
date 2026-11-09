import { isComposite, isText } from "@parity-app/core/values/evaluate"
import type { Root } from "react-dom/client"
import { describe, expect, it } from "vite-plus/test"
import { currentRootFiber, type Fiber, indexDrawnNodes, stylePlacement } from "./drawn-nodes.ts"

// Fibers shaped as React 19 makes them, with stand-ins for DOM elements. frame.test.ts checks the same walk on React
// itself, in Chrome.

/** The parts of a DOM element the walk reads. */
interface FakeElement {
  nodeType: number
  localName: string
  parentElement: FakeElement | null
}

/** A stand-in for a DOM element, with no DOM to make one in. */
function fakeElement(localName: string, parentElement: Element | null = null): Element {
  const fake: FakeElement = { nodeType: 1, localName, parentElement }

  // SAFETY: the walk and these tests read only an element's nodeType, localName and parentElement.
  return fake as Element
}

/** The props the specs give, as a component or an element takes them. */
interface FakeProps {
  id?: string
  "data-canvas-node"?: string
  member?: { name?: string }
  style?: Record<string, string>
}

/** A spec of a fiber: a host element, a component, a design node's boundary, a portal, or bare text. */
type Spec =
  | { host: string; props?: FakeProps; outside?: boolean; children?: Spec[] }
  | { component: string; props?: FakeProps; children?: Spec[] }
  | { boundary: string; children?: Spec[] }
  | { portal: true; children?: Spec[] }
  | { text: string }

class Boundary {
  readonly nodeId: string

  constructor(nodeId: string) {
    this.nodeId = nodeId
  }
}

/** Builds the fibers for a spec, with host elements nested as the DOM would nest them, and the root above them. */
function build(specs: Spec[]) {
  const elements = new Map<string, Element>()
  const outside = new Set<Node>()

  const make = (spec: Spec, parent: Element | null): Fiber => {
    const fiber: Fiber = { child: null, sibling: null, type: null, stateNode: null, memoizedProps: {} }
    let children: Spec[] = []
    let below = parent

    if ("host" in spec) {
      const element = fakeElement(spec.host, spec.outside ? null : parent)
      elements.set(spec.props?.id ?? spec.host, element)

      if (spec.outside) {
        outside.add(element)
      }

      Object.assign(fiber, { type: spec.host, stateNode: element, memoizedProps: spec.props ?? {} })
      children = spec.children ?? []
      below = element
    } else if ("component" in spec) {
      Object.assign(fiber, { type: () => null, memoizedProps: spec.props ?? {} })
      children = spec.children ?? []
    } else if ("boundary" in spec) {
      Object.assign(fiber, { type: Boundary, stateNode: new Boundary(spec.boundary) })
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
      if (fiber.stateNode instanceof Boundary) {
        return fiber.stateNode.nodeId
      }

      const props = fiber.memoizedProps
      const id = isComposite(props) && "data-canvas-node" in props ? props["data-canvas-node"] : undefined

      return isText(fiber.type) && isText(id) ? id : undefined
    },
    inside: (element) => !outside.has(element)
  })

  const element = (id: string) => elements.get(id)!

  return { drawn: drawn!, element, root }
}

const tags = (elements: readonly Element[]) => elements.map((element) => element.localName)

const words = (texts: readonly Text[]) => texts.map((text) => text.data)

describe("text a design node draws outside its elements", () => {
  it("collects the text of a component that draws only text, and of one that draws text beside an element", () => {
    // function Label() { return "Email" }, and function Price() { return <>$<strong>24</strong></> }
    const { drawn } = build([
      { boundary: "label", children: [{ component: "Label", children: [{ text: "Email" }] }] },
      {
        boundary: "price",
        children: [{ component: "Price", children: [{ text: "$" }, { host: "strong", children: [{ text: "24" }] }] }]
      }
    ])

    expect(words(drawn.texts("label"))).toEqual(["Email"])
    expect(drawn.elements("label")).toEqual([])
    expect(words(drawn.texts("price"))).toEqual(["$"])
    expect(tags(drawn.elements("price"))).toEqual(["strong"])
  })

  it("leaves text inside an element to the element, and gives a provider its children's text", () => {
    const { drawn } = build([
      {
        boundary: "group",
        children: [
          {
            component: "Group",
            children: [
              { host: "p", props: { id: "title", "data-canvas-node": "title" }, children: [{ text: "Team" }] },
              { boundary: "caption", children: [{ component: "Caption", children: [{ text: "Everyone" }] }] }
            ]
          }
        ]
      }
    ])

    expect(drawn.texts("title")).toEqual([])
    expect(words(drawn.texts("caption"))).toEqual(["Everyone"])
    expect(words(drawn.texts("group"))).toEqual(["Everyone"])
  })
})

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
    expect(drawn.texts("nothing")).toEqual([])
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
    const root: Fiber = { child: null, sibling: null, type: null, stateNode: {}, memoizedProps: {} }
    // A child without a sibling or a DOM node.
    Object.assign(root, { child: { child: null, type: "div" } })
    expect(indexDrawnNodes(root, { nodeOf: () => undefined, inside: () => true })).toBeUndefined()
  })
})

describe("where a component puts the style it's given", () => {
  const style = { width: "320px", margin: "8px" }

  /** The component fiber of a layer whose component draws `drawn`, given `props`. */
  const layer = (drawn: Spec[], props: FakeProps = { style }) =>
    build([{ boundary: "field", children: [{ component: "Field", props, children: drawn }] }]).root.child!.child!

  const isLayer = (fiber: Fiber) => fiber.stateNode instanceof Boundary

  it("finds it on the root, with the component's own styles beside it", () => {
    // function Card({ style }) { return <section style={{ padding: 12, ...style }}>…</section> }
    const card = layer([
      { host: "section", props: { style: { padding: "12px", ...style } }, children: [{ text: "Hi" }] }
    ])

    expect(stylePlacement(card, isLayer)).toBe("root")
  })

  it("finds it inside, as a field passing its props to its input does", () => {
    // function Field(props) { return <label><span>Email</span><input {...props} /></label> }
    const field = layer([
      {
        host: "label",
        children: [
          { host: "span", children: [{ text: "Email" }] },
          { host: "input", props: { style } }
        ]
      }
    ])

    expect(stylePlacement(field, isLayer)).toBe("inner")
  })

  it("looks at every top-level element before any inside, as a fragment's second root takes it", () => {
    const pair = layer([
      { host: "h3", children: [{ host: "span", props: { style } }] },
      { host: "p", props: { style } }
    ])

    expect(stylePlacement(pair, isLayer)).toBe("root")
  })

  it("says none when no element it drew has the style, as a component ignoring it", () => {
    expect(stylePlacement(layer([{ host: "div", children: [{ host: "span" }] }]), isLayer)).toBe("none")
    // A merged copy missing one of the values doesn't count.
    expect(stylePlacement(layer([{ host: "div", props: { style: { width: "320px" } } }]), isLayer)).toBe("none")
  })

  it("leaves out a slot's layers, which draw their own styles", () => {
    const card = layer([
      { host: "section", children: [{ boundary: "inner", children: [{ host: "div", props: { style } }] }] }
    ])

    expect(stylePlacement(card, isLayer)).toBe("none")
  })

  it("can't say before it draws an element, or when it's given no style", () => {
    expect(stylePlacement(layer([]), isLayer)).toBeUndefined()
    expect(stylePlacement(layer([{ text: "Email" }]), isLayer)).toBeUndefined()
    expect(stylePlacement(layer([{ host: "div" }], { style: {} }), isLayer)).toBeUndefined()
  })
})

describe("reaching a root's fibers", () => {
  const container = fakeElement("div")
  const hostRoot = { tag: 3, child: null, sibling: null, type: null, stateNode: {}, memoizedProps: null }

  /** A root as `createRoot` returns one, with React's own root when given one. */
  const rootWith = (internal: { _internalRoot?: { current: { tag: number } } } = {}): Root =>
    Object.assign({ render: () => undefined, unmount: () => undefined }, internal)

  it("goes through the root createRoot returns", () => {
    expect(currentRootFiber(rootWith({ _internalRoot: { current: hostRoot } }), container)).toBe(hostRoot)
  })

  it("goes through the container's key when the root doesn't say", () => {
    const marked = Object.assign(fakeElement("div"), { __reactContainer$abc: { stateNode: { current: hostRoot } } })
    expect(currentRootFiber(rootWith(), marked)).toBe(hostRoot)
  })

  it("gives up when neither leads to a root fiber", () => {
    expect(currentRootFiber(rootWith(), container)).toBeUndefined()
    expect(
      currentRootFiber(rootWith({ _internalRoot: { current: { ...hostRoot, tag: 5 } } }), container)
    ).toBeUndefined()
    expect(currentRootFiber(rootWith({ _internalRoot: { current: { tag: 3 } } }), container)).toBeUndefined()
  })
})
