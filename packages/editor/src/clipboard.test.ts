import { type ContainerSpec, type DesignNode, findNode, nodeIds, nodeInState, type NoteSpec } from "@parity-app/core"
import { effectiveFixture } from "@parity-app/core/fixtures"
import { describe, expect, it } from "vite-plus/test"
import {
  applyStyle,
  type ClipboardPayload,
  copyDesigns,
  copyLayers,
  copyNotes,
  fitBindings,
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
      style: { gap: { step: 2 } },
      children: [
        text("heading"),
        {
          type: "layout",
          id: "fields",
          style: { flexDirection: "row", gap: { step: 3 }, padding: { step: 1 } },
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
          fields: { style: { gap: { step: 1 } } }
        }
      }
    ]
  }
}

const [base, error] = form().states

/** The shared fixture's card, its board showing the variant options `variants`: Inline turns its body into a row. */
function card(variants: Record<string, string> = {}): ContainerSpec {
  const found = effectiveFixture.designs.find((design) => design.id === "card")!

  return { ...found, view: { variants } }
}

/**
 * A welcome banner placing a panel, whose content slot it fills with a layout holding a heading bound to its own
 * `greeting` param. Its Compact state closes the fill's gap and rewords the note beside the heading.
 */
function welcome(): ContainerSpec {
  return {
    id: "welcome",
    name: "Welcome",
    kind: "component",
    position: { x: 0, y: 0 },
    params: { greeting: { type: "text", default: "Welcome back" } },
    root: {
      type: "layout",
      id: "root",
      children: [
        {
          type: "instance",
          id: "panel",
          design: "panel",
          slots: {
            content: [
              {
                type: "layout",
                id: "fill",
                style: { gap: { step: 2 } },
                children: [
                  { type: "text", id: "fill-heading", text: "Heading", bind: { text: "greeting" } },
                  text("fill-note")
                ]
              }
            ]
          }
        }
      ]
    },
    states: [
      { id: "default", name: "Default" },
      {
        id: "compact",
        name: "Compact",
        overrides: { fill: { style: { gap: { step: 1 } } }, "fill-note": { text: "Signed in" } }
      }
    ]
  }
}

/** What an instance fills `slot` with, or nothing when the node isn't an instance filling it. */
const fillOf = (node: DesignNode | undefined, slot: string) =>
  node?.type === "instance" ? node.slots?.[slot] : undefined

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
    const envelope = <Extra>(kind: string, extra: Extra) =>
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
    const envelope = <Payload>(payload: Payload) =>
      readEnvelope(JSON.stringify({ parity: "clipboard", version: 1, project: "D:/acme", payload }))

    expect(envelope({ kind: "layers", nodes: [null] })).toBeUndefined()
    expect(envelope({ kind: "layers", nodes: [{}] })).toBeUndefined()
    expect(envelope({ kind: "layers", nodes: [{ type: "layout", id: "row" }] })).toBeUndefined()
    const { position: _position, ...unplaced } = form()
    expect(envelope({ kind: "designs", designs: [unplaced] })).toBeUndefined()
    expect(envelope({ kind: "notes", notes: [{ id: "note-a", text: "Flow starts here" }] })).toBeUndefined()
  })

  it("reads nothing from a newer version's copy whose layers this one can't read", () => {
    const envelope = <Payload>(payload: Payload) =>
      readEnvelope(JSON.stringify({ parity: "clipboard", version: 1, project: "D:/acme", payload }))

    expect(envelope({ kind: "layers", nodes: [{ ...text("heading"), blur: 4 }] })).toBeUndefined()
    expect(envelope({ kind: "layers", nodes: [{ type: "video", id: "intro" }] })).toBeUndefined()
    const repeated = { type: "layout", id: "row", children: [text("a"), text("a")] }
    expect(envelope({ kind: "layers", nodes: [repeated] })).toBeUndefined()
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
          style: { flexDirection: "row", gap: { step: 1 }, padding: { step: 1 } },
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

  it("copies what the board shows: the variant options, the frame's viewport and the bound values", () => {
    const inline = card({ layout: "inline" })
    const payload = copyLayers(inline, ["body"], inline.states[1], "mobile")
    const [body] = payload?.kind === "layers" ? payload.nodes : []
    // The Inline option's row, the Compact state's gap over it, and the mobile padding.
    expect(body?.style).toEqual({ flexDirection: "row", gap: { step: 2 }, padding: { step: 2 } })
    const copy = body?.type === "layout" ? body.children[1] : undefined
    const [title, meta] = copy?.type === "layout" ? copy.children : []
    // The title shows its param's default, still bound to it; the meta is hidden on mobile.
    expect(title).toMatchObject({ text: "Card title", bind: { text: "title" } })
    expect(meta).toMatchObject({ text: "Today", hidden: true })
  })

  it("copies the layers an instance fills its slots with as the state shows them too (PAR-966)", () => {
    const payload = copyLayers(welcome(), ["panel"], welcome().states[1])
    const [panel] = payload?.kind === "layers" ? payload.nodes : []
    expect(fillOf(panel, "content")).toEqual([
      {
        type: "layout",
        id: "fill",
        style: { gap: { step: 1 } },
        children: [
          { type: "text", id: "fill-heading", text: "Welcome back", bind: { text: "greeting" } },
          { type: "text", id: "fill-note", text: "Signed in" }
        ]
      }
    ])
  })
})

