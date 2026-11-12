import { type ContainerSpec, type DesignNode, effectiveNode, findNode, type NodeStyle } from "@parity-app/core"
import { effectiveFixture } from "@parity-app/core/fixtures"
import { describe, expect, it } from "vite-plus/test"
import { boardReader } from "./shown.ts"
import {
  fieldEdit,
  fillEdit,
  layoutTypeEdit,
  placementEdit,
  rowKeys,
  sidesField,
  sizeEdit,
  sizeField,
  styleRows,
  styleSelection,
  styleValues,
  type StyleValues,
  textSizingEdit
} from "./style-editing.ts"

const text = (id: string, style?: NodeStyle): DesignNode => ({ type: "text", id, text: id, style })

/** A toolbar row of two buttons' labels and a column of notes, with a Hover state that changes the first label. */
function toolbar(): ContainerSpec {
  return {
    id: "toolbar",
    name: "Toolbar",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "root",
      children: [
        {
          type: "layout",
          id: "buttons",
          style: { direction: "row", gap: 2 },
          children: [text("save", { padding: 2, weight: 600 }), text("cancel", { padding: 4, weight: 600 })]
        },
        { type: "layout", id: "notes", children: [text("note", { grow: true, padding: 2 })] }
      ]
    },
    states: [
      { id: "default", name: "Default" },
      { id: "hover", name: "Hover", overrides: { save: { style: { background: "accent", padding: 3 } } } }
    ]
  }
}

const { library } = effectiveFixture

const fixture = (id: string, variants?: Record<string, string>): ContainerSpec => {
  const found = effectiveFixture.designs.find((design) => design.id === id)!

  return variants ? { ...found, view: { ...found.view, variants } } : found
}

const styleOf = (container: ContainerSpec, id: string, state?: string) =>
  boardReader(container, { state: container.states.find((candidate) => candidate.id === state) })(
    findNode(container.root, id)!
  ).style ?? {}

describe("the state a style edit goes to", () => {
  it("takes the variant option the board shows, so an edit lands in that option", () => {
    const selection = styleSelection(fixture("card", { layout: "inline" }), ["body"], undefined)!
    expect(selection.target).toEqual({ state: "base", variant: { param: "layout", option: "inline" } })
    expect(selection.layers[0]!.base).toBe(false)
    // The layer shows as the option draws it.
    expect(selection.style).toMatchObject({ direction: "row", gap: 6 })

    const card = fixture("card", { layout: "inline" })
    const edited = selection.edit("gap", { gap: 8 })(card)
    expect(edited.root.style?.gap).toBe(4)
    expect(edited.params?.layout?.options?.[1]?.overrides?.body?.style?.gap).toBe(8)
  })
})

describe("the style several layers share", () => {
  it("shows what they share and lists what differs", () => {
    const selection = styleSelection(toolbar(), ["save", "cancel"], undefined)!
    expect(selection.style).toEqual({ weight: 600 })
    expect(selection.mixed).toEqual(["padding"])
    expect(selection.differs("padding")).toBe(true)
    expect(selection.differs("weight")).toBe(false)
  })

  it("reads each layer as the state being edited shows it", () => {
    const selection = styleSelection(toolbar(), ["save", "cancel"], "hover")!
    expect(selection.mixed).toEqual(["padding", "background"])
  })

  it("skips layers that no longer exist, and is nothing when none do", () => {
    expect(styleSelection(toolbar(), ["save", "gone"], undefined)!.layers.map((layer) => layer.id)).toEqual(["save"])
    expect(styleSelection(toolbar(), ["gone"], undefined)).toBeUndefined()
  })

  it("adds to each layer's own value with Mixed+8, rather than giving them all one", () => {
    const design = toolbar()
    const selection = styleSelection(design, ["save", "cancel"], undefined)!
    const { read, write } = sidesField("padding", [0, 1, 2, 3])

    // 8px at 4px a step is two steps.
    const edited = selection.edit(
      "padding",
      fieldEdit(read, write, (value) => Number(value ?? 0) + 2)
    )(design)

    expect(styleOf(edited, "save").padding).toBe(4)
    expect(styleOf(edited, "cancel").padding).toBe(6)
  })
})

