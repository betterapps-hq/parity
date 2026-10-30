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
    { id: "wide", name: "Wide", overrides: { title: { style: { width: 20 } } } }
  ]
}

function render(root: ContainerSpec["root"], state = design.states[0]) {
  return resolveDesign(root, state, "desktop")
}

function withStyle(id: string, style: Record<string, unknown>): ContainerSpec["root"] {
  const root = structuredClone(design.root) as Extract<ContainerSpec["root"], { type: "layout" }>
  const node = id === "root" ? root : root.children.find((child) => child.id === id)!
  node.style = { ...node.style, ...style }
  return root
}

describe("styleChanges", () => {
  it("lists only what a style edit changes, node by node", () => {
    const changes = styleChanges(render(design.root), render(withStyle("title", { width: 80 })))
    expect(changes).toEqual([{ nodeId: "title", set: { width: "calc(var(--spacing) * 80)" }, unset: [] }])
  })

  it("takes off what the edit removes", () => {
    const changes = styleChanges(render(design.root), render(withStyle("root", { gap: undefined })))
    expect(changes).toEqual([{ nodeId: "root", set: {}, unset: ["gap"] }])
  })

  it("changes a component's inline style, which lands on its root", () => {
    const changes = styleChanges(render(design.root), render(withStyle("button", { opacity: 40 })))
    expect(changes).toEqual([{ nodeId: "button", set: { opacity: "0.4" }, unset: [] }])
  })

  it("follows the state each render shows", () => {
    const wide = design.states[1]
    // In Wide, the state's own width wins over the base design's, so a base edit to it changes nothing there.
    expect(styleChanges(render(design.root, wide), render(withStyle("title", { width: 80 }), wide))).toEqual([])
  })

  it("is empty when nothing changes", () => {
    expect(styleChanges(render(design.root), render(design.root))).toEqual([])
  })

  it("reads every node's inline style, components included", () => {
    const styles = inlineStyles(render(design.root))
    expect([...styles.keys()]).toEqual(["root", "title", "button"])
    expect(styles.get("button")).toEqual({ opacity: "0.5" })
  })
})
