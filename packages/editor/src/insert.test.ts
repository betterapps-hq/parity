import {
  type ComponentInfo,
  componentLibrary,
  type ComponentSource,
  type ContainerSpec,
  type DesignNode,
  findNode,
  generateId,
  nodeIds
} from "@parity-app/core"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import {
  componentLabel,
  dropAt,
  type DropLayout,
  dropLayout,
  type InsertContext,
  insertIntoDesign,
  insertLabel,
  nodeForItem,
  type ScreenBox,
  whereToInsert
} from "./insert.ts"

const text = (id: string): DesignNode => ({ type: "text", id, text: id })

/** A page with a heading, a row of two buttons, and a card with a title in its slot. */
function page(): ContainerSpec {
  return {
    id: "page",
    name: "Page",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "root",
      children: [
        text("heading"),
        { type: "layout", id: "actions", style: { direction: "row" }, children: [text("save"), text("cancel")] },
        { type: "component", id: "card", component: "Card", slots: { header: [text("title")] } }
      ]
    },
    states: [{ id: "default", name: "Default" }]
  }
}

/** A badge component design, with a param its instances fill. */
const badge: ContainerSpec = {
  id: "badge",
  name: "Badge",
  kind: "component",
  position: { x: 0, y: 0 },
  params: { label: { type: "text", default: "New" } },
  root: {
    type: "layout",
    id: "badge-root",
    name: "Badge",
    children: [{ type: "text", id: "badge-label", text: "New", bind: { text: "label" } }]
  },
  states: [{ id: "default", name: "Default" }]
}

const button: ComponentInfo = {
  name: "Button",
  path: "src/components/ui/button.tsx",
  props: [
    { name: "children", kind: "node", group: "own" },
    { name: "variant", kind: "enum", options: ["default", "outline"], required: true, group: "variant" },
    { name: "disabled", kind: "boolean", group: "html" }
  ]
}

const context = (fields: Partial<InsertContext> = {}): InsertContext => ({
  sources: {},
  library: componentLibrary([badge]),
  ...fields
})

/** The ids of a layout's children, by its id. */
function childIds(container: ContainerSpec, id: string): string[] {
  const node = findNode(container.root, id)
  return node?.type === "layout" ? node.children.map((child) => child.id) : []
}

