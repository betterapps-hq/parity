import { describe, expect, it } from "vite-plus/test"
import type { DesignNode } from "./document.ts"
import { type ComponentInfo, propsPanel } from "./props.ts"

/** A Fluent Button as the props reader sees it: its `icon` slot is its own, its children and attributes aren't. */
const button: ComponentInfo = {
  name: "fluent/Button",
  path: "@fluentui/react-components",
  props: [
    { name: "icon", kind: "node", group: "own", type: "Slot<'span'>" },
    { name: "children", kind: "node", group: "html" },
    { name: "root", kind: "node", group: "html" },
    { name: "disabled", kind: "boolean", group: "html" },
    { name: "onClick", kind: "function", group: "event" }
  ]
}

const icon: DesignNode = { type: "component", id: "star", component: "fluent-icons/StarRegular" }
const names = (props: { name: string }[]) => props.map((prop) => prop.name)

describe("propsPanel", () => {
  it("lists a content slot as children shows, taking text until its slot holds layers", () => {
    const panel = propsPanel(button, { props: { children: "Save" } })
    expect(names(panel.main)).toEqual(["icon"])
    expect(panel.inSlot.has("icon")).toBe(false)
    expect(panel.extra).toEqual([])
  })

  it("says a prop is set in layers once its slot holds them, and doesn't offer it again", () => {
    const panel = propsPanel(button, { props: { children: "Save" }, slots: { icon: [icon] } })
    expect(panel.inSlot.has("icon")).toBe(true)
    expect(names(panel.addable)).not.toContain("icon")
  })

  it("lists an attribute's slot with layers among the extra props", () => {
    const panel = propsPanel(button, { slots: { root: [icon] } })
    expect(panel.extra).toEqual(["root"])
    expect(names(panel.addable)).not.toContain("root")
  })

  it("leaves a library's children in layers to the Layers panel", () => {
    const panel = propsPanel(button, { slots: { children: [icon] } })
    expect(panel.extra).toEqual([])
    expect(panel.inSlot.has("children")).toBe(true)
  })

  it("keeps a text label out of the list and functions out of what can be added", () => {
    const own: ComponentInfo = { ...button, props: [{ name: "children", kind: "node", group: "own" }] }
    expect(propsPanel(own, { props: { children: "Save" } }).main).toEqual([])
    expect(names(propsPanel(button, {}).addable)).toEqual(["children", "root", "disabled"])
  })
})
