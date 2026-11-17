// @vitest-environment happy-dom
import { bodyAttribute } from "@parity-app/core"
import { describe, expect, it, vi } from "vite-plus/test"
import { buildCopy } from "./copy.ts"
import type { FrozenElement } from "./snapshot.ts"

const page: FrozenElement = {
  tag: "body",
  attributes: [["class", "antialiased"]],
  children: [
    {
      tag: "header",
      attributes: [],
      children: [{ tag: "a", attributes: [["href", "#plans"]], children: ["Plans"] }]
    },
    "\n",
    {
      tag: "main",
      attributes: [["id", "plans"]],
      children: [
        { tag: "pricing-card", attributes: [["data-plan", "pro"]], children: ["Pro"] },
        {
          tag: "svg",
          namespace: "svg",
          attributes: [["viewBox", "0 0 10 10"]],
          children: [
            { tag: "use", namespace: "svg", attributes: [["xlink:href", "#icon"]], children: [] },
            { tag: "linearGradient", namespace: "svg", attributes: [], children: [] }
          ]
        }
      ]
    }
  ]
}

/**
 * The registry the copy is made in. happy-dom can't construct a scoped one (Electron 45 can, which step 1 checked), so
 * the window's stands in: what these tests check is that `buildCopy` makes every element in the registry it's given.
 */
const registry = window.customElements

function copy() {
  const built = buildCopy(document, page, registry)
  const standIn = built.fragment.firstElementChild!

  return { ...built, standIn }
}

describe("buildCopy", () => {
  it("puts the page under an inert body stand-in that carries <body>'s attributes", () => {
    const { fragment, standIn } = copy()

    expect(fragment.childNodes).toHaveLength(1)
    expect(standIn.tagName).toBe("DIV")
    expect(standIn.hasAttribute(bodyAttribute)).toBe(true)
    expect(standIn.hasAttribute("inert")).toBe(true)
    expect(standIn.getAttribute("class")).toBe("antialiased")
    expect(standIn.textContent).toBe("Plans\nPro")
  })

  it("makes every element in its namespace, with SVG's case and xlink in its namespace", () => {
    const { standIn } = copy()
    const svg = standIn.querySelector("svg")!
    const use = svg.firstElementChild!

    expect(standIn.querySelector("main")!.namespaceURI).toBe("http://www.w3.org/1999/xhtml")
    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg")
    expect(svg.lastElementChild!.localName).toBe("linearGradient")
    expect(use.getAttributeNS("http://www.w3.org/1999/xlink", "href")).toBe("#icon")
  })

  it("creates every element in the copy's registry, never with a plain createElement", () => {
    const createElementNS = vi.spyOn(document, "createElementNS")
    const createElement = vi.spyOn(document, "createElement")

    buildCopy(document, page, registry)

    expect(createElement).not.toHaveBeenCalled()
    expect(createElementNS).toHaveBeenCalledTimes(8)

    for (const [, , options] of createElementNS.mock.calls) {
      expect(options).toEqual({ customElementRegistry: registry })
    }
  })

  it("gives each element its path from the body, parents before their children, and none inside an svg", () => {
    const { drawn, standIn } = copy()

    expect(drawn.ids).toEqual(["0", "0.0", "1", "1.0", "1.1"])
    expect(drawn.elements("1.0")).toEqual([standIn.querySelector("pricing-card")])
    expect(drawn.elements("1.1.0")).toEqual([])
    expect(drawn.elements("9")).toEqual([])
    expect(drawn.texts("0.0")).toEqual([])
    expect(drawn.parent("1.1")).toBe("1")
    expect(drawn.parent("0")).toBeUndefined()
  })

  it("attaches a shadow root with its styles and content, in the copy's registry, its elements without ids", () => {
    const host: FrozenElement = {
      tag: "price-tag",
      attributes: [],
      children: [],
      shadow: {
        children: [
          { tag: "span", attributes: [], children: ["$9"] },
          { tag: "slot", attributes: [], children: [] }
        ],
        styles: ["span { color: red }"]
      }
    }

    const built = buildCopy(document, { tag: "body", attributes: [], children: [host] }, registry)
    const shadow = built.fragment.querySelector("price-tag")!.shadowRoot!

    expect(shadow.innerHTML).toBe("<style>span { color: red }</style><span>$9</span><slot></slot>")
    expect(built.drawn.ids).toEqual(["0"])
    expect(built.drawn.nodeOf(shadow.querySelector("span")!)).toBeUndefined()
  })

  it("passes each inline style through the board's preparation", () => {
    const built = buildCopy(
      document,
      {
        tag: "body",
        attributes: [],
        children: [{ tag: "section", attributes: [["style", "height: 100vh"]], children: [] }]
      },
      registry,
      { inline: (css) => css.replace("100vh", "800px") }
    )

    expect(built.fragment.querySelector("section")!.getAttribute("style")).toBe("height: 800px")
  })

  it("passes each shadow style through the board's preparation", () => {
    const host: FrozenElement = {
      tag: "price-tag",
      attributes: [],
      children: [],
      shadow: { children: [], styles: ["@media (max-width: 600px) { span { color: red } }"] }
    }

    const built = buildCopy(document, { tag: "body", attributes: [], children: [host] }, registry, {
      sheet: (css) => css.replace("@media", "@container frame")
    })

    expect(built.fragment.querySelector("price-tag")!.shadowRoot!.querySelector("style")!.textContent).toBe(
      "@container frame (max-width: 600px) { span { color: red } }"
    )
  })

  it("finds the node an element belongs to, an svg's shape its svg, and none for the stand-in", () => {
    const { drawn, standIn } = copy()

    expect(drawn.nodeOf(standIn.querySelector("use")!)).toBe("1.1")
    expect(drawn.nodeOf(standIn)).toBeUndefined()
  })

  it("gives the same ids to the same markup", () => {
    expect(copy().drawn.ids).toEqual(copy().drawn.ids)
  })

  it("orders tens of thousands of siblings within the test timeout", () => {
    const wide: FrozenElement = {
      tag: "body",
      attributes: [],
      children: Array.from({ length: 40_000 }, () => ({ tag: "i", attributes: [], children: [] }))
    }

    const { drawn } = buildCopy(document, wide, registry)

    expect(drawn.ids.at(-1)).toBe("39999")
  })
})