describe("the layer an item becomes", () => {
  it("gives a component its required props and its name as text", () => {
    const node = nodeForItem({ kind: "component", component: "Button" }, button, new Set())
    expect(node).toMatchObject({
      type: "component",
      component: "Button",
      props: { variant: "default", children: "Button" }
    })
  })

  it("keeps the props an item starts with, and names a library's component without its library", () => {
    const node = nodeForItem(
      { kind: "component", component: "phosphor/Heart", props: { weight: "fill" } },
      { name: "Heart", path: "@phosphor-icons/react", props: [{ name: "children", kind: "node", group: "own" }] },
      new Set()
    )
    expect(node).toMatchObject({ props: { weight: "fill", children: "Heart" } })
  })

  it("places a component design as an instance", () => {
    expect(nodeForItem({ kind: "instance", design: "badge" }, undefined, new Set())).toMatchObject({
      type: "instance",
      design: "badge"
    })
  })

  it("gives an image 80 steps of width and its own shape's height, with its alt text and credit", () => {
    const credit = { name: "Ada", url: "https://example.com/ada" }
    const node = nodeForItem(
      { kind: "image", src: "images/hill.png", alt: "A hill", credit, width: 1600, height: 900 },
      undefined,
      new Set()
    )
    expect(node).toMatchObject({ type: "image", src: "images/hill.png", alt: "A hill", credit })
    expect(node.style).toEqual({ width: 80, height: 45 })
  })

  it("keeps an image at least a step tall, and leaves out alt text it wasn't given", () => {
    const node = nodeForItem({ kind: "image", src: "line.png", width: 0, height: 0 }, undefined, new Set())
    expect(node.style).toEqual({ width: 80, height: 1 })
    expect(node).not.toHaveProperty("alt")
    expect(node).not.toHaveProperty("credit")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("takes an id that isn't taken, past one that is", () => {
    // Every draw the same, so the first id tried is known, and taken.
    const random = vi.spyOn(Math, "random").mockReturnValue(0)
    const first = generateId(new Set())
    // The first five draws make that id again; the rest make another.
    random.mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0)
    random.mockReturnValueOnce(0).mockReturnValue(0.5)
    const id = nodeForItem({ kind: "instance", design: "badge" }, undefined, new Set([first])).id
    expect(id).not.toBe(first)
    expect(id).toHaveLength(first.length)
  })
})

describe("labels", () => {
  it("names a component without its library", () => {
    expect(componentLabel("nova/Button")).toBe("Button")
    expect(componentLabel("Button")).toBe("Button")
  })

  it("labels the undo step by what's added", () => {
    expect(insertLabel({ kind: "component", component: "nova/Button" })).toBe("Add Button")
    expect(insertLabel({ kind: "instance", design: "badge" })).toBe("Add component")
    expect(insertLabel({ kind: "instance", design: "badge", detached: true })).toBe("Add copy")
    expect(insertLabel({ kind: "image", src: "a.png", width: 1, height: 1 })).toBe("Add image")
  })
})

describe("inserting into a design", () => {
  it("puts the item where it's told among a layout's children, or at the end", () => {
    const design = page()
    const between = insertIntoDesign(
      design,
      { parent: "actions", index: 1 },
      { kind: "component", component: "Button" },
      context({ info: button })
    )
    expect(childIds(between.container, "actions")).toEqual(["save", between.node, "cancel"])
    expect(findNode(between.container.root, between.node)).toMatchObject({ props: { variant: "default" } })
    const last = insertIntoDesign(design, { parent: "root" }, { kind: "instance", design: "badge" }, context())
    expect(childIds(last.container, "root")).toEqual(["heading", "actions", "card", last.node])
    expect(design).toEqual(page())
  })

  it("puts the item in a component's slot", () => {
    const placed = insertIntoDesign(
      page(),
      { parent: "card", slot: "header", index: 0 },
      { kind: "instance", design: "badge" },
      context()
    )
    const card = findNode(placed.container.root, "card")
    expect(card?.type === "component" && card.slots?.header?.map((node) => node.id)).toEqual([placed.node, "title"])
  })

  it("brings the library parents a part needs, unless they're around the layout already", () => {
    const source = (fields: Partial<ComponentSource>): ComponentSource => ({
      path: "@acme/ui",
      export: "x",
      library: "acme",
      ...fields
    })
    const sources = {
      "acme/Tabs": source({}),
      "acme/Tab": source({ parents: ["acme/Tabs"] })
    }
    const outside = insertIntoDesign(
      page(),
      { parent: "root" },
      { kind: "component", component: "acme/Tab" },
      context({ sources })
    )
    const added = findNode(outside.container.root, "root")
    const wrapper = added?.type === "layout" ? added.children.at(-1) : undefined
    expect(wrapper).toMatchObject({ type: "component", component: "acme/Tabs" })
    expect(wrapper?.type === "component" && wrapper.slots?.children?.[0]?.id).toBe(outside.node)

    const tabs: ContainerSpec = {
      ...page(),
      root: {
        type: "component",
        id: "tabs",
        component: "acme/Tabs",
        slots: { children: [{ type: "layout", id: "list", children: [] }] }
      }
    }
    const inside = insertIntoDesign(
      tabs,
      { parent: "list" },
      { kind: "component", component: "acme/Tab" },
      context({ sources })
    )
    expect(childIds(inside.container, "list")).toEqual([inside.node])
    expect(findNode(inside.container.root, inside.node)).toMatchObject({ component: "acme/Tab" })
  })

  it("places a detached copy as the plain layers its design shows, keeping the instance's id", () => {
    const placed = insertIntoDesign(
      page(),
      { parent: "root" },
      { kind: "instance", design: "badge", detached: true },
      context()
    )
    const copy = findNode(placed.container.root, placed.node)
    expect(copy).toMatchObject({ type: "layout", name: "Badge" })
    expect(copy?.type === "layout" && copy.children[0]).toMatchObject({ type: "text", text: "New" })
    expect(JSON.stringify(copy)).not.toContain('"bind"')
    expect([...nodeIds(placed.container.root)]).not.toContain("badge-label")
  })
})

describe("where a click inserts", () => {
  const root = page().root

  it("goes into a selected layout, at its end", () => {
    expect(whereToInsert(root, "actions")).toEqual({ parent: "actions" })
    expect(whereToInsert(root, "root")).toEqual({ parent: "root" })
  })

  it("goes just after any other selected layer, in its layout or slot", () => {
    expect(whereToInsert(root, "save")).toEqual({ parent: "actions", index: 1 })
    expect(whereToInsert(root, "card")).toEqual({ parent: "root", index: 3 })
    expect(whereToInsert(root, "title")).toEqual({ parent: "card", index: 1, slot: "header" })
  })

  it("goes at the end of the design's root with no layer selected", () => {
    expect(whereToInsert(root)).toEqual({ parent: "root" })
  })

  it("has nowhere to go when the root isn't a layout or the layer isn't there", () => {
    const card: DesignNode = { type: "component", id: "card", component: "Card" }
    expect(whereToInsert(card)).toBeUndefined()
    expect(whereToInsert(card, "card")).toBeUndefined()
    expect(whereToInsert(root, "gone")).toBeUndefined()
  })
})

describe("where a drop lands", () => {
  const box = (left: number, top: number, width: number, height: number): ScreenBox => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height
  })
  /** A row 400 wide at (100, 50) with three children 100 wide and 40 tall, 20 apart. */
  const row: DropLayout = {
    row: true,
    box: box(100, 50, 400, 60),
    children: [0, 1, 2].map((index) => ({ index, box: box(110 + index * 120, 60, 100, 40) })),
    count: 3
  }

  it("goes into the deepest layout the layer is in", () => {
    const { root } = page()
    const actions = root.type === "layout" ? root.children[1]! : root
    expect(dropLayout([root, actions, text("save")])?.id).toBe("actions")
    expect(dropLayout([root])?.id).toBe("root")
    expect(dropLayout([{ type: "component", id: "card", component: "Card" }])).toBeUndefined()
  })

  it("goes before the first child whose middle is past the point in a row, with a line at its left", () => {
    expect(dropAt(row, { x: 120, y: 70 })).toEqual({ index: 0, line: { x: 108, y: 60, w: 2, h: 40 } })
    expect(dropAt(row, { x: 200, y: 70 })).toEqual({ index: 1, line: { x: 228, y: 60, w: 2, h: 40 } })
  })

  it("goes at the end past the last child's middle, with a line at its right", () => {
    expect(dropAt(row, { x: 450, y: 70 })).toEqual({ index: 3, line: { x: 451, y: 60, w: 2, h: 40 } })
  })

  it("goes down a column by the point's height, with a line across the layout", () => {
    const column: DropLayout = {
      row: false,
      box: box(0, 0, 300, 200),
      children: [
        { index: 0, box: box(10, 10, 280, 50) },
        { index: 1, box: box(10, 80, 280, 50) }
      ],
      count: 2
    }
    expect(dropAt(column, { x: 150, y: 70 })).toEqual({ index: 1, line: { x: 4, y: 78, w: 292, h: 2 } })
    expect(dropAt(column, { x: 150, y: 190 })).toEqual({ index: 2, line: { x: 4, y: 131, w: 292, h: 2 } })
  })

  it("goes into an empty layout just inside its start", () => {
    const empty = { box: box(0, 0, 300, 200), children: [], count: 0 }
    expect(dropAt({ ...empty, row: true }, { x: 150, y: 100 })).toEqual({
      index: 0,
      line: { x: 4, y: 4, w: 2, h: 192 }
    })
    expect(dropAt({ ...empty, row: false }, { x: 150, y: 100 })).toEqual({
      index: 0,
      line: { x: 4, y: 4, w: 292, h: 2 }
    })
  })

  it("counts children the canvas doesn't draw when it goes at the end", () => {
    const hidden: DropLayout = { ...row, children: row.children.slice(0, 2), count: 3 }
    expect(dropAt(hidden, { x: 450, y: 70 })).toEqual({ index: 3, line: { x: 331, y: 60, w: 2, h: 40 } })
    expect(dropAt(hidden, { x: 120, y: 70 }).index).toBe(0)
  })
})
