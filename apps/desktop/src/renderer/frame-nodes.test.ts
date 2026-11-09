import { fileURLToPath } from "node:url"
import type { MountHandle, PropValues, RenderComponent, RenderElement, RenderNode } from "@parity-app/core"
import type { createGuest } from "@parity-app/renderer-react/guest"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
import type * as frameModule from "./frame.ts"

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
import { cloneElement, createElement, Fragment, useEffect, useRef, useState } from "react"

// Radix's Slot, as shadcn's Button uses it for asChild: draws its one child with its own props under the child's, the
// two classes joined, both handlers called, the child's first, and both refs set.
function Slot({ children, ...props }) {
  const own = children.props
  const merged = { ...props, ...own }
  for (const key of Object.keys(props)) {
    if (/^on[A-Z]/.test(key) && typeof own[key] === "function") {
      merged[key] = (...args) => {
        own[key](...args)
        props[key](...args)
      }
    }
  }
  merged.className = [props.className, own.className].filter(Boolean).join(" ") || undefined
  const refs = [props.ref, own.ref].filter(Boolean)
  merged.ref = (node) => {
    for (const ref of refs) typeof ref === "function" ? ref(node) : (ref.current = node)
  }
  return cloneElement(children, merged)
}

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

// Draws only text, with no element around it.
export function Label() {
  return "Email address"
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
  return createElement(asChild ? Slot : "button", { className: "slot-button", "data-slot": "button", ...props })
}

// Counts presses on its asChild child through a handler and a ref, as a trigger does.
export function PressButton({ asChild, ...props }) {
  const ref = useRef(null)
  const [presses, setPresses] = useState(0)
  useEffect(() => {
    ref.current?.setAttribute("data-ref", ref.current.localName)
  })
  return createElement(asChild ? Slot : "button",
    { ...props, ref, "data-presses": String(presses), onClick: () => setPresses((count) => count + 1) })
}

export function Broken() {
  throw new Error("Broken on purpose")
}

export function Link({ className, ...props }) {
  return createElement("a", { href: "#", ...props, className: ["link", className].filter(Boolean).join(" ") })
}

// Draws its item twice, handing each copy props through renderItem, as a list does.
export function Repeat({ renderItem }) {
  return createElement("ul", { className: "repeat" },
    [0, 1].map((index) =>
      renderItem({ key: index, className: "given", "data-index": String(index), style: { marginLeft: index + "px" } })))
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
    // React's production build, as frames run it (see builder-vite's productionDependencies).
    define: { "process.env.NODE_ENV": '"production"', "import.meta.url": '"http://project.test/frame.js"' }
  })

  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage({ viewport: { width: 1000, height: 900 } })
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text())
    }
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

  if (!(await page.evaluate(() => "frame" in window))) {
    throw new Error(`The page didn't load: ${errors.join(",")}`)
  }

  await mount(design)
})

afterAll(async () => {
  await browser?.close()
})

/** The bundle's global in the page, as `entry` exports it: the frame code, `createGuest` and the components. */
declare const frame: typeof frameModule & { createGuest: typeof createGuest }

/** The handle `mount` keeps on the page's window, for a test to update the tree it drew. */
declare const mounted: MountHandle

const text = (nodeId: string, value: string): RenderElement => ({
  kind: "element",
  nodeId,
  tag: "p",
  style: { margin: "0", height: "18px" },
  children: [{ kind: "text", text: value }]
})

const component = (
  nodeId: string,
  name: string,
  props: PropValues = {},
  slots: Record<string, RenderNode[]> = {}
): RenderComponent => ({
  kind: "component",
  nodeId,
  component: name,
  props,
  slots
})

/** A screen of components that each take their props differently, in a column. */
const design: RenderNode[] = [
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
      component("grows", "Grows"),
      component("label", "Label")
    ]
  }
]

