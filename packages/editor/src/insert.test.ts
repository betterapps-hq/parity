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
  type InsertContext,
  insertIntoDesign,
  insertLabel,
  nodeForItem,
  readInsertItem,
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
        { type: "layout", id: "actions", style: { flexDirection: "row" }, children: [text("save"), text("cancel")] },
        { type: "component", id: "card", component: "Card", slots: { header: [text("title")] } }
      ]
    }
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
  }
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
    expect(node.style).toEqual({ width: { step: 80 }, height: { step: 45 } })
  })

  it("makes a video layer at its proportions from a video item (PAR-841)", () => {
    const credit = { name: "Ada Park", url: "https://pixabay.com/users/adapark", source: "Pixabay" }

    const node = nodeForItem(
      { kind: "video", src: "/videos/waves.mp4", alt: "Waves", credit, width: 1920, height: 1080 },
      undefined,
      new Set()
    )

    expect(node).toMatchObject({ type: "video", src: "/videos/waves.mp4", alt: "Waves", credit })
    expect(node.style).toEqual({ width: { step: 80 }, height: { step: 45 } })
  })

  it("keeps an image at least a step tall, and leaves out alt text it wasn't given", () => {
    const node = nodeForItem({ kind: "image", src: "line.png", width: 0, height: 0 }, undefined, new Set())
    expect(node.style).toEqual({ width: { step: 80 }, height: { step: 1 } })
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
    expect(insertLabel({ kind: "video", src: "a.mp4", width: 1, height: 1 })).toBe("Add video")
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

  it("places the item absolutely at the pointer when it's dropped in an absolutely placed layout (PAR-205)", () => {
    const placed = insertIntoDesign(
      page(),
      { parent: "root", at: { left: 12.5, top: 30 } },
      { kind: "component", component: "Button" },
      context({ info: button })
    )

    expect(childIds(placed.container, "root").at(-1)).toBe(placed.node)
    expect(findNode(placed.container.root, placed.node)?.style).toEqual({
      position: "absolute",
      left: { step: 12.5 },
      top: { step: 30 }
    })
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

  it("goes into a selected slot of one of the design's instances, filling it (PAR-84)", () => {
    const panel: ContainerSpec = {
      id: "panel",
      name: "Panel",
      kind: "component",
      position: { x: 0, y: 0 },
      root: { type: "layout", id: "frame", children: [{ type: "layout", id: "body", slot: "body", children: [] }] }
    }

    const placed: DesignNode = {
      type: "layout",
      id: "page",
      children: [{ type: "instance", id: "p", design: "panel" }]
    }

    const library = componentLibrary([panel])
    expect(whereToInsert(placed, "p/body", library)).toEqual({ parent: "p", slot: "body" })
    expect(whereToInsert(placed, "p/frame", library)).toBeUndefined()
  })

  it("has nowhere to go when the root isn't a layout or the layer isn't there", () => {
    const card: DesignNode = { type: "component", id: "card", component: "Card" }
    expect(whereToInsert(card)).toBeUndefined()
    expect(whereToInsert(card, "card")).toBeUndefined()
    expect(whereToInsert(root, "gone")).toBeUndefined()
  })
})

describe("an item dragged from the Assets panel", () => {
  it("reads back as it was dragged", () => {
    const image = { kind: "image", src: "https://images.example/a.jpg", alt: "A desk", width: 1200, height: 800 }
    expect(readInsertItem(JSON.stringify(image))).toEqual(image)
    const icon = { kind: "component", component: "phosphor/Bell", props: { weight: "bold" } }
    expect(readInsertItem(JSON.stringify(icon))).toEqual(icon)
  })

  it("reads as nothing when it isn't an item, so the drop does nothing", () => {
    expect(readInsertItem("Button")).toBeUndefined()
    expect(readInsertItem(JSON.stringify({ kind: "video", src: "intro.mp4" }))).toBeUndefined()
    expect(readInsertItem(JSON.stringify({ kind: "component" }))).toBeUndefined()
    expect(readInsertItem(JSON.stringify({ kind: "image", src: "a.jpg", width: "wide", height: 800 }))).toBeUndefined()
  })
})
