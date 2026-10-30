import { type ContainerSpec, type DesignNode, findNode, nodeIds, nodeInState, type NoteSpec } from "@parity/core"
import { describe, expect, it } from "vitest"
import {
  applyStyle,
  type ClipboardPayload,
  copyDesigns,
  copyLayers,
  copyNotes,
  designOfLayers,
  isParityCopy,
  isSvgMarkup,
  missingComponents,
  pasteLayers,
  pasteTarget,
  readEnvelope,
  styleOf,
  textLayer,
  writeEnvelope
} from "./clipboard.ts"

const text = (id: string): DesignNode => ({ type: "text", id, text: id })

/** A sign-in form: a heading, a row of two fields, and a card with a title in its slot. */
function form(): ContainerSpec {
  return {
    id: "form",
    name: "Form",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "root",
      style: { gap: 2 },
      children: [
        text("heading"),
        {
          type: "layout",
          id: "fields",
          style: { direction: "row", gap: 3, padding: 1 },
          children: [text("email"), text("password")]
        },
        { type: "component", id: "card", component: "ui/Card", slots: { children: [text("card-title")] } }
      ]
    },
    states: [
      { id: "default", name: "Default" },
      {
        id: "error",
        name: "Error",
        overrides: {
          email: { text: "Enter your email" },
          "card-title": { text: "Couldn't sign in" },
          fields: { style: { gap: 1 } }
        }
      }
    ]
  }
}

const [base, error] = form().states as [ContainerSpec["states"][0], ContainerSpec["states"][0]]

const childIds = (container: ContainerSpec, id: string) => {
  const node = findNode(container.root, id)
  return node?.type === "layout" ? node.children.map((child) => child.id) : undefined
}

describe("the clipboard's envelope", () => {
  const payload = { kind: "layers", nodes: [text("heading")] } as const

  it("reads back what was written", () => {
    const { text: written, envelope } = writeEnvelope("D:/acme", { kind: "layers", nodes: [text("heading")] })
    expect(envelope).toEqual({ parity: "clipboard", version: 1, project: "D:/acme", payload })
    expect(readEnvelope(written)).toEqual(envelope)
  })

  it("reads nothing from other text", () => {
    expect(readEnvelope("Sign in")).toBeUndefined()
    expect(readEnvelope('{"parity":"clipboard",')).toBeUndefined()
    expect(readEnvelope(JSON.stringify({ parity: "clipboard", version: 2, project: "D:/acme", payload }))).toBe(
      undefined
    )
    expect(readEnvelope(JSON.stringify({ parity: "clipboard", version: 1, project: 7, payload }))).toBeUndefined()
    expect(
      readEnvelope(JSON.stringify({ parity: "clipboard", version: 1, project: "D:/acme", payload: { kind: "rows" } }))
    ).toBeUndefined()
  })

  it("reads nothing when a payload doesn't hold the list its kind pastes, or it's empty", () => {
    const envelope = (kind: string, extra: object) =>
      readEnvelope(JSON.stringify({ parity: "clipboard", version: 1, project: "D:/acme", payload: { kind, ...extra } }))
    expect(envelope("layers", {})).toBeUndefined()
    expect(envelope("layers", { nodes: "heading" })).toBeUndefined()
    expect(envelope("designs", { nodes: [] })).toBeUndefined()
    expect(envelope("notes", { notes: null })).toBeUndefined()
    expect(envelope("layers", { nodes: [] })).toBeUndefined()
    expect(envelope("designs", { designs: [] })).toBeUndefined()
    expect(envelope("notes", { notes: [] })).toBeUndefined()
  })

  it("reads nothing when what it holds doesn't match the .par schema", () => {
    const envelope = (payload: object) =>
      readEnvelope(JSON.stringify({ parity: "clipboard", version: 1, project: "D:/acme", payload }))
    expect(envelope({ kind: "layers", nodes: [null] })).toBeUndefined()
    expect(envelope({ kind: "layers", nodes: [{}] })).toBeUndefined()
    expect(envelope({ kind: "layers", nodes: [{ type: "layout", id: "row" }] })).toBeUndefined()
    const { position: _position, ...unplaced } = form()
    expect(envelope({ kind: "designs", designs: [unplaced] })).toBeUndefined()
    expect(envelope({ kind: "notes", notes: [{ id: "note-a", text: "Flow starts here" }] })).toBeUndefined()
  })

  it("tells a Parity copy that can't be read from other text, so it never pastes as text", () => {
    const broken = JSON.stringify({ parity: "clipboard", version: 1, project: "D:/acme", payload: { kind: "rows" } })
    expect(readEnvelope(broken)).toBeUndefined()
    expect(isParityCopy(broken)).toBe(true)
    expect(isParityCopy(writeEnvelope("D:/acme", { kind: "layers", nodes: [text("heading")] }).text)).toBe(true)
    expect(isParityCopy('{"parity":"app"}')).toBe(false)
    expect(isParityCopy("Sign in")).toBe(false)
  })

  it("reads back designs and notes that match it", () => {
    const note: NoteSpec = { id: "note-a", text: "Flow starts here", position: { x: 1, y: 2 } }
    const payloads: ClipboardPayload[] = [
      { kind: "designs", designs: [form()] },
      { kind: "notes", notes: [note] }
    ]
    for (const payload of payloads) {
      const { text: written } = writeEnvelope("D:/acme", payload)
      expect(readEnvelope(written)?.payload).toEqual(payload)
    }
  })
})

