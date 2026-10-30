import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"

// How the canvas finds the DOM each design node draws, in Chrome with React itself, as frame.test.ts lays frames out.
// The guest reads React's tree, so these fail when a React release changes what the walk relies on. It needs Chrome.
let browser: Browser
let page: Page
const errors: string[] = []

/** The frame code, a guest, and components that use their props in the ways apps do. */
const entry = `
export { prepareFrame, setDrawnNodes, findNodeElement, findNodeElements, nodeBox, nodesAt, nodeParent, nodeOfElement,
  drawnNodeIds } from "./frame.ts"
export { createGuest } from "@parity-app/renderer-react/guest"
import { createElement, Fragment, useState } from "react"
import { Slot } from "radix-ui"

// Takes the props it needs and renders none of the rest, data-canvas-node included.
export function MemberRow({ member }) {
  return createElement("div", { className: "member", style: { display: "flex", gap: "8px", height: "40px" } },
    createElement("span", { className: "name" }, member.name),
    createElement("span", { className: "role" }, member.role))
}

// Several roots and no element around them.
export function Pair() {
  return createElement(Fragment, null,
    createElement("h3", { className: "first", style: { margin: 0, height: "20px", width: "100px" } }, "First"),
    createElement("p", { className: "second", style: { margin: 0, height: "30px", width: "200px" } }, "Second"))
}

// Passes its props to the input inside it, as shadcn's and most form libraries' fields do.
export function Field(props) {
  return createElement("label", { className: "field", style: { display: "flex", gap: "8px", padding: "6px" } },
    createElement("span", null, "Email"),
    createElement("input", { ...props, className: "input" }))
}

export function Card({ children }) {
  return createElement("section", { className: "card", style: { padding: "12px" } }, children)
}

// Draws only what it's given, as a provider does.
export function Group({ children }) {
  return children
}

export function Nothing() {
  return null
}

// Adds a root of its own when pressed, without the canvas rendering it again.
export function Grows() {
  const [more, setMore] = useState(false)
  return createElement(Fragment, null,
    createElement("button", { className: "grow", style: { height: "20px" }, onClick: () => setMore(true) }, "More"),
    more ? createElement("div", { className: "extra", style: { height: "50px" } }) : null)
}

// Lends its class and attributes to its child with asChild, as shadcn's Button does through Radix's Slot.
export function SlotButton({ asChild, ...props }) {
  return createElement(asChild ? Slot.Root : "button", { className: "slot-button", "data-slot": "button", ...props })
}

export function Link({ className, ...props }) {
  return createElement("a", { href: "#", ...props, className: ["link", className].filter(Boolean).join(" ") })
}

// Draws its item twice, handing each copy props through renderItem, as a list does.
export function Repeat({ renderItem }) {
  return createElement("ul", { className: "repeat" },
    [0, 1].map((index) => renderItem({ key: index, className: "given", "data-index": String(index) })))
}

export function Tag(props) {
  return createElement("li", { ...props, className: ["tag", props.className].filter(Boolean).join(" ") }, "Tag")
}
`

beforeAll(async () => {
  const renderer = fileURLToPath(new URL(".", import.meta.url))
  const bundle = await build({
    stdin: { contents: entry, resolveDir: renderer, loader: "tsx", sourcefile: "entry.tsx" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "frame",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"development"', "import.meta.url": '"http://project.test/frame.js"' }
  })
  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage({ viewport: { width: 1000, height: 900 } })
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  page.on("pageerror", (error) => errors.push(error.message))
  await page.route("http://project.test/frame.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0]!.text })
  )
  await page.route("http://parity.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="host" style="width: 390px"></div><script src="http://project.test/frame.js"></script>`
    })
  )
  await page.goto("http://parity.test/")
  // @ts-expect-error The bundle's global.
  if (!(await page.evaluate(() => typeof frame === "object"))) throw new Error(`The page didn't load: ${errors}`)
  await mount(design)
}, 30_000)