describe("a layer's order", () => {
  it("is edited, shown as differing and reset as Layer order's row", () => {
    let design = toolbar()
    design = styleSelection(design, ["save"], undefined)!.edit("layerOrder", { zIndex: 10 })(design)
    expect(styleOf(design, "save").zIndex).toBe(10)

    const both = styleSelection(design, ["save", "cancel"], undefined)!
    expect(both.differs("layerOrder")).toBe(true)

    design = both.edit("layerOrder", { zIndex: "z-overlay" })(design)
    expect(styleOf(design, "cancel").zIndex).toBe("z-overlay")
    expect(styleSelection(design, ["save", "cancel"], undefined)!.style.zIndex).toBe("z-overlay")

    const hover = styleSelection(design, ["save"], "hover")!
    const reset = hover.reset("layerOrder")(hover.edit("layerOrder", { zIndex: -5 })(design))
    expect(styleOf(reset, "save", "hover").zIndex).toBe("z-overlay")
  })
})

describe("what a layer's order orders it within", () => {
  it("is the nearest layer around it with a layer order or see-through, or else the design's root", () => {
    const design = toolbar()
    const stacking = (container: ContainerSpec, ids: string[]) => styleSelection(container, ids, undefined)!.stacking
    expect(stacking(design, ["save"])).toMatchObject({ id: "root", because: "root" })

    const buttons = findNode(design.root, "buttons")!
    buttons.name = "Buttons"
    buttons.style = { ...buttons.style, zIndex: 1 }
    const notes = findNode(design.root, "notes")!
    notes.style = { opacity: 50 }

    expect(stacking(design, ["save", "cancel"])).toEqual({ id: "buttons", name: "Buttons", because: "layerOrder" })
    expect(stacking(design, ["note"])).toMatchObject({ id: "notes", because: "opacity" })
    // Layers in different ones share none.
    expect(stacking(design, ["save", "note"])).toBeUndefined()
  })
})

describe("what a state changes", () => {
  it("marks a row changed when the state changes any of its keys on any of the layers", () => {
    const selection = styleSelection(toolbar(), ["save", "cancel"], "hover")!
    expect(selection.changed("padding")).toBe(true)
    expect(selection.changed("fill")).toBe(true)
    expect(selection.changed("weight")).toBe(false)
    expect(styleSelection(toolbar(), ["save"], "default")!.changed("padding")).toBe(false)
  })

  it("writes an edit into the state, leaving the design as it was", () => {
    const design = toolbar()
    const edited = styleSelection(design, ["cancel"], "hover")!.edit("weight", { weight: 700 })(design)
    expect(styleOf(edited, "cancel").weight).toBe(600)
    expect(styleOf(edited, "cancel", "hover").weight).toBe(700)
  })

  it("resets every key of the row on every layer", () => {
    let design = toolbar()
    design = styleSelection(design, ["cancel"], "hover")!.edit("padding", { padding: 5 })(design)
    const selection = styleSelection(design, ["save", "cancel"], "hover")!
    const reset = selection.reset("padding")(design)
    expect(styleOf(reset, "save", "hover")).toEqual({ padding: 2, weight: 600, background: "accent" })
    expect(styleOf(reset, "cancel", "hover")).toEqual({ padding: 4, weight: 600 })
  })

  it("resets Placement's insets with it, as putting a layer back in the layout drops them", () => {
    let design = toolbar()
    design = styleSelection(design, ["save"], "hover")!.edit("placement", placementEdit(true))(design)
    expect(styleOf(design, "save", "hover")).toMatchObject({ position: "absolute", top: 0, left: 0 })
    design = styleSelection(design, ["save"], "hover")!.reset("placement")(design)
    expect(styleOf(design, "save", "hover")).toEqual({ padding: 3, weight: 600, background: "accent" })
  })

  it("gives a state transitions of its own, which the board plays on switching to it, and takes them back (PAR-934)", () => {
    let design = toolbar()
    const transitions = [{ property: "colors", duration: 200, easing: "ease-out" }]
    design = styleSelection(design, ["save", "cancel"], "default")!.edit("transitions", { transitions })(design)
    const springy = [{ property: "transform", easing: { spring: { duration: 400, bounce: 0.3 } } }]
    design = styleSelection(design, ["save"], "hover")!.edit("transitions", { transitions: springy })(design)
    expect(styleOf(design, "save").transitions).toEqual(transitions)
    expect(styleOf(design, "save", "hover").transitions).toEqual(springy)

    const hover = styleSelection(design, ["save", "cancel"], "hover")!
    expect(hover.changed("transitions")).toBe(true)
    expect(hover.differs("transitions")).toBe(true)
    design = hover.reset("transitions")(design)
    expect(styleOf(design, "save", "hover").transitions).toEqual(transitions)
    expect(styleSelection(design, ["save", "cancel"], "hover")!.style.transitions).toEqual(transitions)
  })

  it("does nothing on reset when edits change the design itself", () => {
    const design = toolbar()
    expect(styleSelection(design, ["save"], "default")!.reset("padding")(design)).toBe(design)
  })
})