describe("text on the clipboard", () => {
  it("is a picture when it's SVG markup", () => {
    expect(isSvgMarkup('  <svg viewBox="0 0 24 24"><path d="M0 0h24"/></svg>\n')).toBe(true)
    expect(isSvgMarkup('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBe(true)
  })

  it("is text otherwise, as a text layer", () => {
    expect(isSvgMarkup("<svg> is how icons start")).toBe(false)
    expect(isSvgMarkup("<svgx></svg>")).toBe(false)
    expect(textLayer("Sign in")).toEqual({ type: "text", id: "pasted", text: "Sign in" })
  })
})

describe("copying layers", () => {
  it("copies the outermost of them, as the state shows them, everything inside included", () => {
    const payload = copyLayers(form(), ["email", "fields", "card"], error)
    expect(payload).toEqual({
      kind: "layers",
      nodes: [
        {
          type: "layout",
          id: "fields",
          style: { direction: "row", gap: 1, padding: 1 },
          children: [{ type: "text", id: "email", text: "Enter your email" }, text("password")]
        },
        {
          type: "component",
          id: "card",
          component: "ui/Card",
          slots: { children: [{ type: "text", id: "card-title", text: "Couldn't sign in" }] }
        }
      ]
    })
  })

  it("copies nothing when none of them are there", () => {
    expect(copyLayers(form(), ["missing"], base)).toBeUndefined()
  })
})

describe("where pasted layers go", () => {
  it("goes into a selected layout when it's the only layer selected", () => {
    expect(pasteTarget(form(), { node: "fields", nodes: ["fields"] })).toEqual({ parent: "fields" })
  })

  it("goes just after the last of the selected layers, in its layout or slot", () => {
    expect(pasteTarget(form(), { node: "fields", nodes: ["heading", "fields"] })).toEqual({
      parent: "root",
      index: 2,
      slot: undefined
    })
    expect(pasteTarget(form(), { node: "card-title", nodes: ["card-title"] })).toEqual({
      parent: "card",
      index: 1,
      slot: "children"
    })
  })

  it("goes into the design's root when no layer is selected", () => {
    expect(pasteTarget(form(), { nodes: [] })).toEqual({ parent: "root" })
  })

  it("has nowhere to go when the root isn't a layout", () => {
    const card: ContainerSpec = { ...form(), root: { type: "component", id: "root", component: "ui/Card" } }
    expect(pasteTarget(card, { nodes: [] })).toBeUndefined()
  })
})

describe("pasting layers", () => {
  it("puts copies with fresh ids at the target, in order", () => {
    const original = form()
    const nodes = [text("heading"), { ...text("email"), id: "fields" }]
    const { container, copies } = pasteLayers(original, { parent: "root", index: 1 }, nodes)
    expect(copies).toHaveLength(2)
    expect(childIds(container, "root")).toEqual(["heading", ...copies, "fields", "card"])
    for (const id of copies) expect(nodeIds(original.root).has(id)).toBe(false)
    expect(findNode(container.root, copies[0]!)).toEqual({ type: "text", id: copies[0], text: "heading" })
  })

  it("puts them last when the target has no index, and gives what's inside them fresh ids", () => {
    const fields = findNode(form().root, "fields")!
    const { container, copies } = pasteLayers(form(), { parent: "fields" }, [fields])
    expect(childIds(container, "fields")).toEqual(["email", "password", copies[0]])
    const inner = childIds(container, copies[0]!)!
    expect(inner).toHaveLength(2)
    expect(inner).not.toContain("email")
  })

  it("puts them in a slot", () => {
    const { container, copies } = pasteLayers(form(), { parent: "card", index: 0, slot: "children" }, [text("x")])
    const card = findNode(container.root, "card")
    expect(card?.type === "component" && card.slots?.children?.map((child) => child.id)).toEqual([
      copies[0],
      "card-title"
    ])
  })
})

describe("layers pasted with nothing to paste into", () => {
  it("become a new screen that lays them out", () => {
    const design = designOfLayers([text("heading"), text("heading")], ["form", "pasted"], { x: 40, y: 60 })
    expect(design).toMatchObject({
      id: "pasted-2",
      name: "Pasted",
      position: { x: 40, y: 60 },
      root: { type: "layout", style: { padding: 6, gap: 4 } },
      states: [{ id: "default", name: "Default" }]
    })
    const ids = [...nodeIds(design.root)]
    expect(ids).toHaveLength(3)
    expect(ids).not.toContain("heading")
  })
})

describe("pasting designs", () => {
  it("keeps their ids unless they're taken, and moves them together in whole pixels", () => {
    const designs = [form(), { ...form(), id: "settings", name: "Settings", position: { x: 1400, y: 0 } }]
    const copies = copyDesigns(designs, ["form"], { x: 10.6, y: -20 })
    expect(copies.map((copy) => copy.id)).toEqual(["form-2", "settings"])
    expect(copies.map((copy) => copy.position)).toEqual([
      { x: 11, y: -20 },
      { x: 1411, y: -20 }
    ])
  })

  it("keeps an id that isn't made from the design's name", () => {
    const signup = { ...form(), id: "signup", name: "Sign up" }
    expect(copyDesigns([signup], ["form"], { x: 0, y: 0 })[0]!.id).toBe("signup")
    expect(copyDesigns([signup], ["signup"], { x: 0, y: 0 })[0]!.id).toBe("sign-up")
  })

  it("gives two copies of one design different ids", () => {
    const copies = copyDesigns([form(), form()], [], { x: 0, y: 0 })
    expect(copies.map((copy) => copy.id)).toEqual(["form", "form-2"])
  })
})

describe("pasting notes", () => {
  const notes: NoteSpec[] = [
    { id: "note-a", text: "Flow starts here", position: { x: 100, y: 50 } },
    { id: "note-b", text: "Then here", position: { x: 300, y: 80 }, width: 200 }
  ]

  it("puts them a little below and right of where they were, with fresh ids", () => {
    const copies = copyNotes(notes, ["note-a", "note-b"])
    expect(copies.map((note) => note.position)).toEqual([
      { x: 124, y: 74 },
      { x: 324, y: 104 }
    ])
    expect(copies[1]).toMatchObject({ text: "Then here", width: 200 })
    for (const copy of copies) expect(copy.id).toMatch(/^note-/)
    expect(new Set([...copies.map((copy) => copy.id), "note-a", "note-b"]).size).toBe(4)
  })

  it("puts their top left at a place, sitting as they sat together", () => {
    expect(copyNotes(notes, [], { x: 0, y: 0 }).map((note) => note.position)).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 30 }
    ])
  })
})