afterAll(async () => {
  await browser?.close()
})

type Node = Record<string, unknown>
const text = (nodeId: string, value: string): Node => ({
  kind: "element",
  nodeId,
  tag: "p",
  style: { margin: "0", height: "18px" },
  children: [{ kind: "text", text: value }]
})
const component = (nodeId: string, name: string, props: Node = {}, slots: Record<string, Node[]> = {}): Node => ({
  kind: "component",
  nodeId,
  component: name,
  props,
  slots
})

/** A screen of components that each take their props differently, in a column. */
const design: Node[] = [
  {
    kind: "element",
    nodeId: "page",
    tag: "div",
    style: { display: "flex", flexDirection: "column", gap: "10px" },
    children: [
      component("member", "MemberRow", { member: { name: "Ada", role: "Admin" } }),
      component("pair", "Pair"),
      component("email", "Field", { placeholder: "you@example.com" }),
      component(
        "card",
        "Card",
        {},
        {
          children: [
            text("title", "Team"),
            component("inner", "MemberRow", { member: { name: "Lin", role: "Editor" } })
          ]
        }
      ),
      component("group", "Group", {}, { children: [text("a", "A"), text("b", "B")] }),
      component("nothing", "Nothing"),
      component("grows", "Grows")
    ]
  }
]

/** Mounts a guest in the frame at `#host` and lets the canvas's lookups go through it, as ModeView does. */
async function mount(tree: Node[]) {
  await page.evaluate((tree) => {
    const host = document.querySelector("#host")!
    // @ts-expect-error The bundle's global.
    const bundle = frame as Record<string, unknown>
    const { createGuest, prepareFrame, setDrawnNodes } = bundle as unknown as {
      createGuest(init: unknown): {
        mount(target: unknown, tree: unknown, options: unknown): { drawnNodes?(): unknown }
      }
      prepareFrame(host: Element, sheet: CSSStyleSheet, environment: unknown): HTMLElement
      setDrawnNodes(host: Element, read: unknown): void
    }
    // The bundle's components are its exports named in capitals.
    const components = Object.fromEntries(Object.entries(bundle).filter(([name]) => /^[A-Z]/.test(name)))
    const guest = createGuest({ components, css: "" })
    const viewport = { width: 390, height: 844 }
    const target = prepareFrame(host, new CSSStyleSheet(), { classNames: [], attributes: {}, viewport })
    const handle = guest.mount(target, tree, { viewport })
    setDrawnNodes(host, handle.drawnNodes)
    ;(window as unknown as { handle: unknown }).handle = handle
  }, tree)
  await page.waitForTimeout(50)
}

type Box = { left: number; top: number; right: number; bottom: number }

