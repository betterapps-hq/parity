import { describe, expect, it } from "vite-plus/test"
import {
  type ContainerSpec,
  type DesignNode,
  type InstanceNode,
  type LayoutNode,
  parseCanvasDocument
} from "./document.ts"
import { findNode, insertNode, locateNode, mapNode, withFreshIds } from "./edit.ts"
import { detachInstance } from "./instances.ts"
import { componentLibrary, type RenderNode, resolveDesign } from "./render.ts"
import { slotName, slotNameProblem } from "./slot-names.ts"
import {
  childrenSlot,
  clearSlot,
  designSlots,
  enclosingSlot,
  freeSlotName,
  instanceSlots,
  setSlot,
  slotAtPath,
  slotProblem
} from "./slots.ts"

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
  it("names it, keeping its layers as placeholder content", () => {
    const marked = setSlot(setSlot(card, "body", "content"), "footer", "actions")
    expect(designSlots(marked).map(({ name, node }) => [name, node.id])).toEqual([
      ["content", "body"],
      ["actions", "footer"]
    ])
    expect((findNode(marked.root, "body") as LayoutNode).children.map((child) => child.id)).toEqual([
      "placeholder",
      "inner"
    ])
  })

  it("makes it a plain layout again", () => {
    const marked = setSlot(card, "body", "content")
    expect(setSlot(marked, "body", undefined)).toEqual(card)
  })

  it("is only for a component design's layouts", () => {
    expect(() => setSlot({ ...card, kind: "screen" }, "body", "content")).toThrow("Only a component design")
    expect(() => setSlot(card, "title", "content")).toThrow("only a layout can be a slot")
  })

  it("takes a name a prop could have, that no param or other slot has", () => {
    const marked = setSlot(card, "body", "content")
    expect(slotProblem(marked, "footer", "side actions")).toBe(
      "A slot's name has to start with a letter and have only letters and digits."
    )
    expect(slotProblem(marked, "footer", "key")).toBe(`A slot's name is "key", which React keeps for itself.`)
    expect(slotProblem(marked, "footer", "title")).toBe("A param is already called title. Give the slot another name.")
    expect(slotProblem(marked, "footer", "children")).toBe(`A slot's name is "children", which React keeps for itself.`)
    expect(slotProblem(marked, "footer", "content")).toBe("Body is already the content slot.")
    expect(slotProblem(marked, "body", "content")).toBeUndefined()
    expect(() => setSlot(marked, "footer", "content")).toThrow("Body is already the content slot.")
  })

  it("isn't for a layout inside another slot, or around one, since filling the outer slot replaces the inner", () => {
    const marked = setSlot(card, "body", "content")
    expect(enclosingSlot(marked, "inner")).toBe("content")
    expect(slotProblem(marked, "inner", "actions")).toBe(
      "This layout is inside the content slot, so an instance that fills that slot replaces it."
    )
    const inner = setSlot(card, "inner", "actions")
    expect(slotProblem(inner, "body", "content")).toBe("A layout inside this one is already the actions slot.")
  })
})

describe("a new slot's name", () => {
  it("is the layout's own name, then content, numbered", () => {
    expect(freeSlotName(card, "footer")).toBe("footer")
    expect(freeSlotName(card, "footer", "actions")).toBe("actions")
    const busy = { ...card, params: { ...card.params, footer: { type: "text" }, content: { type: "text" } } }
    expect(freeSlotName(busy as ContainerSpec, "footer")).toBe("content2")
  })

  it("is none for a layout that can't be a slot", () => {
    expect(freeSlotName(setSlot(card, "body", "content"), "inner")).toBeUndefined()
  })
})

describe("a design's slots", () => {
  it("are only a component's, so a component turned into a screen keeps its marks for when it's turned back", () => {
    const marked = setSlot(card, "body", "content")
    expect(designSlots({ ...marked, kind: "screen" })).toEqual([])
    expect(designSlots(marked)).toHaveLength(1)
  })

  it("leave out one inside another's placeholder, which an agent or a move can make", () => {
    const nested = marking(setSlot(card, "inner", "actions"), "body", "content")
    expect(designSlots(nested).map((slot) => slot.name)).toEqual(["content"])
  })

  it("are read from a project file, which refuses a name code can't use and a name two layouts share", () => {
    const file = (container: ContainerSpec) => ({ version: 3, containers: [container] })
    const marked = setSlot(setSlot(card, "body", "content"), "footer", "actions")
    expect(parseCanvasDocument(file(marked)).containers[0]).toEqual(marked)
    expect(() => parseCanvasDocument(file(marking(marked, "footer", "side actions")))).toThrow(
      'layer "footer" is a slot whose name has to start with a letter'
    )
    expect(() => parseCanvasDocument(file(marking(marked, "footer", "content")))).toThrow(
      'two layers are the slot "content"'
    )
  })
})