/** Mounts a guest in the frame at `#host` and lets the canvas's lookups go through it, as ModeView does. */
async function mount(tree: RenderNode[]) {
  await page.evaluate((tree) => {
    const host = document.querySelector<HTMLElement>("#host")!
    const { createGuest, prepareFrame, setDrawnNodes } = frame

    // The bundle's components are its exports named in capitals.
    const components = Object.fromEntries(Object.entries(frame).filter(([name]) => /^[A-Z]/.test(name)))
    const guest = createGuest({ components, css: "" })
    const viewport = { width: 390, height: 844 }
    const target = prepareFrame(host, new CSSStyleSheet(), { classNames: [], attributes: {}, viewport })
    const handle = guest.mount(target, tree, { viewport })
    setDrawnNodes(host, () => handle.drawnNodes?.())
    Object.assign(window, { mounted: handle })
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

      const { findNodeElements, nodeBox } = frame

      return {
        elements: findNodeElements(host, id).map((element) => element.className || element.localName),
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

    return frame.nodesAt(host, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
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
      return frame.drawnNodeIds(document.querySelector("#host")!)
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
      "grows",
      "label"
    ])
  })

  it("gives a component that draws only text its text's box", async () => {
    const found = await page.evaluate(() => {
      const host = document.querySelector("#host")!
      const page = host.shadowRoot!.querySelector("[data-canvas-node=page]")!
      const text = [...page.childNodes].find((node) => node.nodeType === 3 && node.textContent === "Email address")!
      const range = document.createRange()
      range.selectNodeContents(text)
      const rect = range.getBoundingClientRect()
      const { nodeBox, nodesAt, findNodeElements } = frame
      const box = nodeBox(host, "label")!

      return {
        box: [box.left, box.top, box.width, box.height],
        text: [rect.left, rect.top, rect.width, rect.height],
        elements: findNodeElements(host, "label").length,
        under: nodesAt(host, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      }
    })

    expect(found.box).toEqual(found.text)
    expect(found.text[2]).toBeGreaterThan(0)
    expect(found.elements).toBe(0)
    expect(found.under).toEqual(["page", "label"])
  })

  it("follows DOM a component adds by itself", async () => {
    expect((await lookup("grows")).elements).toEqual(["grow"])
    await page.evaluate(() => {
      const host = document.querySelector("#host")!

      host.shadowRoot!.querySelector<HTMLElement>(".grow")!.click()
    })
    await page.waitForTimeout(50)
    const found = await lookup("grows", ".grow", ".extra")
    expect(found.elements).toEqual(["grow", "extra"])
    expect(found.box).toEqual(around(found.expected))
  })

  it("follows ids the canvas moves to other DOM without adding or removing any", async () => {
    const swapped = structuredClone(design)
    // React keeps the two paragraphs and changes their ids and text, which adds or removes nothing.
    const top = swapped[0]

    if (top?.kind !== "element") {
      throw new Error("The design's first node is the page element.")
    }

    top.children = top.children.map((node) =>
      node.kind === "component" && node.nodeId === "group"
        ? component("group", "Group", {}, { children: [text("b", "B"), text("a", "A")] })
        : node
    )
    const before = await lookup("a")
    await page.evaluate((tree) => {
      mounted.update(tree)
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
      const { setDrawnNodes, drawnNodeIds, findNodeElement } = frame
      setDrawnNodes(host, () => undefined)

      return { ids: drawnNodeIds(host), email: findNodeElement(host, "email")!.className }
    })

    // As before the canvas read React's tree: the field is found by the input its props reach, MemberRow not at all.
    expect(fallback.ids).not.toContain("member")
    expect(fallback.email).toBe("input")
  })
})

/**
 * A component handing props to what's in its slot: Radix's Slot merging a button's onto its asChild child, and a
 * `$renderWith:` slot spreading what the component calls it with. A component layer is drawn inside the guest's error
 * boundary, so these check that what the parent hands it still reaches the component.
 */
