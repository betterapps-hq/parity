import { nodeStyle } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { type ElementSnapshot, elementLayers, elementLayerType, layerName, styleOfElement } from "./element-layers.ts"

function element(tag: string, children: ElementSnapshot[] = [], more: Partial<ElementSnapshot> = {}): ElementSnapshot {
  return { id: `${tag}-${children.length}`, tag, attributes: {}, style: {}, children, ...more }
}

const text = (characters: string) => element("#text", [], { id: `t-${characters}`, text: characters })

describe("elementLayerType", () => {
  it.each([
    ["img", [], "image"],
    ["svg", [], "image"],
    ["video", [], "video"],
    ["input", [], "layout"],
    ["p", [text("Hello")], "text"],
    ["button", [text("Save")], "layout"],
    ["div", [text("Card")], "layout"],
    ["label", [text("Email")], "text"],
    ["div", [element("span", [text("Hi")])], "layout"],
    ["div", [], "layout"]
  ] as const)("reads a %s as a %s layer", (tag, children, type) => {
    expect(elementLayerType(element(tag, [...children]))).toBe(type)
  })
})

describe("layerName", () => {
  it("names a layer for its data-slot, then its role, then its tag", () => {
    expect(layerName(element("div", [], { attributes: { "data-slot": "card-header", role: "group" } }))).toBe(
      "card-header"
    )
    expect(layerName(element("div", [], { attributes: { role: "tablist" } }))).toBe("tablist")
    expect(layerName(element("input", [], { attributes: { type: "email" } }))).toBe("input (email)")
  })
})

describe("elementLayers", () => {
  it("turns a card's elements into layouts and text, each with its element, leaving out blank text", () => {
    const card = element("div", [
      element("div", [text("Title")], { id: "title", tag: "h3", attributes: { "data-slot": "card-title" } }),
      text("  "),
      element("img", [], { id: "photo", attributes: { src: "/a.png", alt: "A" } })
    ])

    expect(elementLayers([card])).toEqual([
      {
        type: "layout",
        id: "div-3",
        name: "div",
        style: { flexDirection: "column" },
        element: { tag: "div" },
        children: [
          {
            type: "text",
            id: "title",
            name: "card-title",
            text: "Title",
            tag: "h3",
            style: {},
            element: { tag: "h3", attributes: { "data-slot": "card-title" } }
          },
          {
            type: "image",
            id: "photo",
            name: "img",
            src: "/a.png",
            alt: "A",
            style: {},
            element: { tag: "img", attributes: { src: "/a.png", alt: "A" } }
          }
        ]
      }
    ])
  })
})

describe("styleOfElement", () => {
  it("reads a flex row's computed styles as a layout's, and a valid style", () => {
    const style = styleOfElement(
      {
        style: {
          display: "flex",
          "flex-direction": "row",
          "column-gap": "8px",
          "row-gap": "8px",
          "align-items": "center",
          "justify-content": "space-between",
          width: "320px",
          height: "auto",
          "padding-top": "24px",
          "padding-right": "24px",
          "padding-bottom": "24px",
          "padding-left": "24px",
          "background-color": "rgb(255, 255, 255)",
          "border-top-style": "solid",
          "border-top-width": "1px",
          "border-top-color": "rgb(229, 229, 229)",
          "border-top-left-radius": "12px",
          opacity: "1"
        }
      },
      "layout"
    )

    expect(style).toEqual({
      width: { value: "320px" },
      flexDirection: "row",
      gap: { value: "8px" },
      alignItems: "center",
      justifyContent: "space-between",
      padding: { value: "24px" },
      fills: [{ type: "solid", color: { value: "rgb(255, 255, 255)" } }],
      borderWidth: { value: "1px" },
      borderColor: { value: "rgb(229, 229, 229)" },
      borderStyle: "solid",
      borderRadius: { value: "12px" }
    })
    expect(nodeStyle.safeParse(style).success).toBe(true)
  })

  it("reads a text's type, leaving a transparent fill and normal spacing out", () => {
    const style = styleOfElement(
      {
        style: {
          color: "rgb(10, 10, 10)",
          "font-family": "Geist, sans-serif",
          "font-size": "14px",
          "font-weight": "500",
          "line-height": "20px",
          "letter-spacing": "normal",
          "text-align": "left",
          "background-color": "rgba(0, 0, 0, 0)"
        }
      },
      "text"
    )

    expect(style).toEqual({
      color: { value: "rgb(10, 10, 10)" },
      fontFamily: { value: "Geist, sans-serif" },
      fontSize: { value: "14px" },
      fontWeight: { value: 500 },
      lineHeight: { value: "20px" }
    })
    expect(nodeStyle.safeParse(style).success).toBe(true)
  })
})
