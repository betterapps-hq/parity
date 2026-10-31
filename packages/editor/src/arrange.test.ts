import { type CanvasDocument, type ContainerSpec, type DesignNode, findNode, nodeInState } from "@parity-app/core"
import { effectiveFixture } from "@parity-app/core/fixtures"
import { describe, expect, it } from "vite-plus/test"
import {
  alignBoxes,
  alignInLayouts,
  copyLayersInPlace,
  type DesignBox,
  distributeBoxes,
  removeDesigns,
  removeLayers,
  reorderLayer,
  repositionDesigns,
  siblingsOf,
  topLayers,
  unwrapLayout,
  wrapInLayout
} from "./arrange.ts"

const text = (id: string): DesignNode => ({ type: "text", id, text: id })

/** A sign-in form: a heading, a row of two fields, and a card with a title and body in its slot. */
function form(): ContainerSpec {
  return {
    id: "form",
    name: "Form",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "root",
      children: [
        text("heading"),
        {
          type: "layout",
          id: "fields",
          style: { direction: "row", gap: 3 },
          children: [text("email"), text("password")]
        },
        {
          type: "component",
          id: "card",
          component: "ui/Card",
          slots: { children: [text("card-title"), text("card-body")] }
        },
        text("footer")
      ]
    },
    states: [
      { id: "default", name: "Default" },
      { id: "wide", name: "Wide", overrides: { fields: { style: { direction: "column" } } } }
    ]
  }
}

const base = form().states[0]!
const wide = form().states[1]!

/** The shared fixture's card, its board showing the variant options `variants`: Inline turns its body into a row. */
function card(variants: Record<string, string> = {}): ContainerSpec {
  const found = effectiveFixture.designs.find((design) => design.id === "card")!
  return { ...found, view: { ...found.view, variants } }
}

const childIds = (container: ContainerSpec, id: string) => {
  const node = findNode(container.root, id)
  return node?.type === "layout" ? node.children.map((child) => child.id) : undefined
}

const slotIds = (container: ContainerSpec, id: string, slot = "children") => {
  const node = findNode(container.root, id)
  return node?.type === "component" ? node.slots?.[slot]?.map((child) => child.id) : undefined
}

describe("the layers arranging acts on", () => {
  it("are the outermost of the selected, without the root", () => {
    expect(topLayers(form(), ["email", "fields", "card-body"])).toEqual(["fields", "card-body"])
  })

  it("are none when the root is selected, since it holds them all", () => {
    expect(topLayers(form(), ["email", "root"])).toEqual([])
  })
})

describe("deleting layers", () => {
  it("takes them out and names the layout that held the last one", () => {
    const { container, parent } = removeLayers(form(), ["heading", "password"])
    expect(childIds(container, "root")).toEqual(["fields", "card", "footer"])
    expect(childIds(container, "fields")).toEqual(["email"])
    expect(parent).toBe("fields")
  })

  it("names no layout when the last one was in the root", () => {
    const { container, parent } = removeLayers(form(), ["email", "footer"])
    expect(childIds(container, "root")).toEqual(["heading", "fields", "card"])
    expect(parent).toBeUndefined()
  })

  it("names the component a slotted layer was in", () => {
    expect(removeLayers(form(), ["card-title"]).parent).toBe("card")
  })
})

describe("duplicating layers", () => {
  it("puts each copy just after its original, with fresh ids, and returns them in order", () => {
    const original = form()
    const { container, copies } = copyLayersInPlace(original, ["heading", "email", "card-title"])
    expect(copies).toHaveLength(3)
    const [heading, email, title] = copies
    expect(childIds(container, "root")).toEqual(["heading", heading, "fields", "card", "footer"])
    expect(childIds(container, "fields")).toEqual(["email", email, "password"])
    expect(slotIds(container, "card")).toEqual(["card-title", title, "card-body"])
    expect(findNode(container.root, heading!)).toEqual({ type: "text", id: heading, text: "heading" })
  })

  it("gives a copied layout's children fresh ids too", () => {
    const { container, copies } = copyLayersInPlace(form(), ["fields"])
    const children = childIds(container, copies[0]!)!
    expect(children).toHaveLength(2)
    expect(children).not.toContain("email")
    expect(new Set(children).size).toBe(2)
  })

  it("leaves the design as it was when nothing can be copied", () => {
    const original = form()
    expect(copyLayersInPlace(original, ["root", "missing"])).toEqual({ container: original, copies: [] })
  })
})

describe("deleting designs", () => {
  it("takes each out of its own document and leaves the rest", () => {
    const other: ContainerSpec = { ...form(), id: "other", name: "Other" }
    const documents = new Map<string, CanvasDocument>([
      ["main.par", { version: 3, containers: [form(), other] }],
      ["more.par", { version: 3, containers: [{ ...form(), id: "more" }] }]
    ])
    const next = removeDesigns(documents, [
      { path: "main.par", id: "form" },
      { path: "missing.par", id: "form" }
    ])
    expect(next.get("main.par")!.containers.map((container) => container.id)).toEqual(["other"])
    expect(next.get("more.par")).toBe(documents.get("more.par"))
    expect(next.has("missing.par")).toBe(false)
  })
})

