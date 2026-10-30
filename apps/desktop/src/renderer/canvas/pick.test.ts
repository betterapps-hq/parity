import { type ContainerSpec, defaultModeSettings } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { DesignStore } from "../design-store.ts"
import {
  boardClick,
  boxSelection,
  enterTarget,
  hoverTarget,
  pickDeeper,
  pickLayer,
  pressTarget,
  touchedBy,
  type Under
} from "./pick.ts"

// The example's dashboard, as the canvas finds it under the pointer: App, then Main, Content and Stats, then the
// Revenue card, an instance of the stat card, whose header holds a label and a value.
const onValue: Under = {
  chain: ["app", "main", "content", "stats", "revenue"],
  path: ["app", "main", "content", "stats", "revenue", "revenue/header", "revenue/value"]
}
const onLabel: Under = {
  chain: ["app", "main", "content", "stats", "revenue"],
  path: ["app", "main", "content", "stats", "revenue", "revenue/header", "revenue/label"]
}
const onUsers: Under = {
  chain: ["app", "main", "content", "stats", "users"],
  path: ["app", "main", "content", "stats", "users"]
}
const onHeader: Under = { chain: ["app", "main", "content", "header"], path: ["app", "main", "content", "header"] }
const onSidebar: Under = { chain: ["app", "sidebar"], path: ["app", "sidebar"] }
const onBackground: Under = { chain: ["app"], path: ["app"] }
const nothing = { deep: false, shift: false }

describe("a click inside a board", () => {
  it("selects the top-level layer under the pointer, with nothing in the design selected", () => {
    expect(pickLayer(onValue, undefined, false)).toBe("main")
    expect(pressTarget(onValue, undefined, [], nothing)).toEqual({ kind: "select", node: "main" })
    expect(pressTarget(onSidebar, undefined, [], nothing)).toEqual({ kind: "select", node: "sidebar" })
  })

  it("leaves the frame's background to the board: a click there selects it, and a drag draws a box", () => {
    expect(pickLayer(onBackground, undefined, false)).toBeUndefined()
    expect(pressTarget(onBackground, undefined, [], nothing)).toEqual({ kind: "background" })
    expect(pressTarget(onBackground, { node: "main", parent: "app" }, ["main"], nothing)).toEqual({
      kind: "background"
    })
  })

  it("picks among the selected layer's siblings under the pointer", () => {
    expect(pressTarget(onValue, { node: "header", parent: "content" }, ["header"], nothing)).toEqual({
      kind: "select",
      node: "stats"
    })
    expect(pressTarget(onUsers, { node: "revenue", parent: "stats" }, ["revenue"], nothing)).toEqual({
      kind: "select",
      node: "users"
    })
  })

  it("keeps the selected layer when the pointer is inside it, so a drag moves the whole selection", () => {
    expect(pressTarget(onValue, { node: "stats", parent: "content" }, ["header", "stats"], nothing)).toEqual({
      kind: "keep",
      node: "stats"
    })
  })

  it("goes back to the top level outside the selected layer's group", () => {
    expect(pickLayer(onSidebar, { node: "revenue", parent: "stats" }, false)).toBe("sidebar")
    expect(pickLayer(onHeader, { node: "revenue", parent: "stats" }, false)).toBe("main")
  })

  it("picks among what's drawn beside a selected layer inside an instance", () => {
    expect(pickLayer(onLabel, { node: "revenue/value", parent: "revenue/header" }, false)).toBe("revenue/label")
  })

  it("goes to the deepest layer with Ctrl, inside instances too, and never the background", () => {
    expect(pressTarget(onValue, undefined, [], { deep: true, shift: false })).toEqual({
      kind: "select",
      node: "revenue/value"
    })
    expect(pickLayer(onUsers, { node: "header", parent: "content" }, true)).toBe("users")
    expect(pressTarget(onBackground, undefined, [], { deep: true, shift: false })).toEqual({ kind: "background" })
  })

  it("adds the layer to the selection or takes it out with Shift", () => {
    expect(pressTarget(onValue, undefined, [], { deep: false, shift: true })).toEqual({ kind: "toggle", node: "main" })
    expect(
      pressTarget(onUsers, { node: "revenue", parent: "stats" }, ["revenue"], { deep: false, shift: true })
    ).toEqual({ kind: "toggle", node: "users" })
  })
})