describe("the layout the layers sit in", () => {
  it("is their shared parent's direction, and whether it's a grid", () => {
    expect(styleSelection(toolbar(), ["save", "cancel"], undefined)!.parent).toEqual({ direction: "row", grid: false })
    expect(styleSelection(toolbar(), ["note"], undefined)!.parent).toEqual({ direction: "column", grid: false })
    expect(styleSelection(toolbar(), ["root"], undefined)!.parent).toBeUndefined()
  })

  it("is nothing when the layers sit in different ones, though each knows its own", () => {
    const selection = styleSelection(toolbar(), ["save", "note"], undefined)!
    expect(selection.parent).toBeUndefined()
    expect(selection.layers.map((layer) => layer.parent?.direction)).toEqual(["row", "column"])
  })

  it("is read as the board shows it, with the variant option's direction", () => {
    expect(styleSelection(fixture("card"), ["copy"], undefined)!.parent?.direction).toBe("column")
    expect(styleSelection(fixture("card", { layout: "inline" }), ["copy"], undefined)!.parent?.direction).toBe("row")
  })

  it("is read inside an instance as that copy shows it", () => {
    const profile = fixture("profile")
    // The person card places the Inline option, which turns its body into a row.
    const avatar = styleSelection(profile, ["person/avatar"], undefined, library)!
    expect(avatar.parent).toEqual({ direction: "row", grid: false })
    expect(styleSelection(profile, ["person/title"], undefined, library)!.parent?.direction).toBe("column")
  })

  it("gives Width or Height `grow` only along the parent's direction", () => {
    expect(rowKeys("width", { direction: "row", grid: false })).toEqual(["width", "grow"])
    expect(rowKeys("height", { direction: "row", grid: false })).toEqual(["height"])
    expect(rowKeys("height", { direction: "column", grid: false })).toEqual(["height", "grow"])
    expect(rowKeys("width", undefined)).toEqual(["width", "grow"])
  })
})

describe("a layer inside an instance", () => {
  it("is edited as that copy's override, and marked and reset there", () => {
    const profile = fixture("profile")
    const selection = styleSelection(profile, ["person/title"], undefined, library)!
    expect(selection.layers[0]!.base).toBe(false)
    expect(selection.style.weight).toBe(600)
    const edited = selection.edit("weight", { weight: 800 })(profile)
    expect(effectiveNode(edited, "person/title", { library })?.style?.weight).toBe(800)

    const again = styleSelection(edited, ["person/title"], undefined, library)!
    expect(again.changed("weight")).toBe(true)
    expect(effectiveNode(again.reset("weight")(edited), "person/title", { library })?.style?.weight).toBe(600)
  })

  it("is skipped without the library to find it in", () => {
    expect(styleSelection(fixture("profile"), ["person/title"], undefined)).toBeUndefined()
  })
})