describe("pasting a bound layer", () => {
  const title = () => {
    const payload = copyLayers(card(), ["title"], card().states[0])

    return payload?.kind === "layers" ? payload.nodes : []
  }

  it("keeps the binding in a design with a param of that name", () => {
    const destination: ContainerSpec = { ...form(), params: { title: { type: "text", default: "Welcome" } } }
    const { container, copies } = pasteLayers(destination, { parent: "root" }, title())
    expect(findNode(container.root, copies[0]!)).toMatchObject({ text: "Card title", bind: { text: "title" } })
  })

  it("keeps the value shown, unbound, in a design without that param", () => {
    const { container, copies } = pasteLayers(form(), { parent: "root" }, title())
    const pasted = findNode(container.root, copies[0]!)
    expect(pasted).toMatchObject({ text: "Card title" })
    expect(pasted).not.toHaveProperty("bind")
  })

  it("keeps only the bindings the design has params for, all the way down", () => {
    const node: DesignNode = {
      type: "layout",
      id: "group",
      children: [
        {
          type: "component",
          id: "button",
          component: "ui/Button",
          props: { children: "Go", disabled: false },
          bind: { props: { children: "label", disabled: "busy" }, visible: "shown" }
        }
      ]
    }

    const destination: ContainerSpec = { ...form(), params: { label: { type: "text" } } }
    const fitted = fitBindings(node, destination)
    expect(fitted.type === "layout" && fitted.children[0]?.bind).toEqual({ props: { children: "label" } })
  })

  /** The heading in the layout an instance fills its content slot with. */
  const fillHeading = (node: DesignNode | undefined) => {
    const [fill] = fillOf(node, "content") ?? []

    return fill?.type === "layout" ? fill.children[0] : undefined
  }

  it("fits the bindings of the layers an instance fills its slots with (PAR-966)", () => {
    const panel = findNode(welcome().root, "panel")!
    expect(fillHeading(fitBindings(panel, form()))).toEqual({ type: "text", id: "fill-heading", text: "Heading" })

    const destination: ContainerSpec = { ...form(), params: { greeting: { type: "text", default: "Hello" } } }
    expect(fillHeading(fitBindings(panel, destination))).toMatchObject({ bind: { text: "greeting" } })
  })

  it("pastes an instance's fill showing what it showed, unbound in a design without the param (PAR-966)", () => {
    const payload = copyLayers(welcome(), ["panel"], welcome().states[0])
    const nodes = payload?.kind === "layers" ? payload.nodes : []
    const { container, copies } = pasteLayers(form(), { parent: "root" }, nodes)
    const heading = fillHeading(findNode(container.root, copies[0]!))
    expect(heading).toMatchObject({ type: "text", text: "Welcome back" })
    expect(heading).not.toHaveProperty("bind")
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

    for (const id of copies) {
      expect(nodeIds(original.root).has(id)).toBe(false)
    }

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

    for (const copy of copies) {
      expect(copy.id).toMatch(/^note-/)
    }

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
    expect(styleOf(form(), "fields", error)).toEqual({ flexDirection: "row", gap: { step: 1 }, padding: { step: 1 } })
    expect(styleOf(form(), "heading", base)).toEqual({})
    expect(styleOf(form(), "missing", base)).toBeUndefined()
  })

  it("copies a layer's look with the variant options the board shows and the frame's viewport", () => {
    const inline = card({ layout: "inline" })
    expect(styleOf(inline, "body", inline.states[0]!, "mobile")).toEqual({
      flexDirection: "row",
      gap: { step: 2 },
      padding: { step: 2 }
    })
    expect(styleOf(card(), "body", inline.states[0]!, "desktop")).toEqual({
      flexDirection: "column",
      gap: { step: 4 },
      padding: { step: 4 }
    })
  })

  it("gives each layer the copied style in place of its own", () => {
    const container = applyStyle(form(), ["fields", "heading"], base, { gap: { step: 5 } })
    expect(findNode(container.root, "fields")?.style).toEqual({ gap: { step: 5 } })
    expect(findNode(container.root, "heading")?.style).toEqual({ gap: { step: 5 } })
  })

  it("saves it as the state's changes in a state other than the base", () => {
    const container = applyStyle(form(), ["fields"], error, { padding: { step: 4 } })
    const fields = findNode(container.root, "fields")!
    expect(fields.style).toEqual({ flexDirection: "row", gap: { step: 3 }, padding: { step: 1 } })
    expect(nodeInState(fields, container.states[1]).style).toMatchObject({ padding: { step: 4 } })
  })

  it("leaves only the copied style in a state other than the base, taking away what the design sets", () => {
    const container = applyStyle(form(), ["fields"], error, { padding: { step: 4 } })
    const fields = findNode(container.root, "fields")!
    expect(nodeInState(fields, container.states[1]).style).toEqual({ padding: { step: 4 } })
    // The state keeps it as its changes: the padding, and the design's flex direction and gap taken away.
    expect(container.states[1]!.overrides?.fields).toEqual({
      style: { padding: { step: 4 } },
      unset: { style: ["flexDirection", "gap"] }
    })
    expect(nodeInState(fields, container.states[0]).style).toEqual({
      flexDirection: "row",
      gap: { step: 3 },
      padding: { step: 1 }
    })
  })

  it("takes away nothing the design doesn't set, pasted in a state", () => {
    const container = applyStyle(form(), ["heading"], error, { padding: { step: 2 } })
    expect(container.states[1]!.overrides?.heading).toEqual({ style: { padding: { step: 2 } } })
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
