import { type ContainerSpec, type DesignNode, defaultModeSettings, type NodeStyle } from "@parity/core"
import { describe, expect, it } from "vite-plus/test"
import { DesignStore } from "../design-store.ts"
import { adjacentDesign, designOrder, inverseSelection, matchingLayers, matchingSelection } from "./select.ts"

const title: NodeStyle = { size: "lg", weight: 600 }
const text = (id: string, style?: DesignNode["style"], tag?: "p" | "h3"): DesignNode => ({
  type: "text",
  id,
  text: id,
  ...(style ? { style } : {}),
  ...(tag ? { tag } : {})
})

/** A list of three cards, each a title and a description, with a heading above them. */
function list(): ContainerSpec {
  const card = (n: number, titleStyle = title): DesignNode => ({
    type: "layout",
    id: `card-${n}`,
    style: { padding: 4, background: "card" },
    children: [text(`title-${n}`, titleStyle, "h3"), text(`about-${n}`, { size: "sm" })]
  })
  return {
    id: "list",
    name: "List",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "root",
      children: [
        text("heading", { size: "2xl" }, "h3"),
        card(1),
        // Placed differently, it still matches.
        card(2, { ...title, width: "fill" }),
        card(3),
        { type: "instance", id: "stat-a", design: "stat", args: { label: "Users" } },
        { type: "instance", id: "stat-b", design: "stat", args: { label: "Revenue" } },
        { type: "instance", id: "chart", design: "chart" },
        { type: "component", id: "save", component: "ui/Button", props: { variant: "default" } },
        { type: "component", id: "cancel", component: "ui/Button", props: { variant: "outline" } }
      ]
    },
    states: [
      { id: "default", name: "Default" },
      { id: "bold", name: "Bold", overrides: { "title-3": { style: { weight: 800 } } } }
    ]
  }
}

function design(id: string, kind?: "component" | "screen"): ContainerSpec {
  return {
    id,
    name: id,
    position: { x: 0, y: 0 },
    ...(kind ? { kind } : {}),
    root: { type: "layout", id: "root", children: [text("a"), text("b"), text("c")] },
    states: [{ id: "default", name: "Default" }]
  }
}

function store(): DesignStore {
  return new DesignStore(
    [
      {
        path: "app.par",
        document: {
          version: 3,
          containers: [design("home", "screen"), design("button", "component"), list(), design("card", "component")]
        }
      }
    ],
    defaultModeSettings,
    "app.par",
    { saveDocument: async () => undefined, autosave: () => false }
  )
}

describe("select inverse", () => {
  it("selects the other layers beside the selected ones", () => {
    const selected = inverseSelection(store(), { design: "app.par#home", node: "a", state: "default" })
    expect(selected).toEqual({ design: "app.par#home", node: "c", nodes: ["b", "c"], state: "default" })
    expect(inverseSelection(store(), { design: "app.par#home", node: "c", nodes: ["a", "c"] })).toEqual({
      design: "app.par#home",
      node: "b"
    })
  })

  it("selects nothing when every layer beside them was selected", () => {
    expect(inverseSelection(store(), { design: "app.par#home", node: "c", nodes: ["a", "b", "c"] })).toEqual({})
  })

  it("selects the other designs, or every design when nothing is selected", () => {
    expect(inverseSelection(store(), { design: "app.par#home" })).toEqual({
      design: "app.par#card",
      designs: ["app.par#button", "app.par#list", "app.par#card"]
    })
    expect(inverseSelection(store(), { design: "app.par#list", mode: "desktop" }).designs).toEqual([
      "app.par#home",
      "app.par#button",
      "app.par#card"
    ])
    expect(inverseSelection(store(), {}).designs).toHaveLength(4)
  })

  it("leaves layers inside an instance as they are, as Select all does", () => {
    const current = { design: "app.par#list", node: "stat-a/value" }
    expect(inverseSelection(store(), current)).toBe(current)
  })
})

describe("select matching layers", () => {
  const base = list().states[0]!

  it("matches a card's title to the other cards' titles, however they're placed", () => {
    expect(matchingLayers(list(), ["title-1"], base)).toEqual(["title-1", "title-2", "title-3"])
  })

  it("matches the cards themselves, whatever's inside them", () => {
    expect(matchingLayers(list(), ["card-2"], base)).toEqual(["card-1", "card-2", "card-3"])
  })

  it("leaves out text of another style or tag", () => {
    expect(matchingLayers(list(), ["heading"], base)).toEqual(["heading"])
    expect(matchingLayers(list(), ["about-1"], base)).toEqual(["about-1", "about-2", "about-3"])
  })

  it("matches layers as the state being edited shows them", () => {
    const bold = list().states[1]!
    expect(matchingLayers(list(), ["title-1"], bold)).toEqual(["title-1", "title-2"])
  })

  it("matches instances of the same component, whatever their values, and components whatever their props", () => {
    expect(matchingLayers(list(), ["stat-b"], base)).toEqual(["stat-a", "stat-b"])
    expect(matchingLayers(list(), ["save"], base)).toEqual(["save", "cancel"])
  })

  it("matches each of several selected layers", () => {
    expect(matchingLayers(list(), ["heading", "stat-a"], base)).toEqual(["heading", "stat-a", "stat-b"])
  })

  it("keeps the layer picked last as the one shown, in the frame it was picked in", () => {
    expect(matchingSelection(store(), { design: "app.par#list", node: "title-2", mode: "desktop" })).toEqual({
      design: "app.par#list",
      node: "title-2",
      nodes: ["title-1", "title-3", "title-2"],
      mode: "desktop"
    })
  })

  it("matches designs of the same kind", () => {
    expect(matchingSelection(store(), { design: "app.par#button" })).toEqual({
      design: "app.par#button",
      designs: ["app.par#card", "app.par#button"]
    })
    expect(matchingSelection(store(), { design: "app.par#home" })?.designs).toEqual(["app.par#list", "app.par#home"])
    expect(matchingSelection(store(), {})).toBeUndefined()
  })
})

describe("next and previous design", () => {
  const entries = store().getEntries()

  it("goes in the Layers panel's order, components first, round from the last to the first", () => {
    expect(designOrder(entries).map((entry) => entry.container.id)).toEqual(["button", "card", "home", "list"])
    expect(adjacentDesign(entries, { design: "app.par#card" }, 1)).toBe("app.par#home")
    expect(adjacentDesign(entries, { design: "app.par#list" }, 1)).toBe("app.par#button")
    expect(adjacentDesign(entries, { design: "app.par#button" }, -1)).toBe("app.par#list")
  })

  it("goes on from the design a selected layer is in", () => {
    expect(adjacentDesign(entries, { design: "app.par#home", node: "a" }, 1)).toBe("app.par#list")
  })

  it("starts at the first, or with Shift the last, when no design is selected", () => {
    expect(adjacentDesign(entries, {}, 1)).toBe("app.par#button")
    expect(adjacentDesign(entries, { note: "app.par#note" }, -1)).toBe("app.par#list")
    expect(adjacentDesign([], {}, 1)).toBeUndefined()
  })
})
