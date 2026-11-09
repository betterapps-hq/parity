import { describe, expect, it } from "vite-plus/test"
import type { ContainerSpec } from "./document.ts"
import { findNode } from "./edit.ts"
import { addValueProp, bindableProps, bindField, freePropName, propFromField, propNameProblem } from "./prop-binding.ts"
import { setSlot } from "./slots.ts"

const card: ContainerSpec = {
  id: "card",
  name: "Card",
  kind: "component",
  position: { x: 0, y: 0 },
  params: { title: { type: "text", default: "Title" }, featured: { type: "boolean", default: true } },
  root: {
    type: "layout",
    id: "card",
    children: [
      { type: "text", id: "title", name: "Title", text: "Title", bind: { text: "title" } },
      { type: "text", id: "note", name: "Note", text: "Cancel any time" },
      { type: "layout", id: "body", name: "Body", children: [] }
    ]
  },
  states: [{ id: "default", name: "Default" }]
}

describe("adding a value prop", () => {
  it("adds a text, number or toggle prop with a default for its kind", () => {
    const added = addValueProp(
      addValueProp(addValueProp(card, "price", "number"), "subtitle", "text"),
      "wide",
      "boolean"
    )

    expect(added.params).toMatchObject({
      price: { type: "number", default: 0 },
      subtitle: { type: "text", default: "Text" },
      wide: { type: "boolean", default: false }
    })
  })

  it("takes a name code could use, that no prop or slot has", () => {
    const slotted = setSlot(card, "body", "body")
    expect(propNameProblem(slotted, "2up")).toBe(
      "A prop's name has to start with a letter and have only letters and digits."
    )
    expect(propNameProblem(slotted, "title")).toBe("There's already a prop called title.")
    expect(propNameProblem(slotted, "body")).toBe("There's already a prop called body.")
    expect(() => addValueProp(slotted, "title", "text")).toThrow("There's already a prop called title.")
    expect(() => addValueProp({ ...card, kind: "screen" }, "x", "text")).toThrow("Only a component design")
    expect(freePropName(card, "Title")).toBe("title2")
  })
})

describe("a layer's field using a prop", () => {
  it("lists the props a field can use: text props for text, toggles for visibility", () => {
    expect(bindableProps(card, "text")).toEqual(["title"])
    expect(bindableProps(card, "visible")).toEqual(["featured"])
  })

  it("uses a prop, and goes back to the value the prop showed, so the layer looks the same", () => {
    const bound = bindField(card, "note", "visible", "featured")
    expect(findNode(bound.root, "note")?.bind).toEqual({ visible: "featured" })
    const unbound = bindField(card, "title", "text", undefined)
    expect(findNode(unbound.root, "title")).toEqual({ type: "text", id: "title", name: "Title", text: "Title" })
    const hiding = { ...card, params: { ...card.params, featured: { type: "boolean" as const, default: false } } }
    expect(
      findNode(bindField(bindField(hiding, "note", "visible", "featured"), "note", "visible", undefined).root, "note")
        ?.hidden
    ).toBe(true)
  })

  it("refuses a prop of the wrong kind, and text on a layer that isn't text", () => {
    expect(() => bindField(card, "note", "text", "featured")).toThrow("Card has no text prop called featured")
    expect(() => bindField(card, "body", "text", "title")).toThrow("Only a text layer's text")
  })

  it("makes a prop from a field, named after the layer, with what it shows as the default", () => {
    const made = propFromField(card, "note", "text")
    expect(made.name).toBe("note")
    expect(made.container.params?.note).toEqual({ type: "text", default: "Cancel any time" })
    expect(findNode(made.container.root, "note")?.bind).toEqual({ text: "note" })
    const shown = propFromField(card, "note", "visible")
    expect(shown.name).toBe("showNote")
    expect(shown.container.params?.showNote).toEqual({ type: "boolean", default: true })
  })
})
