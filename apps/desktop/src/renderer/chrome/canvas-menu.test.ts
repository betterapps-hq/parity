import type { ContainerSpec, DesignNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import type { ContainerEntry } from "../design-store.ts"
import { designsSelection, layersSelection, type Selection } from "../selection.ts"
import { canvasMenu, type MenuEntry, type MenuTarget, rightClickSelection } from "./canvas-menu.ts"
import { keymap } from "./keymap.ts"

const text = (id: string, extra: { name?: string; hidden?: boolean } = {}): DesignNode => ({
  type: "text",
  id,
  text: id,
  ...extra
})

/** The example's Dashboard, cut down: a header, a row of two stat cards (instances) and a chart. */
const dashboard: ContainerSpec = {
  id: "dashboard",
  name: "Dashboard",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "root",
    children: [
      { type: "layout", id: "header", name: "Header", children: [text("title"), text("subtitle", { hidden: true })] },
      {
        type: "layout",
        id: "stats",
        name: "Stats",
        style: { direction: "row" },
        children: [
          { type: "instance", id: "users", design: "stat-card", args: { label: "Users" } },
          { type: "instance", id: "revenue", name: "Revenue", design: "stat-card" }
        ]
      },
      { type: "component", id: "chart", component: "ui/Chart" }
    ]
  },
  states: [
    { id: "default", name: "Default" },
    { id: "loading", name: "Loading", overrides: { title: { hidden: true } } }
  ]
}

/** The component the stat cards are instances of. */
const statCard: ContainerSpec = {
  id: "stat-card",
  name: "Stat card",
  kind: "component",
  position: { x: 2000, y: 0 },
  root: { type: "layout", id: "card", children: [text("label"), text("value", { name: "Value" })] },
  states: [{ id: "default", name: "Default" }]
}

const entries: ContainerEntry[] = [
  { key: "app.par#dashboard", path: "app.par", container: dashboard },
  { key: "app.par#stat-card", path: "app.par", container: statCard }
]
const design = "app.par#dashboard"
const component = "app.par#stat-card"

/** The pointer over the Users card's value, in the dashboard's desktop frame. */
const overUsers: MenuTarget = {
  design,
  path: ["root", "stats", "users", "users/value"],
  mode: "desktop",
  state: "default"
}
const overTitle: MenuTarget = { design, path: ["root", "header", "title"], mode: "desktop", state: "default" }

/** Each entry as a line: an item's action and whether it's available, a line between sections, the submenu. */
function outline(entries: MenuEntry[]): string[] {
  return entries.map((entry) => {
    if (entry.kind === "separator") return "---"
    return entry.kind === "select-layer"
      ? `${entry.label} >`
      : `${entry.action}${entry.enabled ? "" : " (unavailable)"}`
  })
}

function labelOf(entries: MenuEntry[], action: string): string | undefined {
  const found = entries.find((entry) => entry.kind === "item" && entry.action === action)
  return found?.kind === "item" ? found.label : undefined
}

describe("the canvas menu", () => {
  it("lists, for one layer, Figma's items in Figma's order, each with the keymap's keys", () => {
    const menu = canvasMenu(overTitle, layersSelection(design, ["title"]), entries)
    expect(outline(menu)).toEqual([
      "Select layer >",
      "---",
      "copy",
      "pasteHere",
      "pasteOver",
      "pasteReplace",
      "duplicate",
      "---",
      "bringToFront",
      "bringForward",
      "sendBackward",
      "sendToBack",
      "---",
      "wrap",
      "makeComponent",
      "---",
      "hide"
    ])
    const items = menu.flatMap((entry) => (entry.kind === "item" ? [entry] : []))
    expect(items.map((entry) => entry.keys)).toEqual(
      items.map((entry) => (entry.action === "pasteHere" ? undefined : keymap[entry.action].keys[0]))
    )
    expect(labelOf(menu, "copy")).toBe(keymap.copy.label)
    expect(labelOf(menu, "pasteHere")).toBe("Paste here")
    expect(labelOf(menu, "hide")).toBe("Hide")
  })

  it("adds Go to the main component, named after it, for an instance", () => {
    const menu = canvasMenu(overUsers, layersSelection(design, ["users"]), entries)
    expect(outline(menu).slice(13, 16)).toEqual(["wrap", "makeComponent", "goToMain"])
    expect(labelOf(menu, "goToMain")).toBe("Go to Stat card")
  })

  it("keeps the order and making a component to one layer, with several selected", () => {
    const menu = canvasMenu(overTitle, layersSelection(design, ["title", "chart"]), entries)
    expect(outline(menu)).toEqual([
      "Select layer >",
      "---",
      "copy",
      "pasteHere",
      "pasteOver",
      "pasteReplace",
      "duplicate",
      "---",
      "bringToFront (unavailable)",
      "bringForward (unavailable)",
      "sendBackward (unavailable)",
      "sendToBack (unavailable)",
      "---",
      "wrap",
      "makeComponent (unavailable)",
      "---",
      "hide"
    ])
  })

  it("says Show when every selected layer is hidden in the state being edited", () => {
    expect(labelOf(canvasMenu(overTitle, layersSelection(design, ["subtitle"]), entries), "hide")).toBe("Show")
    expect(labelOf(canvasMenu(overTitle, layersSelection(design, ["subtitle", "title"]), entries), "hide")).toBe("Hide")
    const loading = layersSelection(design, ["subtitle", "title"], { mode: "desktop", state: "loading" })
    expect(labelOf(canvasMenu(overTitle, loading, entries), "hide")).toBe("Show")
  })

  it("leaves what acts on layers out for a design, and offers to make it a component", () => {
    const menu = canvasMenu(overTitle, { design }, entries)
    expect(outline(menu)).toEqual([
      "Select layer >",
      "---",
      "copy",
      "pasteHere",
      "pasteOver",
      "duplicate",
      "---",
      "makeComponent"
    ])
    expect(labelOf(menu, "makeComponent")).toBe("Make it a component")
    const card = canvasMenu({ design: component, path: ["card"] }, { design: component }, entries)
    expect(labelOf(card, "makeComponent")).toBe("Make it a screen")
  })

  it("makes no component of several designs", () => {
    const menu = canvasMenu(overTitle, designsSelection([component, design]), entries)
    expect(outline(menu).slice(2)).toEqual([
      "copy",
      "pasteHere",
      "pasteOver",
      "duplicate",
      "---",
      "makeComponent (unavailable)"
    ])
    expect(labelOf(menu, "makeComponent")).toBe(keymap.makeComponent.label)
  })

  it("leaves a layer inside an instance only what can act on it", () => {
    const menu = canvasMenu(overUsers, layersSelection(design, ["users/value"]), entries)
    expect(outline(menu).slice(2)).toEqual([
      "copy (unavailable)",
      "pasteHere",
      "pasteOver",
      "pasteReplace",
      "duplicate (unavailable)",
      "---",
      "bringToFront (unavailable)",
      "bringForward (unavailable)",
      "sendBackward (unavailable)",
      "sendToBack (unavailable)",
      "---",
      "wrap (unavailable)",
      "makeComponent (unavailable)",
      "---",
      "hide (unavailable)"
    ])
  })

  it("offers Paste here, Select all and Zoom to fit on the canvas around designs", () => {
    const menu = canvasMenu(undefined, layersSelection(design, ["title"]), entries)
    expect(outline(menu)).toEqual(["pasteHere", "---", "selectAll", "zoomToFit"])
    expect(menu.flatMap((entry) => (entry.kind === "item" ? [entry.keys] : []))).toEqual([
      undefined,
      keymap.selectAll.keys[0],
      keymap.zoomToFit.keys[0]
    ])
  })
})