describe("selecting all", () => {
  it("gives a layer's siblings in its layout or slot", () => {
    const { root } = form()
    expect(siblingsOf(root, "email")).toEqual(["email", "password"])
    expect(siblingsOf(root, "card-body")).toEqual(["card-title", "card-body"])
  })

  it("gives none for the root", () => {
    expect(siblingsOf(form().root, "root")).toBeUndefined()
  })
})

describe("wrapping in a layout", () => {
  it("lays the new layout out as the parent lays out its layers", () => {
    const { container, id } = wrapInLayout(form(), ["email", "password"], base)
    expect(childIds(container, "fields")).toEqual([id])
    expect(findNode(container.root, id)).toMatchObject({
      type: "layout",
      style: { direction: "row", gap: 3 },
      children: [{ id: "email" }, { id: "password" }]
    })
  })

  it("reads the parent's layout in the state shown", () => {
    const { container, id } = wrapInLayout(form(), ["email", "password"], wide)
    expect(findNode(container.root, id)).toMatchObject({ style: { gap: 3 } })
    expect(findNode(container.root, id)?.style?.direction).toBeUndefined()
  })

  it("reads the parent as the board shows it, with the variant options shown and the frame's viewport", () => {
    // The card's Inline option turns its body into a row with a gap of 6, over the body's mobile gap of 2.
    const inline = wrapInLayout(card({ layout: "inline" }), ["avatar", "copy"], card().states[0]!, "mobile")
    expect(findNode(inline.container.root, inline.id)?.style).toEqual({ direction: "row", gap: 6 })
    const stacked = wrapInLayout(card(), ["avatar", "copy"], card().states[0]!, "mobile")
    expect(findNode(stacked.container.root, stacked.id)?.style).toEqual({ gap: 2 })
    const desktop = wrapInLayout(card(), ["avatar", "copy"], card().states[0]!, "desktop")
    expect(findNode(desktop.container.root, desktop.id)?.style).toEqual({ gap: 4 })
  })

  it("gives a column nothing of its own", () => {
    const { container, id } = wrapInLayout(form(), ["heading", "footer"], base)
    expect(childIds(container, "root")).toEqual([id, "fields", "card"])
    expect(findNode(container.root, id)?.style).toEqual({})
  })

  it("throws for layers that can't be wrapped together", () => {
    expect(() => wrapInLayout(form(), ["heading", "email"], base)).toThrow(
      "Only layers in the same layout can be wrapped together"
    )
  })
})

describe("unwrapping a layout", () => {
  it("leaves its layers where it was and returns them", () => {
    const unwrapped = unwrapLayout(form(), "fields")
    expect(unwrapped?.children).toEqual(["email", "password"])
    expect(childIds(unwrapped!.container, "root")).toEqual(["heading", "email", "password", "card", "footer"])
  })

  it("does nothing to a layer that isn't a layout", () => {
    expect(unwrapLayout(form(), "card")).toBeUndefined()
    expect(unwrapLayout(form(), "missing")).toBeUndefined()
  })
})

describe("ordering a layer", () => {
  const order = (id: string, to: Parameters<typeof reorderLayer>[2]) => childIds(reorderLayer(form(), id, to), "root")

  it("brings it forward, later in its layout, one place or to the front", () => {
    expect(order("heading", "forward")).toEqual(["fields", "heading", "card", "footer"])
    expect(order("heading", "front")).toEqual(["fields", "card", "footer", "heading"])
  })

  it("sends it backward, earlier in its layout, one place or to the back", () => {
    expect(order("footer", "backward")).toEqual(["heading", "fields", "footer", "card"])
    expect(order("footer", "back")).toEqual(["footer", "heading", "fields", "card"])
  })

  it("orders a layer among the others in its slot", () => {
    expect(slotIds(reorderLayer(form(), "card-title", "front"), "card")).toEqual(["card-body", "card-title"])
  })

  it("returns the same design when it's already there", () => {
    const original = form()
    expect(reorderLayer(original, "footer", "forward")).toBe(original)
    expect(reorderLayer(original, "heading", "back")).toBe(original)
    expect(reorderLayer(original, "root", "front")).toBe(original)
  })
})

