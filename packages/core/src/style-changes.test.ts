import type { NodeStyle } from "@parity-app/style-schema"
import { describe, expect, it } from "vite-plus/test"
import type { ContainerSpec } from "./document.ts"
import { resolveDesign } from "./render.ts"
import { inlineStyles, styleChanges } from "./style-changes.ts"

const design: ContainerSpec = {
  id: "card",
  name: "Card",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "root",
    style: { gap: 4, padding: 2 },
    children: [
      { type: "text", id: "title", text: "Hello", style: { width: 8 } },
      { type: "component", id: "button", component: "Button", props: { children: "Go" }, style: { opacity: 50 } }
    ]
  },
  states: [
    { id: "default", name: "Default" },
    { id: "wide", name: "Wide", overrides: { title: { style: { width: 20 } } } },
    { id: "faint", name: "Faint", overrides: { button: { style: { opacity: 20 } } } }
  ]
}

function render(root: ContainerSpec["root"], state = design.states[0]) {
  return resolveDesign(root, state, "desktop")
}

function withStyle(id: string, style: NodeStyle): ContainerSpec["root"] {
  const root = structuredClone(design.root)

  if (root.type !== "layout") {
    throw new Error("The card's root is a layout")
  }

  const node = id === "root" ? root : root.children.find((child) => child.id === id)!
  node.style = { ...node.style, ...style }

  return root
}

describe("styleChanges", () => {
  it("changes a component's inline style, which lands on its root", () => {
    const changes = styleChanges(render(design.root), render(withStyle("button", { opacity: 40 })))
    expect(changes).toEqual([{ nodeId: "button", set: { opacity: "0.4" }, unset: [] }])
  })

  it("lists only what a style edit changes, component by component", () => {
    const changes = styleChanges(render(design.root), render(withStyle("button", { width: 80 })))
    expect(changes).toEqual([{ nodeId: "button", set: { width: "calc(var(--spacing) * 80)" }, unset: [] }])
  })

  it("takes off what the edit removes", () => {
    const changes = styleChanges(render(design.root), render(withStyle("button", { opacity: undefined })))
    expect(changes).toEqual([{ nodeId: "button", set: {}, unset: ["opacity"] }])
  })

  it("follows the state each render shows", () => {
    const faint = design.states[2]
    // In Faint, the state's own opacity wins over the base design's, so a base edit to it changes nothing there.
    expect(styleChanges(render(design.root, faint), render(withStyle("button", { opacity: 40 }), faint))).toEqual([])
  })

  it("leaves elements out, since rules draw them", () => {
    expect(styleChanges(render(design.root), render(withStyle("title", { width: 80 })))).toEqual([])
    expect(styleChanges(render(design.root), render(withStyle("root", { gap: undefined })))).toEqual([])
  })

  it("is empty when nothing changes", () => {
    expect(styleChanges(render(design.root), render(design.root))).toEqual([])
  })

  it("reads every component's inline style, and no element's", () => {
    const styles = inlineStyles(render(design.root))
    expect([...styles.keys()]).toEqual(["button"])
    expect(styles.get("button")).toEqual({ opacity: "0.5" })
  })
})
