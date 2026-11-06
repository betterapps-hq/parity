import { describe, expect, it } from "vite-plus/test"
import { type ContainerSpec, type DesignNode, type LayoutNode, parseCanvasDocument } from "./document.ts"
import { findNode, mapNode, withFreshIds } from "./edit.ts"
import { detachInstance } from "./instances.ts"
import { componentLibrary } from "./render.ts"
import { slotName, slotNameProblem } from "./slot-names.ts"
import { designSlots, enclosingSlot, freeSlotName, setSlot, slotProblem } from "./slots.ts"

const card: ContainerSpec = {
  id: "card",
  name: "Card",
  kind: "component",
  position: { x: 0, y: 0 },
  params: { title: { type: "text", default: "Title" } },
  root: {
    type: "layout",
    id: "card",
    children: [
      { type: "text", id: "title", text: "Title", bind: { text: "title" } },
      {
        type: "layout",
        id: "body",
        name: "Body",
        children: [
          { type: "text", id: "placeholder", text: "Content goes here" },
          { type: "layout", id: "inner", children: [] }
        ]
      },
      { type: "layout", id: "footer", name: "Footer", children: [] }
    ]
  },
  states: [{ id: "default", name: "Default" }]
}

/** Marks a layout as a slot without `setSlot`'s checks, as an agent editing the file might. */
const marking = (container: ContainerSpec, id: string, slot: string): ContainerSpec => ({
  ...container,
  root: mapNode(container.root, id, (node) => ({ ...node, slot }) as DesignNode)
})

describe("marking a layout as a slot", () => {
  it("makes it the children slot or a named one, keeping its layers as placeholder content", () => {
    const marked = setSlot(setSlot(card, "body", "children"), "footer", "actions")
    expect(designSlots(marked).map(({ name, node }) => [name, node.id])).toEqual([
      ["children", "body"],
      ["actions", "footer"]
    ])
    expect((findNode(marked.root, "body") as LayoutNode).children.map((child) => child.id)).toEqual([
      "placeholder",
      "inner"
    ])
  })

  it("makes it a plain layout again", () => {
    const marked = setSlot(card, "body", "children")
    expect(setSlot(marked, "body", undefined)).toEqual(card)
  })

  it("is only for a component design's layouts", () => {
    expect(() => setSlot({ ...card, kind: "screen" }, "body", "children")).toThrow("Only a component design")
    expect(() => setSlot(card, "title", "children")).toThrow("only a layout can be a slot")
  })

  it("takes a name a prop could have, that no param or other slot has", () => {
    const marked = setSlot(card, "body", "children")
    expect(slotProblem(marked, "footer", "side actions")).toBe(
      "A slot's name has to start with a letter and have only letters and digits."
    )
    expect(slotProblem(marked, "footer", "key")).toBe(`A slot's name is "key", which React keeps for itself.`)
    expect(slotProblem(marked, "footer", "title")).toBe("A param is already called title. Give the slot another name.")
    expect(slotProblem(marked, "footer", "children")).toBe("Body is already the children slot.")
    expect(slotProblem(marked, "body", "children")).toBeUndefined()
    expect(() => setSlot(marked, "footer", "children")).toThrow("Body is already the children slot.")
  })

  it("isn't for a layout inside another slot, or around one, since filling the outer slot replaces the inner", () => {
    const marked = setSlot(card, "body", "children")
    expect(enclosingSlot(marked, "inner")).toBe("children")
    expect(slotProblem(marked, "inner", "actions")).toBe(
      "This layout is inside the children slot, so an instance that fills that slot replaces it."
    )
    const inner = setSlot(card, "inner", "actions")
    expect(slotProblem(inner, "body", "children")).toBe("A layout inside this one is already the actions slot.")
  })
})

describe("a new slot's name", () => {
  it("is children while it's free, then the layout's own name, then content, numbered", () => {
    expect(freeSlotName(card, "footer")).toBe("children")
    const marked = setSlot(card, "body", "children")
    expect(freeSlotName(marked, "footer")).toBe("footer")
    expect(freeSlotName(marked, "footer", "actions")).toBe("actions")
    const busy = { ...marked, params: { ...card.params, footer: { type: "text" }, content: { type: "text" } } }
    expect(freeSlotName(busy as ContainerSpec, "footer")).toBe("content2")
  })

  it("is none for a layout that can't be a slot", () => {
    expect(freeSlotName(setSlot(card, "body", "children"), "inner")).toBeUndefined()
  })
})

describe("a design's slots", () => {
  it("are only a component's, so a component turned into a screen keeps its marks for when it's turned back", () => {
    const marked = setSlot(card, "body", "children")
    expect(designSlots({ ...marked, kind: "screen" })).toEqual([])
    expect(designSlots(marked)).toHaveLength(1)
  })

  it("leave out one inside another's placeholder, which an agent or a move can make", () => {
    const nested = marking(setSlot(card, "inner", "actions"), "body", "children")
    expect(designSlots(nested).map((slot) => slot.name)).toEqual(["children"])
  })

  it("are read from a project file, which refuses a name code can't use and a name two layouts share", () => {
    const file = (container: ContainerSpec) => ({ version: 3, containers: [container] })
    const marked = setSlot(setSlot(card, "body", "children"), "footer", "actions")
    expect(parseCanvasDocument(file(marked)).containers[0]).toEqual(marked)
    expect(() => parseCanvasDocument(file(marking(marked, "footer", "side actions")))).toThrow(
      'layer "footer" is a slot whose name has to start with a letter'
    )
    expect(() => parseCanvasDocument(file(marking(marked, "footer", "children")))).toThrow(
      'two layers are the slot "children"'
    )
  })
})

describe("a copy of a slot", () => {
  it("is a plain layout with the placeholder content, since a component has one slot by each name", () => {
    const marked = setSlot(card, "body", "children")
    const copy = withFreshIds(findNode(marked.root, "body")!, new Set()) as LayoutNode
    expect(copy.slot).toBeUndefined()
    expect(copy.children).toHaveLength(2)
  })

  it("baked into a screen by Detach is plain layers", () => {
    const marked = setSlot(card, "body", "children")
    const screen: ContainerSpec = {
      id: "page",
      name: "Page",
      position: { x: 0, y: 0 },
      root: { type: "layout", id: "page", children: [{ type: "instance", id: "copy", design: "card" }] },
      states: [{ id: "default", name: "Default" }]
    }
    const detached = detachInstance(screen, "copy", componentLibrary([marked]))
    const layouts: LayoutNode[] = []
    const visit = (node: ContainerSpec["root"]) => {
      if (node.type === "layout") {
        layouts.push(node)
        node.children.forEach(visit)
      }
    }
    visit(detached.root)
    expect(layouts.length).toBeGreaterThan(2)
    expect(layouts.every((layout) => layout.slot === undefined)).toBe(true)
  })
})

describe("slot names", () => {
  it("are written as code would from what's typed", () => {
    expect(slotName("Side actions")).toBe("sideActions")
    expect(slotName("  children ")).toBe("children")
    expect(slotName("2 icons")).toBe("icons")
    expect(slotName("!!")).toBe("")
  })

  it("are ones a prop could have", () => {
    expect(slotNameProblem("actions")).toBeUndefined()
    expect(slotNameProblem("children")).toBeUndefined()
    expect(slotNameProblem("2up")).toBeDefined()
    expect(slotNameProblem("ref")).toBeDefined()
  })
})
