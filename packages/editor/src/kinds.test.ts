import {
  type CanvasDocument,
  type ContainerSpec,
  defaultModeSettings,
  findNode,
  parseCanvasDocument
} from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { withTidyView } from "./document-equality.ts"
import { frameAsLayout, moveFrameInto, pasteFramesInto, turnInto } from "./kinds.ts"

/** A component showing its Empty state, main on mobile with two modes beside, sized for desktop and mobile. */
const pricing: ContainerSpec = {
  id: "pricing",
  name: "Pricing",
  kind: "component",
  position: { x: 10, y: 20 },
  root: {
    type: "layout",
    id: "page",
    name: "Page",
    children: [
      {
        type: "text",
        id: "title",
        text: "Plans",
        responsive: { mobile: { style: { fontSize: { token: "text-xl" } } } }
      },
      { type: "text", id: "empty", text: "No plans yet", hidden: true }
    ]
  },
  states: [
    { id: "default", name: "Default" },
    { id: "empty", name: "Empty", overrides: { empty: { hidden: false }, title: { hidden: true } } }
  ],
  view: { mode: "mobile-light", modes: ["desktop-light", "desktop-dark"], state: "empty", allStates: true },
  frames: { mobile: { width: 390, height: 700 }, desktop: { width: 1000 } }
}

/** A component whose heading is bound to a param, with a variant whose Large option pads it. */
const card: ContainerSpec = {
  id: "card",
  name: "Card",
  kind: "component",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "card-root",
    children: [{ type: "text", id: "heading", text: "Title", bind: { text: "title" } }]
  },
  params: {
    title: { type: "text", default: "Card title" },
    size: {
      type: "variant",
      options: [
        { id: "small", name: "Small" },
        { id: "large", name: "Large", overrides: { "card-root": { style: { padding: { step: 8 } } } } }
      ]
    }
  },
  view: { variants: { size: "large" } }
}

const sketch: ContainerSpec = {
  id: "sketch",
  name: "Sketch",
  kind: "frame",
  position: { x: 2000, y: 0 },
  size: { width: 400, height: 300 },
  root: {
    type: "layout",
    id: "sketch-root",
    style: { padding: { step: 6 }, fills: [{ type: "solid", color: { token: "background" } }] },
    children: [{ type: "text", id: "idea", text: "Idea" }]
  }
}

/** A design as a file reads it back, which throws when the file would be invalid. */
function reread(design: ContainerSpec): ContainerSpec | undefined {
  return parseCanvasDocument({ version: 4, containers: [design] }).containers[0]
}

describe("turning a design into a frame", () => {
  it("keeps its layers and first state, and says which states and modes it drops", () => {
    const { design, dropped } = turnInto(pricing, "frame", defaultModeSettings)
    expect(design).toEqual({
      id: "pricing",
      name: "Pricing",
      kind: "frame",
      position: { x: 10, y: 20 },
      // The layers as the first state draws them, responsive patches and all.
      root: pricing.root,
      // Drawn at its desktop frame's size, desktop being the primary mode's viewport.
      size: { width: 1000 }
    })
    expect(dropped).toEqual({
      states: [{ id: "empty", name: "Empty" }],
      // Mobile was its main mode; desktop light, the primary, is the one a frame keeps.
      modes: ["mobile-light", "desktop-dark"],
      params: [],
      variants: []
    })
    expect(reread(design)).toEqual(design)
  })

  it("keeps a component's layers as its board showed them, values filled in, and drops its params and variants", () => {
    const { design, dropped } = turnInto(card, "frame", defaultModeSettings)
    expect(design.root).toEqual({
      type: "layout",
      id: "card-root",
      style: { padding: { step: 8 } },
      children: [{ type: "text", id: "heading", text: "Card title" }]
    })
    expect(design).not.toHaveProperty("params")
    expect(design).not.toHaveProperty("view")
    expect(design.size).toEqual({ width: 1280 })
    expect(dropped).toEqual({ states: [], modes: [], params: ["title"], variants: ["size"] })
    expect(reread(design)).toEqual(design)
  })

  it("puts a root that isn't a layout inside one", () => {
    const button: ContainerSpec = {
      ...pricing,
      root: { type: "component", id: "cta", component: "Button" },
      states: [pricing.states![0]!]
    }

    const { design } = turnInto(button, "frame", defaultModeSettings)
    expect(design.root).toMatchObject({ type: "layout", children: [button.root] })
    expect(design.root.id).not.toBe("cta")
    expect(reread(design)).toEqual(design)
  })
})

describe("turning a frame into a screen or a component", () => {
  it("drops nothing, and keeps its size as its frame's in the primary viewport", () => {
    for (const kind of ["screen", "component"] as const) {
      const { design, dropped } = turnInto(sketch, kind, defaultModeSettings)
      const { size: _size, ...rest } = sketch
      expect(design).toEqual({ ...rest, kind, frames: { desktop: { width: 400, height: 300 } } })
      expect(dropped).toEqual({ states: [], modes: [], params: [], variants: [] })
      expect(reread(design)).toEqual(design)
    }

    const { size: _size, ...unsized } = sketch
    expect(turnInto(unsized, "screen", defaultModeSettings).design).not.toHaveProperty("frames")
  })

  it("comes back a frame with the layers it had", () => {
    const screen = turnInto(sketch, "screen", defaultModeSettings).design
    expect(turnInto(screen, "frame", defaultModeSettings).design).toEqual(sketch)
  })
})

