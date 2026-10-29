import { type ContainerSpec, type DesignNode, findNode, nodeIds, type NodeStyle } from "@parity/core"
import { describe, expect, it } from "vitest"
import { replaceLayers } from "./paste-over.ts"

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