describe("props a component hands to its slot", () => {
  const slots: RenderNode[] = [
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
          "press-component",
          "PressButton",
          { asChild: true },
          { children: [component("press-link", "Link", { className: "pressed", children: "Press" })] }
        ),
        component("broken-slot", "SlotButton", { asChild: true }, { children: [component("broken", "Broken")] }),
        component(
          "repeat-element",
          "Repeat",
          {},
          {
            "$renderWith:renderItem": [
              {
                kind: "element",
                nodeId: "item-element",
                tag: "li",
                style: { paddingTop: "1px" },
                children: [{ kind: "text", text: "C" }]
              }
            ]
          }
        ),
        component(
          "repeat-both",
          "Repeat",
          {},
          {
            "$renderWith:renderItem?pass=data-arg": [
              { kind: "element", nodeId: "item-both", tag: "li", style: {}, children: [{ kind: "text", text: "D" }] }
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

  it("gives a component in an asChild slot the button's class and attributes", async () => {
    expect(await drawn("a.link:not(.pressed)")).toEqual([
      { className: "link slot-button", slot: "button", index: undefined }
    ])
  })

  it("gives a component in an asChild slot the button's handler and ref, its own class kept", async () => {
    await mount(slots)

    const press = () =>
      page.evaluate(() => {
        const link = document.querySelector("#host")!.shadowRoot!.querySelector<HTMLElement>("a.pressed")!
        link.click()

        return { className: link.className, ref: link.dataset.ref }
      })

    expect(await press()).toEqual({ className: "link pressed", ref: "a" })
    await page.waitForTimeout(50)

    const presses = await page.evaluate(
      () => document.querySelector("#host")!.shadowRoot!.querySelector<HTMLElement>("a.pressed")!.dataset.presses
    )

    expect(presses).toBe("1")
  })

  it("still finds a component layer in an asChild slot, inside its parent", async () => {
    await mount(slots)
    const found = await lookup("link-component", "a.link:not(.pressed)")
    expect(found.elements).toEqual(["link slot-button"])
    expect(found.box).toEqual(found.expected[0])
    expect(await at("a.link:not(.pressed)")).toEqual(["slots", "button-component", "link-component"])
  })

  it("keeps the error of a component in an asChild slot to itself", async () => {
    await mount(slots)

    const shown = await page.evaluate(() => {
      const root = document.querySelector("#host")!.shadowRoot!

      return {
        error: root.querySelector("[data-failed-component=Broken]")?.getAttribute("data-error") === "Broken on purpose",
        links: root.querySelectorAll("a").length
      }
    })

    expect(shown).toEqual({ error: true, links: 3 })
    expect((await lookup("broken")).elements).toHaveLength(1)
  })

  it("gives an element in a $renderWith: slot what the component renders it with", async () => {
    expect(await drawn("li[data-canvas-node=item-element]")).toEqual([
      { className: "given", slot: undefined, index: "0" },
      { className: "given", slot: undefined, index: "1" }
    ])
  })

  it("keeps the node's style with the one it's rendered with, and each copy's own key", async () => {
    await mount(slots)

    const styles = await page.evaluate(() =>
      [
        ...document
          .querySelector("#host")!
          .shadowRoot!.querySelectorAll<HTMLElement>("li[data-canvas-node=item-element]")
      ].map((element) => [element.style.paddingTop, element.style.marginLeft])
    )

    expect(styles).toEqual([
      ["1px", "0px"],
      ["1px", "1px"]
    ])
    expect(errors.filter((error) => /same key/.test(error))).toEqual([])
  })

  it("gives what's spread and what's named both, when a slot does both", async () => {
    await mount(slots)

    const both = await page.evaluate(() =>
      [
        ...document.querySelector("#host")!.shadowRoot!.querySelectorAll<HTMLElement>("li[data-canvas-node=item-both]")
      ].map((element) => [element.className, element.dataset.arg])
    )

    expect(both).toEqual([
      ["given", "[object Object]"],
      ["given", "[object Object]"]
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

describe("a component that puts its style on an element inside it (PAR-201)", () => {
  const sized = { width: "320px", marginTop: "4px" }

  const styled: RenderNode[] = [
    {
      kind: "element",
      nodeId: "page",
      tag: "div",
      style: { display: "flex", flexDirection: "column", alignItems: "start", gap: "10px" },
      children: [
        component("sized-field", "Field", { placeholder: "you@example.com", style: sized }),
        component("plain-field", "Field", { placeholder: "Plain" }),
        component("sized-link", "Link", { children: "Docs", style: { display: "block", width: "120px" } })
      ]
    }
  ]

  /** A layer's elements, its box, and its field's and input's widths and inline width. */
  function measure(id: string) {
    return page.evaluate((id) => {
      const host = document.querySelector("#host")!
      const { findNodeElements, nodeBox } = frame
      const elements = findNodeElements(host, id)
      const field = elements[0]!.querySelector<HTMLElement>(".field") ?? elements[0]!
      const input = field.querySelector<HTMLInputElement>("input")

      return {
        elements: elements.map((element) => element.className || element.localName),
        width: nodeBox(host, id)!.width,
        field: field.getBoundingClientRect().width,
        input: input && { width: input.getBoundingClientRect().width, inline: input.style.width }
      }
    }, id)
  }

  it("draws a div around it with the style, which the whole field fills", async () => {
    await mount(styled)
    const found = await measure("sized-field")
    expect(found.elements).toEqual(["div"])
    expect(found.width).toBe(320)
    expect(found.field).toBe(320)
    // The input is the field's to size, as the component lays it out.
    expect(found.input?.inline).toBe("")
    expect(found.input!.width).toBeLessThan(320)
  })

  it("leaves a layer of it without a style as it is, and a component that puts its style on its root", async () => {
    await mount(styled)
    expect((await measure("plain-field")).elements).toEqual(["field"])
    const link = await measure("sized-link")
    expect(link.elements).toEqual(["link"])
    expect(link.width).toBe(120)
  })
})