describe("select layer", () => {
  const choices = (target: MenuTarget, selection: Selection) => {
    const entry = canvasMenu(target, selection, entries)[0]
    return entry?.kind === "select-layer" ? entry.choices : []
  }

  it("lists every layer under the pointer, outermost first, the design at the top, as Layers names them", () => {
    const list = choices(overUsers, layersSelection(design, ["users"]))
    expect(list.map((choice) => [choice.id, choice.label, choice.whole])).toEqual([
      ["root", "Dashboard", true],
      ["stats", "Stats", false],
      // An instance without a name of its own is named after its component, and the layers inside it are listed too.
      ["users", "Stat card", false],
      ["users/value", "Value", false]
    ])
    expect(list.map((choice) => choice.selected)).toEqual([false, false, true, false])
    expect(list[0]?.kind).toBeUndefined()
    expect(list[2]?.layer?.type).toBe("instance")
  })

  it("marks the design when it's selected on its own, and gives a component's its kind", () => {
    expect(choices(overTitle, { design }).map((choice) => choice.selected)).toEqual([true, false, false])
    expect(choices({ design: component, path: ["card"] }, {})[0]).toMatchObject({
      label: "Stat card",
      kind: "component"
    })
  })

  it("lists the design alone around its frames, and nothing for a design that's gone", () => {
    expect(choices({ design, path: [] }, { design }).map((choice) => choice.label)).toEqual(["Dashboard"])
    expect(choices({ design: "app.par#gone", path: ["root"] }, {})).toEqual([])
  })
})

describe("what a right-click selects", () => {
  it("selects what a click would, in the frame under the pointer", () => {
    expect(rightClickSelection({}, overTitle, "header", "root")).toEqual({
      design,
      node: "header",
      mode: "desktop",
      state: "default"
    })
    // In another design than the selected one.
    expect(rightClickSelection({ design: component }, overTitle, "header", "root").node).toBe("header")
  })

  it("selects the design on a frame's background, or around its frames", () => {
    expect(
      rightClickSelection(layersSelection(design, ["title"]), { design, path: ["root"] }, undefined, "root")
    ).toEqual({ design })
    expect(rightClickSelection({}, { design, path: [] }, undefined, undefined)).toEqual({ design })
    expect(rightClickSelection({}, overTitle, "root", "root")).toEqual({ design })
  })

  it("keeps the selection when the pointer is over a selected layer, or one inside it", () => {
    const header = layersSelection(design, ["header"])
    expect(rightClickSelection(header, overTitle, "title", "root")).toBe(header)
    const several = layersSelection(design, ["chart", "title"])
    expect(rightClickSelection(several, overTitle, "header", "root")).toBe(several)
  })

  it("selects another layer when the pointer is outside the selected ones", () => {
    const chart = layersSelection(design, ["chart"])
    expect(rightClickSelection(chart, overTitle, "header", "root").node).toBe("header")
    // The same id in another design isn't the selected layer.
    const elsewhere = layersSelection(component, ["title"])
    expect(rightClickSelection(elsewhere, overTitle, "header", "root").node).toBe("header")
  })

  it("keeps a selected design, alone or with others, when the pointer is anywhere in it", () => {
    expect(rightClickSelection({ design }, overTitle, "header", "root")).toEqual({ design })
    const both = designsSelection([design, component])
    expect(rightClickSelection(both, overUsers, "stats", "root")).toBe(both)
    expect(rightClickSelection(both, { design, path: [] }, undefined, undefined)).toBe(both)
  })

  it("selects inside a design whose mode column is selected, as a click would", () => {
    const column = { design, mode: "mobile" }
    expect(rightClickSelection(column, overTitle, "header", "root").node).toBe("header")
  })
})