describe("aligning layers", () => {
  it("aligns a layer by itself on its layout's cross axis", () => {
    // The root is a column, whose cross axis is horizontal.
    const container = alignInLayouts(form(), ["heading"], base, "right")
    expect(findNode(container.root, "heading")?.style).toEqual({ self: "end" })
    expect(findNode(container.root, "root")?.style).toBeUndefined()
  })

  it("moves all of a layout's children along its main axis", () => {
    // The fields are a row, whose main axis is horizontal.
    const container = alignInLayouts(form(), ["email"], base, "center")
    expect(findNode(container.root, "fields")?.style).toMatchObject({ justify: "center" })
    expect(findNode(container.root, "email")?.style).toBeUndefined()
  })

  it("reads the layout's direction, and saves the change, in the state shown", () => {
    // In the wide state, the fields are a column.
    const container = alignInLayouts(form(), ["email"], wide, "left")
    const email = findNode(container.root, "email")!
    expect(email.style).toBeUndefined()
    expect(nodeInState(email, container.states[1]).style).toEqual({ self: "start" })
  })

  it("reads the layout's direction with the variant options the board shows", () => {
    // Inline turns the card's body into a row, so Align right moves its children along it, in the variant shown.
    const container = alignInLayouts(card({ layout: "inline" }), ["copy"], card().states[0]!, "right")
    expect(findNode(container.root, "copy")?.style).toBeUndefined()
    expect(findNode(container.root, "body")?.style).not.toHaveProperty("justify")
    const layout = container.params?.layout
    const inline = layout?.type === "variant" ? layout.options?.find((option) => option.id === "inline") : undefined
    expect(inline?.overrides?.body?.style).toMatchObject({ direction: "row", justify: "end" })
    expect(inline?.overrides?.copy).toBeUndefined()
  })

  it("aligns a layer by itself in a column the board shows", () => {
    const container = alignInLayouts(card({ layout: "stacked" }), ["copy"], card().states[0]!, "right", "mobile")
    expect(findNode(container.root, "copy")?.style).toEqual({ self: "end" })
  })

  it("leaves layers in a slot as they are", () => {
    const original = form()
    expect(alignInLayouts(original, ["card-title"], base, "left")).toBe(original)
  })
})

const box = (key: string, minX: number, minY: number, width: number, height: number): DesignBox => ({
  key,
  position: { x: minX, y: minY },
  minX,
  maxX: minX + width,
  minY,
  maxY: minY + height
})

describe("aligning designs", () => {
  const boxes = [box("a", 0, 0, 100, 50), box("b", 300, 200, 200, 100)]

  it("lines them up by their edges", () => {
    expect(alignBoxes(boxes, "left")).toEqual(
      new Map([
        ["a", { x: 0, y: 0 }],
        ["b", { x: 0, y: 200 }]
      ])
    )
    expect(alignBoxes(boxes, "bottom")).toEqual(
      new Map([
        ["a", { x: 0, y: 250 }],
        ["b", { x: 300, y: 200 }]
      ])
    )
  })

  it("lines them up by their centers, within the span of them all", () => {
    expect(alignBoxes(boxes, "center")).toEqual(
      new Map([
        ["a", { x: 200, y: 0 }],
        ["b", { x: 150, y: 200 }]
      ])
    )
    expect(alignBoxes(boxes, "middle").get("a")).toEqual({ x: 0, y: 125 })
  })

  it("moves the position by as much as the box, where the two differ", () => {
    const offset = { ...box("c", 400, 0, 100, 100), position: { x: 410, y: 5 } }
    expect(alignBoxes([boxes[0]!, offset], "left").get("c")).toEqual({ x: 10, y: 5 })
  })

  it("needs two", () => {
    expect(alignBoxes(boxes.slice(0, 1), "left").size).toBe(0)
  })
})

describe("distributing designs", () => {
  it("spaces them evenly between the outermost two, whatever order they're selected in", () => {
    const boxes = [box("c", 500, 40, 100, 50), box("a", 0, 0, 100, 50), box("b", 120, 20, 200, 50)]
    expect(distributeBoxes(boxes, "horizontal")).toEqual(
      new Map([
        ["a", { x: 0, y: 0 }],
        ["b", { x: 200, y: 20 }],
        ["c", { x: 500, y: 40 }]
      ])
    )
  })

  it("spaces them down the canvas", () => {
    const boxes = [box("a", 0, 0, 50, 100), box("b", 10, 110, 50, 100), box("c", 20, 400, 50, 100)]
    expect(distributeBoxes(boxes, "vertical").get("b")).toEqual({ x: 10, y: 200 })
  })

  it("needs three", () => {
    expect(distributeBoxes([box("a", 0, 0, 1, 1), box("b", 5, 5, 1, 1)], "horizontal").size).toBe(0)
  })
})

describe("moving designs", () => {
  const documents = () =>
    new Map<string, CanvasDocument>([["main.par", { version: 3, containers: [form(), { ...form(), id: "other" }] }]])

  it("moves each to its new position, in whole pixels", () => {
    const next = repositionDesigns(documents(), [{ path: "main.par", id: "form", position: { x: 10.4, y: -3.6 } }])
    const [moved, other] = next.get("main.par")!.containers
    expect(moved!.position).toEqual({ x: 10, y: -4 })
    expect(other!.position).toEqual({ x: 0, y: 0 })
  })

  it("returns the same documents when none of them moved", () => {
    const original = documents()
    expect(
      repositionDesigns(original, [
        { path: "main.par", id: "form", position: { x: 0.2, y: 0 } },
        { path: "missing.par", id: "form", position: { x: 50, y: 50 } }
      ])
    ).toBe(original)
  })
})