describe("turning a screen and a component into each other", () => {
  it("makes a screen a component by its kind alone", () => {
    const { states: _states, view: _view, ...screen } = { ...pricing, kind: "screen" as const }
    const { design, dropped } = turnInto(screen, "component", defaultModeSettings)
    expect(design).toEqual({ ...screen, kind: "component" })
    expect(dropped.states).toEqual([])
    expect(reread(design)).toEqual(design)
  })

  it("makes a component a screen as its first state shows it, dropping its other states (PAR-1002)", () => {
    const { design, dropped } = turnInto(pricing, "screen", defaultModeSettings)
    const { states: _states, ...rest } = pricing
    // Only a component has states, so the screen keeps the base's layers and the view's modes, not its states.
    expect(design).toEqual({
      ...rest,
      kind: "screen",
      view: { mode: "mobile-light", modes: ["desktop-light", "desktop-dark"] }
    })
    expect(dropped).toEqual({ states: [{ id: "empty", name: "Empty" }], modes: [], params: [], variants: [] })
    expect(reread(design)).toEqual(design)
    expect(turnInto(card, "screen", defaultModeSettings).design).toEqual({ ...card, kind: "screen" })
  })

  it("puts what a component's base state patches into the screen's layers", () => {
    const patched: ContainerSpec = {
      ...pricing,
      states: [{ id: "default", name: "Default", overrides: { title: { text: "Pricing" } } }]
    }

    const { design } = turnInto(patched, "screen", defaultModeSettings)
    expect(findNode(design.root, "title")).toMatchObject({ text: "Pricing" })
    expect(design).not.toHaveProperty("states")
  })

  it("gives back the same design when the kind is the one it has", () => {
    expect(turnInto(sketch, "frame", defaultModeSettings).design).toBe(sketch)
    expect(turnInto({ ...card, kind: undefined }, "screen", defaultModeSettings).design.kind).toBeUndefined()
  })
})

describe("a frame inside another design", () => {
  it("is a layout named after it, at its size in spacing steps", () => {
    expect(frameAsLayout(sketch, 4)).toEqual({
      type: "layout",
      id: "sketch-root",
      name: "Sketch",
      style: {
        padding: { step: 6 },
        fills: [{ type: "solid", color: { token: "background" } }],
        width: { step: 100 },
        height: { step: 75 }
      },
      children: [{ type: "text", id: "idea", text: "Idea" }]
    })
    // 402px is 100.5 steps, on the half step; a frame without a size leaves its layout's to the layout around it.
    expect(frameAsLayout({ ...sketch, size: { width: 402 } }, 4).style).toEqual({
      padding: { step: 6 },
      fills: [{ type: "solid", color: { token: "background" } }],
      width: { step: 100.5 }
    })
    expect(() => frameAsLayout(pricing, 4)).toThrow("Pricing isn't a frame")
  })

  it("goes in as a layout when pasted into a design, and a screen doesn't go in at all", () => {
    const pasted = pasteFramesInto(pricing, { parent: "page", index: 1 }, [sketch], 4)!
    const root = pasted.container.root
    const layer = root.type === "layout" ? root.children[1] : undefined
    expect(layer).toMatchObject({
      type: "layout",
      name: "Sketch",
      style: { width: { step: 100 }, height: { step: 75 } }
    })
    expect(pasted.copies).toEqual([layer?.id])
    expect(layer?.id).not.toBe("sketch-root")
    expect(pasteFramesInto(pricing, { parent: "page" }, [sketch, card], 4)).toBeUndefined()
  })

  it("leaves the canvas when moved into a design", () => {
    const documents = new Map<string, CanvasDocument>([
      ["app.par", { version: 4, containers: [pricing, sketch] }],
      ["more.par", { version: 4, containers: [card] }]
    ])

    const moved = moveFrameInto(
      documents,
      { path: "app.par", id: "sketch" },
      { path: "more.par", id: "card" },
      {
        parent: "card-root"
      },
      4
    )

    expect(moved.documents.get("app.par")!.containers).toEqual([pricing])
    const into = moved.documents.get("more.par")!.containers[0]!
    expect(findNode(into.root, moved.layer)).toMatchObject({ type: "layout", name: "Sketch" })
    expect(documents.get("app.par")!.containers).toHaveLength(2)
    const app = { path: "app.par", id: "sketch" }
    expect(() => moveFrameInto(documents, app, app, { parent: "sketch-root" }, 4)).toThrow("inside itself")
    expect(() =>
      moveFrameInto(
        documents,
        { path: "app.par", id: "pricing" },
        { path: "more.par", id: "card" },
        {
          parent: "card-root"
        },
        4
      )
    ).toThrow("Pricing isn't a frame")
  })
})

describe("a frame's view", () => {
  it("is never kept, so the board's controls can't show it in another mode or state", () => {
    expect(withTidyView(sketch, { mode: "mobile-light", modes: ["desktop-dark"], allStates: true })).toBe(sketch)
    expect(withTidyView({ ...sketch, view: { allStates: true } })).toEqual(sketch)
  })
})

describe("a screen's view", () => {
  it("keeps its modes but names no state, since only a component has states (PAR-1002)", () => {
    const screen: ContainerSpec = { ...card, kind: "screen", params: undefined, view: undefined }
    expect(withTidyView(screen, { modes: ["desktop-dark"], state: "empty", allStates: true }).view).toEqual({
      modes: ["desktop-dark"]
    })
    expect(withTidyView(screen, { state: "empty" }).view).toBeUndefined()
    expect(withTidyView(pricing, { state: "empty", allStates: true }).view).toEqual({ state: "empty", allStates: true })
  })
})
