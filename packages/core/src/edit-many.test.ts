import { describe, expect, it } from "vitest"
import type { ContainerSpec, DesignNode } from "./document.ts"
import { childNodes, findNode, moveNodes, topmostNodes, unwrapNode, wrapNodes } from "./edit.ts"

const design: ContainerSpec = {
  id: "settings",
  name: "Settings",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "page",
    children: [
      { type: "text", id: "a", text: "A" },
      { type: "text", id: "b", text: "B" },
      { type: "text", id: "c", text: "C" },
      {
        type: "layout",
        id: "row",
        style: { direction: "row" },
        children: [
          { type: "text", id: "d", text: "D" },
          { type: "text", id: "e", text: "E" }
        ]
      }
    ]
  },
  states: [
    { id: "default", name: "Default" },
    { id: "busy", name: "Busy", overrides: { row: { hidden: true }, d: { text: "Dee" } } }
  ]
}

const ids = (node: DesignNode | undefined) => (node ? childNodes(node).map((child) => child.id) : [])

describe("several nodes at once", () => {
  it("keeps the outermost of nested picks, in tree order", () => {
    expect(topmostNodes(design.root, ["e", "row", "a"]).map((node) => node.id)).toEqual(["a", "row"])
  })

  it("moves nodes together, counting the drop index before the move", () => {
    const root = moveNodes(design.root, ["c", "a"], "page", { index: 2 })
    expect(ids(root)).toEqual(["b", "a", "c", "row"])
  })

  it("moves nodes into another layout", () => {
    const root = moveNodes(design.root, ["a", "b"], "row", { index: 1 })
    expect(ids(root)).toEqual(["c", "row"])
    expect(ids(findNode(root, "row"))).toEqual(["d", "a", "b", "e"])
  })

  it("won't move a layout into itself", () => {
    expect(() => moveNodes(design.root, ["row"], "row")).toThrow(/inside itself/)
  })

  it("wraps siblings in a layout where the first one was", () => {
    const next = wrapNodes(design, ["c", "b"], { id: "stack", style: { gap: 2 } })
    expect(ids(next.root)).toEqual(["a", "stack", "row"])
    expect(ids(findNode(next.root, "stack"))).toEqual(["b", "c"])
  })

  it("only wraps layers in the same layout", () => {
    expect(() => wrapNodes(design, ["a", "d"], { id: "stack" })).toThrow(/same layout/)
  })

  it("unwraps a layout into its parent and drops its overrides", () => {
    const next = unwrapNode(design, "row")
    expect(ids(next.root)).toEqual(["a", "b", "c", "d", "e"])
    expect(next.states[1]?.overrides).toEqual({ d: { text: "Dee" } })
  })
})