/** What the canvas finds for a node, and the boxes of elements picked by selector, to compare. */
function lookup(id: string, ...selectors: string[]) {
  return page.evaluate(
    ({ id, selectors }) => {
      const host = document.querySelector("#host")!
      const box = (rect: DOMRect | undefined): Box | undefined =>
        rect && { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
      // @ts-expect-error The bundle's global.
      const { findNodeElements, nodeBox } = frame
      return {
        elements: (findNodeElements(host, id) as HTMLElement[]).map(
          (element) => element.className || element.localName
        ),
        box: box(nodeBox(host, id)),
        expected: selectors.map((selector) => box(host.shadowRoot!.querySelector(selector)!.getBoundingClientRect())!)
      }
    },
    { id, selectors }
  )
}

/** The box around boxes. */
function around(boxes: Box[]): Box {
  return {
    left: Math.min(...boxes.map((box) => box.left)),
    top: Math.min(...boxes.map((box) => box.top)),
    right: Math.max(...boxes.map((box) => box.right)),
    bottom: Math.max(...boxes.map((box) => box.bottom))
  }
}

/** The nodes under the middle of an element, outermost first, as hovering and clicking find them. */
function at(selector: string) {
  return page.evaluate((selector) => {
    const host = document.querySelector("#host")!
    const rect = host.shadowRoot!.querySelector(selector)!.getBoundingClientRect()
    // @ts-expect-error The bundle's global.
    return frame.nodesAt(host, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) as string[]
  }, selector)
}

describe("finding a design node's DOM", () => {
  it("finds a component that renders none of its props", async () => {
    const found = await lookup("member", ".member")
    expect(found.elements).toEqual(["member"])
    expect(found.box).toEqual(found.expected[0])
    expect(await at(".member .role")).toEqual(["page", "member"])
    expect(errors).toEqual([])
  })

  it("measures a fragment around all its roots", async () => {
    const found = await lookup("pair", ".first", ".second")
    expect(found.elements).toEqual(["first", "second"])
    expect(found.box).toEqual(around(found.expected))
    expect(await at(".second")).toEqual(["page", "pair"])
  })

  it("outlines a field around the field, not the input its props go to", async () => {
    const found = await lookup("email", ".field", ".input")
    expect(found.elements).toEqual(["field"])
    expect(found.box).toEqual(found.expected[0])
    expect(found.box).not.toEqual(found.expected[1])
    expect(await at(".input")).toEqual(["page", "email"])
  })

  it("keeps a nested layer's DOM its own, inside its parent's box", async () => {
    const card = await lookup("card", ".card")
    expect(card.box).toEqual(card.expected[0])
    expect(await at(".card p")).toEqual(["page", "card", "title"])
    expect(await at(".card .member .name")).toEqual(["page", "card", "inner"])
    const parents = await page.evaluate(() => {
      const host = document.querySelector("#host")!
      // @ts-expect-error The bundle's global.
      const { nodeParent, nodeOfElement } = frame
      const name = host.shadowRoot!.querySelector(".card .member .name")!
      return [nodeParent(host, "inner"), nodeParent(host, "card"), nodeParent(host, "page"), nodeOfElement(host, name)]
    })
    expect(parents).toEqual(["card", "page", undefined, "inner"])
  })

  it("gives a component that draws only its children their box, and one that draws nothing none", async () => {
    const group = await lookup("group", "[data-canvas-node=a]", "[data-canvas-node=b]")
    expect(group.box).toEqual(around(group.expected))
    expect(await at("[data-canvas-node=b]")).toEqual(["page", "group", "b"])
    const nothing = await lookup("nothing")
    expect(nothing).toMatchObject({ elements: [], box: undefined })
    const ids = await page.evaluate(() => {
      // @ts-expect-error The bundle's global.
      return frame.drawnNodeIds(document.querySelector("#host")) as string[]
    })
    expect(ids).toEqual([
      "page",
      "member",
      "pair",
      "email",
      "card",
      "title",
      "inner",
      "group",
      "a",
      "b",
      "nothing",
      "grows"
    ])
  })

  it("follows DOM a component adds by itself", async () => {
    expect((await lookup("grows")).elements).toEqual(["grow"])
    await page.evaluate(() => {
      const host = document.querySelector("#host")!
      ;(host.shadowRoot!.querySelector(".grow") as HTMLElement).click()
    })
    await page.waitForTimeout(50)
    const found = await lookup("grows", ".grow", ".extra")
    expect(found.elements).toEqual(["grow", "extra"])
    expect(found.box).toEqual(around(found.expected))
  })

  it("follows ids the canvas moves to other DOM without adding or removing any", async () => {
    const swapped = structuredClone(design)
    // React keeps the two paragraphs and changes their ids and text, which adds or removes nothing.
    swapped[0]!.children = (swapped[0]!.children as Node[]).map((node) =>
      node.nodeId === "group" ? component("group", "Group", {}, { children: [text("b", "B"), text("a", "A")] }) : node
    )
    const before = await lookup("a")
    await page.evaluate((tree) => {
      ;(window as unknown as { handle: { update(tree: unknown): void } }).handle.update(tree)
    }, swapped)
    await page.waitForTimeout(50)
    const after = await lookup("a")
    expect(after.box!.top).toBeGreaterThan(before.box!.top)
    expect(await at("[data-canvas-node=a]")).toEqual(["page", "group", "a"])
    expect(errors).toEqual([])
  })

  it("falls back to the attribute when the guest can't read React's tree", async () => {
    await mount(design)
    const fallback = await page.evaluate(() => {
      const host = document.querySelector("#host")!
      // @ts-expect-error The bundle's global.
      const { setDrawnNodes, drawnNodeIds, findNodeElement } = frame
      setDrawnNodes(host, () => undefined)
      return { ids: drawnNodeIds(host) as string[], email: (findNodeElement(host, "email") as HTMLElement).className }
    })
    // As before the canvas read React's tree: the field is found by the input its props reach, MemberRow not at all.
    expect(fallback.ids).not.toContain("member")
    expect(fallback.email).toBe("input")
  })
})

/**
 * A component handing props to what's in its slot: Radix's Slot merging a button's onto its asChild child, and a
 * `$renderWith:` slot spreading what the component calls it with. A component layer is drawn inside the guest's error
 * boundary. The guest gives a render slot's props to the layer itself, so `$renderWith:` reaches it; Radix's Slot
 * clones the boundary, which draws its child as it was, so asChild's props are lost. The failing case is kept as
 * `it.fails` until it's fixed.
 */
describe("props a component hands to its slot", () => {
  const slots: Node[] = [
    {
      kind: "element",
      nodeId: "slots",
      tag: "div",
      style: { display: "flex", flexDirection: "column" },
      children: [
        component(
          "button-element",
          "SlotButton",
          { asChild: true },
          {
            children: [
              { kind: "element", nodeId: "link-element", tag: "a", style: {}, children: [{ kind: "text", text: "A" }] }
            ]
          }
        ),
        component(
          "button-component",
          "SlotButton",
          { asChild: true },
          {
            children: [component("link-component", "Link", { children: "B" })]
          }
        ),
        component(
          "repeat-element",
          "Repeat",
          {},
          {
            "$renderWith:renderItem": [
              { kind: "element", nodeId: "item-element", tag: "li", style: {}, children: [{ kind: "text", text: "C" }] }
            ]
          }
        ),
        component("repeat-component", "Repeat", {}, { "$renderWith:renderItem": [component("item-component", "Tag")] })
      ]
    }
  ]

  /** The class and `data-` attributes of the elements a selector picks in the frame. */
  async function drawn(selector: string) {
    await mount(slots)
    return page.evaluate((selector) => {
      const elements = [...document.querySelector("#host")!.shadowRoot!.querySelectorAll<HTMLElement>(selector)]
      return elements.map((element) => ({
        className: element.className,
        slot: element.dataset.slot,
        index: element.dataset.index
      }))
    }, selector)
  }

  it("gives an element in an asChild slot the button's class and attributes", async () => {
    expect(await drawn("a[data-canvas-node=link-element]")).toEqual([
      { className: "slot-button", slot: "button", index: undefined }
    ])
  })

  it.fails("gives a component in an asChild slot the button's class and attributes", async () => {
    expect(await drawn("a.link")).toEqual([{ className: "link slot-button", slot: "button", index: undefined }])
  })

  it("gives an element in a $renderWith: slot what the component renders it with", async () => {
    expect(await drawn("ul.repeat > li:not(.tag)")).toEqual([
      { className: "given", slot: undefined, index: "0" },
      { className: "given", slot: undefined, index: "1" }
    ])
  })

  it("gives a component in a $renderWith: slot what the component renders it with", async () => {
    expect(await drawn("ul.repeat > li.tag")).toEqual([
      { className: "tag given", slot: undefined, index: "0" },
      { className: "tag given", slot: undefined, index: "1" }
    ])
    // Each copy keeps the key the component gave it.
    expect(errors.filter((error) => error.includes("same key"))).toEqual([])
  })
})