describe("copying and pasting style", () => {
  it("copies a layer's look as the state shows it", () => {
    expect(styleOf(form(), "fields", error)).toEqual({ direction: "row", gap: 1, padding: 1 })
    expect(styleOf(form(), "heading", base)).toEqual({})
    expect(styleOf(form(), "missing", base)).toBeUndefined()
  })

  it("gives each layer the copied style in place of its own", () => {
    const container = applyStyle(form(), ["fields", "heading"], base, { gap: 5 })
    expect(findNode(container.root, "fields")?.style).toEqual({ gap: 5 })
    expect(findNode(container.root, "heading")?.style).toEqual({ gap: 5 })
  })

  it("saves it as the state's changes in a state other than the base", () => {
    const container = applyStyle(form(), ["fields"], error, { padding: 4 })
    const fields = findNode(container.root, "fields")!
    expect(fields.style).toEqual({ direction: "row", gap: 3, padding: 1 })
    expect(nodeInState(fields, container.states[1]).style).toMatchObject({ padding: 4 })
  })
})

describe("components missing from the project", () => {
  it("are those the layers name, at any depth, that it doesn't have", () => {
    const nodes: DesignNode[] = [
      {
        type: "layout",
        id: "row",
        children: [
          { type: "component", id: "a", component: "ui/Button" },
          {
            type: "component",
            id: "b",
            component: "ui/Card",
            slots: { children: [{ type: "component", id: "c", component: "ui/Badge" }] }
          },
          { type: "component", id: "d", component: "ui/Badge" }
        ]
      }
    ]
    expect(missingComponents(nodes, { "ui/Button": {} })).toEqual(["ui/Card", "ui/Badge"])
  })

  it("are none while the project's components aren't known", () => {
    expect(missingComponents([{ type: "component", id: "a", component: "ui/Button" }], {})).toEqual([])
  })
})