describe("a double-click", () => {
  it("goes one level deeper than the selection, under the pointer", () => {
    expect(pickDeeper(onValue, undefined)).toBe("main")
    expect(pickDeeper(onValue, { node: "main", parent: "app" })).toBe("content")
    expect(pickDeeper(onValue, { node: "stats", parent: "content" })).toBe("revenue")
  })

  it("goes into an instance's layers as the component draws them", () => {
    expect(pickDeeper(onValue, { node: "revenue", parent: "stats" })).toBe("revenue/header")
    expect(pickDeeper(onValue, { node: "revenue/header", parent: "revenue" })).toBe("revenue/value")
  })

  it("has nothing deeper on the deepest layer, and picks a sibling when the selection isn't under the pointer", () => {
    expect(pickDeeper(onValue, { node: "revenue/value", parent: "revenue/header" })).toBeUndefined()
    expect(pickDeeper(onUsers, { node: "revenue", parent: "stats" })).toBe("users")
  })

  it("reaches the dashboard's stat card in three double-clicks, where it took four, or in one Ctrl-click", () => {
    // Each double-click's first click selects what a click would, and the double-click goes one deeper.
    const doubleClick = (selected?: { node: string; parent: string | undefined }) => {
      const clicked = pickLayer(onValue, selected, false)!
      const parent = onValue.chain[onValue.chain.indexOf(clicked) - 1]
      return pickDeeper(onValue, { node: clicked, parent })!
    }
    const first = doubleClick()
    const second = doubleClick({ node: first, parent: "main" })
    const third = doubleClick({ node: second, parent: "content" })
    expect([first, second, third]).toEqual(["content", "stats", "revenue"])
    // Ctrl-clicking the card's edge, where none of its layers are, selects the card.
    const onEdge: Under = { chain: onValue.chain, path: onValue.chain }
    expect(pickLayer(onEdge, undefined, true)).toBe("revenue")
  })
})

describe("hovering", () => {
  it("outlines what a click would select, in a design that isn't selected too", () => {
    expect(hoverTarget(onValue, undefined, { deep: false, alt: false })).toBe("main")
    expect(hoverTarget(onUsers, { node: "revenue", parent: "stats" }, { deep: false, alt: false })).toBe("users")
    expect(hoverTarget(onValue, undefined, { deep: true, alt: false })).toBe("revenue/value")
  })

  it("outlines no layer over the frame's background, where a click selects the board", () => {
    expect(hoverTarget(onBackground, undefined, { deep: false, alt: false })).toBeUndefined()
    expect(hoverTarget(onBackground, undefined, { deep: true, alt: false })).toBeUndefined()
  })

  it("outlines the deepest layer with Alt, to measure to", () => {
    expect(hoverTarget(onValue, { node: "header", parent: "content" }, { deep: false, alt: true })).toBe(
      "revenue/value"
    )
  })
})

describe("a box drawn from a frame's background", () => {
  const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom })
  const layers = [
    { id: "header", box: box(0, 0, 400, 40) },
    { id: "stats", box: box(0, 60, 400, 160) },
    { id: "chart", box: box(0, 180, 400, 400) },
    { id: "hidden", box: box(0, 0, 0, 0) }
  ]

  it("touches the layers it overlaps, edges included, and none that aren't drawn", () => {
    expect(touchedBy(box(10, 30, 50, 70), layers)).toEqual(["header", "stats"])
    expect(touchedBy(box(10, 160, 50, 170), layers)).toEqual(["stats"])
    expect(touchedBy(box(410, 0, 500, 500), layers)).toEqual([])
    expect(touchedBy(box(-10, -10, 5, 5), layers)).toEqual(["header"])
  })

  it("selects the layers it touches, in the frame it was drawn in", () => {
    expect(
      boxSelection({ design: "dash" }, "dash", { mode: "desktop", state: "default" }, ["header", "stats"], false)
    ).toEqual({ design: "dash", node: "stats", nodes: ["header", "stats"], mode: "desktop", state: "default" })
    expect(boxSelection({ design: "other", node: "x" }, "dash", { mode: "mobile" }, ["chart"], false)).toEqual({
      design: "dash",
      node: "chart",
      mode: "mobile"
    })
  })

  it("adds them to the design's selected layers with Shift, and nothing else's", () => {
    const before = { design: "dash", node: "chart", mode: "desktop", state: "loading" }
    expect(boxSelection(before, "dash", { mode: "mobile", state: "default" }, ["header", "chart"], true)).toEqual({
      design: "dash",
      node: "header",
      nodes: ["chart", "header"],
      mode: "desktop",
      state: "loading"
    })
    expect(boxSelection({ design: "other", node: "x" }, "dash", {}, ["header"], true)).toEqual({
      design: "dash",
      node: "header"
    })
  })

  it("selects nothing when it touches nothing, or with Shift keeps what was selected", () => {
    const before = { design: "dash", node: "chart" }
    expect(boxSelection(before, "dash", {}, [], false)).toEqual({})
    expect(boxSelection(before, "dash", {}, [], true)).toEqual(before)
    expect(boxSelection({ design: "pricing" }, "dash", {}, [], true)).toEqual({ design: "pricing" })
  })
})