describe("rows' edits", () => {
  /** Every key a row's edit writes, over a few styles and layers. */
  const written = (edit: (style: NodeStyle) => StyleValues, styles: NodeStyle[]) =>
    new Set(styles.flatMap((style) => Object.keys(edit(style))))

  const styles: NodeStyle[] = [{}, { grow: true }, { width: "hug", height: 10, columns: 3, top: 2 }]
  const layer = { base: false, measure: () => 12, type: "text" as const, column: true }

  it("write only the keys their row resets", () => {
    const cases: [keyof typeof styleRows, (style: NodeStyle) => StyleValues][] = [
      ["layoutType", (style) => styleValues(layoutTypeEdit("grid"), style, layer)],
      ["layoutType", (style) => styleValues(layoutTypeEdit("row"), style, layer)],
      ["placement", (style) => styleValues(placementEdit(true), style, layer)],
      ["placement", (style) => styleValues(placementEdit(false), style, layer)],
      ["resizing", (style) => styleValues(textSizingEdit("auto-width"), style, layer)],
      ["resizing", (style) => styleValues(textSizingEdit("fixed"), style, layer)],
      ["padding", (style) => sidesField("padding", [0, 2]).write(1, style)],
      ["margin", (style) => sidesField("margin", [1]).write(1, style)]
    ]

    for (const parent of [undefined, { direction: "column" as const, grid: false }]) {
      for (const axis of ["width", "height"] as const) {
        cases.push([axis, (style) => styleValues(sizeEdit(axis, "hug", parent), style, layer)])
        cases.push([axis, (style) => sizeField(axis, parent).write(undefined, style)])
      }
    }

    for (const [row, edit] of cases) {
      for (const key of written(edit, styles)) {
        expect(styleRows[row], `${row} writes ${key}`).toContain(key)
      }
    }
  })

  it("replace a `grow` that filled along the size with the size set", () => {
    expect(styleValues(sizeEdit("width", 20, undefined), { grow: true }, layer)).toEqual({ width: 20, grow: undefined })

    expect(styleValues(sizeEdit("width", 20, { direction: "column", grid: false }), { grow: true }, layer)).toEqual({
      width: 20
    })
    // A cleared length leaves fill as it shows.
    expect(sizeField("height", { direction: "column", grid: false }).write(undefined, { grow: true })).toEqual({
      height: "fill",
      grow: undefined
    })
  })

  it("size text by each layer's own measure, rounded up, and leave other layers alone", () => {
    const design: ContainerSpec = {
      ...toolbar(),
      root: {
        type: "layout",
        id: "root",
        children: [text("label", { width: "hug" }), { type: "layout", id: "box", children: [] }]
      }
    }

    const measured = new Map([
      ["label", { width: 10.2, height: 4 }],
      ["box", { width: 30, height: 30 }]
    ])

    const edited = styleSelection(design, ["label", "box"], undefined)!.edit(
      "resizing",
      textSizingEdit("fixed"),
      (id, axis, round) => {
        const size = measured.get(id)

        return size && round(size[axis])
      }
    )(design)

    expect(styleOf(edited, "label")).toEqual({ width: 11, height: 4 })
    expect(styleOf(edited, "box")).toEqual({})
  })
})

describe("the Fill row's edit", () => {
  it("writes one plain color as its token's name, as a file before paint stacks held it", () => {
    expect(fillEdit([{ kind: "solid", color: "card" }])).toEqual({ background: "card" })
  })

  it("writes a stack, or one color with alpha or hidden, as paints, and nothing for no paints", () => {
    const stack = [
      { kind: "gradient" as const, token: "gradient-brand" },
      { kind: "solid" as const, color: "card" }
    ]

    expect(fillEdit(stack)).toEqual({ background: stack })
    expect(fillEdit([{ kind: "solid", color: "card", alpha: 40 }])).toEqual({
      background: [{ kind: "solid", color: "card", alpha: 40 }]
    })
    expect(fillEdit([{ kind: "solid", color: "card", hidden: true }])).toEqual({
      background: [{ kind: "solid", color: "card", hidden: true }]
    })
    expect(fillEdit([])).toEqual({ background: undefined })
  })
})