describe("the slot code nests between the tags", () => {
  it("is the one holding the most layers, whatever it's called", () => {
    const marked = setSlot(setSlot(card, "body", "content"), "footer", "actions")
    expect(childrenSlot(designSlots(marked))?.name).toBe("content")
    const fuller = mapNode(marked.root, "footer", (node) => ({
      ...(node as LayoutNode),
      children: [1, 2, 3].map((index) => ({ type: "text" as const, id: `action${index}`, text: "Action" }))
    }))
    expect(childrenSlot(designSlots({ ...marked, root: fuller }))?.name).toBe("actions")
  })

  it("is the first in layer order on a tie, and none without slots", () => {
    const even = setSlot(setSlot(card, "footer", "actions"), "inner", "extra")
    expect(childrenSlot(designSlots(even))?.name).toBe("extra")
    expect(childrenSlot([])).toBeUndefined()
  })
})

describe("filling an instance's slots", () => {
  const component = setSlot(setSlot(card, "body", "content"), "footer", "actions")
  const library = componentLibrary([component])
  const page: ContainerSpec = {
    id: "page",
    name: "Page",
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "page", children: [{ type: "instance", id: "copy", design: "card" }] },
    states: [{ id: "default", name: "Default" }]
  }
  const filled = (container: ContainerSpec): ContainerSpec => ({
    ...container,
    root: insertNode(container.root, "copy", { type: "text", id: "mine", text: "Mine" }, { slot: "content" })
  })
  const texts = (nodes: RenderNode[]): string[] =>
    nodes.flatMap((node) => {
      if (node.kind === "text") return [node.text]
      if (node.kind === "element") return texts(node.children)
      return Object.values(node.slots).flatMap(texts)
    })
  const ids = (nodes: RenderNode[]): string[] =>
    nodes.flatMap((node) => {
      if (node.kind === "text") return []
      if (node.kind === "element") return [node.nodeId, ...ids(node.children)]
      return [node.nodeId, ...Object.values(node.slots).flatMap(ids)]
    })

  it("keeps the fill on the instance as the design's own layers, in the slot it fills", () => {
    const page2 = filled(page)
    expect(locateNode(page2.root, "mine")).toMatchObject({ slot: "content", index: 0 })
    expect(() => insertNode(page.root, "copy", { type: "text", id: "x", text: "X" })).toThrow("Say which")
    expect(
      instanceSlots(findNode(page2.root, "copy") as InstanceNode, library).map((slot) => [slot.name, slot.fill.length])
    ).toEqual([
      ["content", 1],
      ["actions", 0]
    ])
  })

  it("draws the fill in place of the placeholder, with its own ids, and the placeholder where it's empty", () => {
    const drawn = resolveDesign(filled(page).root, undefined, "desktop", library)
    expect(texts(drawn)).toEqual(["Title", "Mine"])
    expect(ids(drawn)).toContain("mine")
    expect(ids(drawn)).toContain("copy/footer")
    expect(texts(resolveDesign(page.root, undefined, "desktop", library))).toEqual(["Title", "Content goes here"])
  })

  it("is what a path to the component's slot layout inside the instance points at", () => {
    expect(slotAtPath(filled(page).root, "copy/body", library)?.slot).toMatchObject({ name: "content" })
    expect(slotAtPath(filled(page).root, "copy/title", library)).toBeUndefined()
    expect(slotAtPath(filled(page).root, "copy", library)).toBeUndefined()
    expect(slotAtPath(filled(page).root, "copy/body/placeholder", library)).toBeUndefined()
  })

  it("is cleared, deleting its layers, so the placeholder shows again", () => {
    const cleared = clearSlot(filled(page).root, "copy", "content")
    expect(findNode(cleared, "copy")).toEqual(page.root.type === "layout" ? page.root.children[0] : undefined)
  })

  it("is baked in by Detach, its layers keeping their ids where the placeholder was", () => {
    const detached = detachInstance(filled(page), "copy", library)
    const body = locateNode(detached.root, "mine")
    expect(body?.ancestors.at(-1)?.type).toBe("layout")
    expect(JSON.stringify(detached.root)).not.toContain("Content goes here")
  })

  it("is read from a project file, which refuses a fill reusing one of the design's ids", () => {
    const file = (container: ContainerSpec) => ({ version: 3, containers: [component, container] })
    expect(parseCanvasDocument(file(filled(page))).containers[1]).toEqual(filled(page))
    const clash = {
      ...page,
      root: insertNode(page.root, "copy", { type: "text", id: "taken", text: "A" }, { slot: "content" })
    }
    const doubled = JSON.parse(
      JSON.stringify(clash).replace(
        '"slots":{"content":[',
        '"slots":{"content":[{"type":"text","id":"page","text":"B"},'
      )
    )
    expect(() => parseCanvasDocument(file(doubled))).toThrow('duplicate node id "page"')
  })
})

describe("a copy of a slot", () => {
  it("is a plain layout with the placeholder content, since a component has one slot by each name", () => {
    const marked = setSlot(card, "body", "content")
    const copy = withFreshIds(findNode(marked.root, "body")!, new Set()) as LayoutNode
    expect(copy.slot).toBeUndefined()
    expect(copy.children).toHaveLength(2)
  })

  it("baked into a screen by Detach is plain layers", () => {
    const marked = setSlot(card, "body", "content")
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
    expect(slotNameProblem("children")).toBeDefined()
    expect(slotNameProblem("2up")).toBeDefined()
    expect(slotNameProblem("ref")).toBeDefined()
  })
})