describe("a click on a frame's background", () => {
  it("selects the board", () => {
    expect(boardClick({ design: "dash", node: "main" }, "dash", false)).toEqual({ design: "dash" })
  })

  it("adds the board to the selected designs with Shift, or takes it out", () => {
    expect(boardClick({ design: "pricing" }, "dash", true)).toEqual({ design: "dash", designs: ["pricing", "dash"] })
    expect(boardClick({ design: "dash", designs: ["pricing", "dash"] }, "dash", true)).toEqual({ design: "pricing" })
  })
})

describe("Enter", () => {
  const dashboard: ContainerSpec = {
    id: "dash",
    name: "Dashboard",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "app",
      children: [
        { type: "text", id: "greeting", text: "Good morning" },
        {
          type: "layout",
          id: "stats",
          children: [
            { type: "instance", id: "revenue", design: "stat" },
            { type: "instance", id: "users", design: "stat" }
          ]
        },
        { type: "component", id: "export", component: "ui/Button", props: { children: "Export" } },
        { type: "layout", id: "spacer", children: [] }
      ]
    },
    states: [
      { id: "default", name: "Default" },
      { id: "loading", name: "Loading" }
    ]
  }
  const stat: ContainerSpec = {
    id: "stat",
    name: "Stat card",
    kind: "component",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "card",
      children: [
        {
          type: "layout",
          id: "header",
          children: [
            { type: "text", id: "label", text: "Revenue" },
            { type: "text", id: "value", text: "$45,231" }
          ]
        },
        { type: "text", id: "note", text: "Up from last month" }
      ]
    },
    states: [{ id: "default", name: "Default" }]
  }
  const store = new DesignStore(
    [{ path: "app.par", document: { version: 3, containers: [dashboard, stat] } }],
    defaultModeSettings,
    "app.par",
    { saveDocument: async () => undefined, autosave: () => false }
  )
  const dash = "app.par#dash"

  it("selects every top-level layer of the selected design, or of a selected mode's frame", () => {
    expect(enterTarget(store, { design: dash })).toEqual({
      select: { design: dash, node: "spacer", nodes: ["greeting", "stats", "export", "spacer"] }
    })
    expect(enterTarget(store, { design: dash, mode: "mobile-light" })).toEqual({
      select: { design: dash, node: "spacer", nodes: ["greeting", "stats", "export", "spacer"], mode: "mobile-light" }
    })
  })

  it("selects every layer inside the selected layer, in the frame it was picked in", () => {
    expect(enterTarget(store, { design: dash, node: "stats", mode: "desktop-light", state: "loading" })).toEqual({
      select: { design: dash, node: "users", nodes: ["revenue", "users"], mode: "desktop-light", state: "loading" }
    })
  })

  it("selects an instance's layers, and the layers inside one of them, by path", () => {
    expect(enterTarget(store, { design: dash, node: "revenue" })).toEqual({
      select: { design: dash, node: "revenue/note", nodes: ["revenue/header", "revenue/note"] }
    })
    expect(enterTarget(store, { design: dash, node: "revenue/header" })).toEqual({
      select: { design: dash, node: "revenue/value", nodes: ["revenue/label", "revenue/value"] }
    })
  })

  it("selects the layers inside each of several selected layers", () => {
    expect(enterTarget(store, { design: dash, node: "users", nodes: ["revenue", "users"] })).toEqual({
      select: {
        design: dash,
        node: "users/note",
        nodes: ["revenue/header", "revenue/note", "users/header", "users/note"]
      }
    })
  })

  it("starts editing a text layer, or a component whose child is text, in the frame it was picked in", () => {
    expect(enterTarget(store, { design: dash, node: "greeting", mode: "desktop-light", state: "default" })).toEqual({
      edit: { design: dash, node: "greeting", mode: "desktop-light", state: "default" }
    })
    expect(enterTarget(store, { design: dash, node: "export" })).toEqual({ edit: { design: dash, node: "export" } })
    expect(enterTarget(store, { design: dash, node: "revenue/value" })).toEqual({
      edit: { design: dash, node: "revenue/value" }
    })
  })

  it("does nothing on a layer with nothing inside, or with nothing selected", () => {
    expect(enterTarget(store, { design: dash, node: "spacer" })).toBeUndefined()
    expect(enterTarget(store, {})).toBeUndefined()
  })
})
