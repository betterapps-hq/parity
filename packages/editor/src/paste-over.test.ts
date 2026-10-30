import { type ContainerSpec, type DesignNode, findNode, nodeIds, type NodeStyle } from "@parity/core"
import { describe, expect, it } from "vite-plus/test"
import { designsAt, placeOver, replaceLayers } from "./paste-over.ts"

const text = (id: string, extra: { style?: NodeStyle } = {}): DesignNode => ({ type: "text", id, text: id, ...extra })

function form(): ContainerSpec {
  return {
    id: "form",
    name: "Form",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "root",
      children: [
        text("label"),
        text("placeholder"),
        text("hint"),
        text("badge", { style: { position: "absolute", top: 2, right: "edge" } }),
        {
          type: "component",
          id: "card",
          component: "ui/Card",
          slots: { children: [text("card-title"), text("card-body")] }
        }
      ]
    },
    states: [
      { id: "default", name: "Default" },
      { id: "error", name: "Error", overrides: { placeholder: { text: "Required" } } }
    ]
  }
}

const button: DesignNode = { type: "component", id: "button", component: "ui/Button", props: { variant: "outline" } }
const icon: DesignNode = {
  type: "layout",
  id: "icon",
  style: { position: "absolute", bottom: 1 },
  children: [text("glyph")]
}
const base = form().states[0]!
const children = (container: ContainerSpec, id = "root") => {
  const node = findNode(container.root, id)!
  return (node.type === "layout" ? node.children : node.type === "component" ? node.slots!.children! : []).map(
    (child) => (child.type === "component" ? child.component : child.id)
  )
}

describe("paste over selection", () => {
  it("puts the clipboard's layers just after the selected layer, removing nothing", () => {
    const { container, copies } = placeOver(form(), ["placeholder"], [button, text("note")], base)
    expect(children(container)).toEqual(["label", "placeholder", "ui/Button", copies[1], "hint", "badge", "ui/Card"])
    expect(nodeIds(form().root).has(copies[0]!)).toBe(false)
    expect(container.states[1]!.overrides).toEqual({ placeholder: { text: "Required" } })
  })

  it("puts them after the last of several selected layers, once", () => {
    const { container, copies } = placeOver(form(), ["hint", "label"], [button], base)
    expect(children(container)).toEqual(["label", "placeholder", "hint", "ui/Button", "badge", "ui/Card"])
    expect(copies).toHaveLength(1)
  })

  it("puts them beside a selected layout or component, not inside it", () => {
    const { container } = placeOver(form(), ["card"], [button], base)
    expect(children(container)).toEqual(["label", "placeholder", "hint", "badge", "ui/Card", "ui/Button"])
    expect(children(container, "card")).toEqual(["card-title", "card-body"])
  })

  it("puts them on top of an absolutely placed layer, at its insets", () => {
    const { container, copies } = placeOver(form(), ["badge"], [icon], base)
    expect(children(container)).toEqual(["label", "placeholder", "hint", "badge", copies[0], "ui/Card"])
    expect(findNode(container.root, copies[0]!)?.style).toEqual({ position: "absolute", top: 2, right: "edge" })
    expect(findNode(container.root, "badge")).toBeDefined()
  })

  it("puts them after a layer in a component's slot, in the slot", () => {
    const { container } = placeOver(form(), ["card-title"], [button], base)
    expect(children(container, "card")).toEqual(["card-title", "ui/Button", "card-body"])
  })

  it("leaves the design as it is for its root and layers inside instances", () => {
    const original = form()
    expect(placeOver(original, ["root", "stat/value"], [button], base)).toEqual({ container: original, copies: [] })
  })

  const design = (id: string, x: number, y: number): ContainerSpec => ({ ...form(), id, name: id, position: { x, y } })

  it("puts copied designs at the selected designs' corner, as they sat together", () => {
    const copies = designsAt([design("a", 100, 50), design("b", 1600, 0)], ["home"], { x: 4000, y: 2000 })
    expect(copies.map((copy) => [copy.id, copy.position])).toEqual([
      ["a", { x: 4000, y: 2050 }],
      ["b", { x: 5500, y: 2000 }]
    ])
  })

  it("gives copied designs new ids when theirs are taken", () => {
    const copies = designsAt([design("form", 0, 0), design("form", 10, 0)], ["form"], { x: 0, y: 0 })
    expect(copies.map((copy) => copy.id)).toEqual(["form-2", "form-3"])
  })
})

describe("paste to replace", () => {
  it("puts the clipboard's layers where the selected layer was", () => {
    const { container, copies } = replaceLayers(form(), ["placeholder"], [button, text("note")], base)
    expect(children(container)).toEqual(["label", "ui/Button", copies[1], "hint", "badge", "ui/Card"])
    expect(copies).toHaveLength(2)
    expect(findNode(container.root, "placeholder")).toBeUndefined()
  })

  it("gives the copies fresh ids, and drops the states' changes to the layer it replaced", () => {
    const original = form()
    const { container, copies } = replaceLayers(original, ["placeholder"], [button], base)
    expect(nodeIds(original.root).has(copies[0]!)).toBe(false)
    expect(copies[0]).not.toBe("button")
    expect(container.states[1]!.overrides).toBeUndefined()
  })

  it("replaces each selected layer with its own copy, as Figma does", () => {
    const { container, copies } = replaceLayers(form(), ["label", "hint"], [button], base)
    expect(children(container)).toEqual(["ui/Button", "placeholder", "ui/Button", "badge", "ui/Card"])
    expect(new Set(copies).size).toBe(2)
    expect(copies.every((id) => findNode(container.root, id)?.type === "component")).toBe(true)
  })

  it("replaces a layer in a component's slot, in the slot", () => {
    const { container } = replaceLayers(form(), ["card-body"], [button], base)
    expect(children(container, "card")).toEqual(["card-title", "ui/Button"])
  })

  it("places a copy over an absolutely placed layer at its insets, in place of its own", () => {
    const { container, copies } = replaceLayers(form(), ["badge"], [icon], base)
    expect(findNode(container.root, copies[0]!)?.style).toEqual({ position: "absolute", top: 2, right: "edge" })
  })

  it("leaves the design's root and layers inside instances alone", () => {
    const original = form()
    const { container, copies } = replaceLayers(original, ["root", "stat/value"], [button], base)
    expect(container).toBe(original)
    expect(copies).toEqual([])
  })
})
