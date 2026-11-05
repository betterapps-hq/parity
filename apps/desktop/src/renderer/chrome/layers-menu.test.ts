import type { ContainerSpec, DesignNode } from "@parity-app/core"
import { designsSelection, layersSelection, type Selection } from "@parity-app/editor"
import { describe, expect, it } from "vite-plus/test"
import type { ContainerEntry } from "../design-store.ts"
import type { MenuEntry } from "./canvas-menu.ts"
import { keymap } from "./keymap.ts"
import { layersMenu, type LayersRow, rowSelection } from "./layers-menu.ts"

const text = (id: string, extra: { hidden?: boolean } = {}): DesignNode => ({ type: "text", id, text: id, ...extra })

/** A dashboard cut down: a header with a title and a hidden subtitle, and an instance of a stat card. */
const dashboard: ContainerSpec = {
  id: "dashboard",
  name: "Dashboard",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "root",
    children: [
      { type: "layout", id: "header", children: [text("title"), text("subtitle", { hidden: true })] },
      { type: "instance", id: "users", design: "stat-card" }
    ]
  },
  states: [
    { id: "default", name: "Default" },
    { id: "loading", name: "Loading", overrides: { title: { hidden: true } } }
  ],
  // The board shows Loading, so a row picked with no state of its own edits Loading.
  view: { state: "loading" }
}

const entries: ContainerEntry[] = [{ key: "app.par#dashboard", path: "app.par", container: dashboard }]
const design = "app.par#dashboard"
const other = "app.par#stat-card"

/** Each entry as a line: an item's action and whether it's available, and a line between groups. */
function outline(menu: MenuEntry[]): string[] {
  return menu.map((entry) => {
    if (entry.kind !== "item") return "---"
    return `${entry.action}${entry.enabled ? "" : " (unavailable)"}`
  })
}

function labelOf(menu: MenuEntry[], action: string): string | undefined {
  const found = menu.find((entry) => entry.kind === "item" && entry.action === action)
  return found?.kind === "item" ? found.label : undefined
}

/** The menu a right-click on `row` opens, with `current` selected before it. */
function rightClick(row: LayersRow, current: Selection = {}): MenuEntry[] {
  return layersMenu(row, rowSelection(current, row), entries)
}

describe("the Layers row menu", () => {
  it("lists Rename, Duplicate, Hide and Delete for a layer, with the keymap's labels and keys", () => {
    const menu = rightClick({ design, node: "subtitle" })
    expect(outline(menu)).toEqual(["rename", "duplicate", "---", "hide", "---", "delete"])
    const items = menu.flatMap((entry) => (entry.kind === "item" ? [entry] : []))
    expect(items.map((entry) => entry.keys)).toEqual(
      items.map((entry) => (entry.action === "pasteHere" ? undefined : keymap[entry.action].keys[0]))
    )
    expect(items.map((entry) => entry.label)).toEqual([
      keymap.rename.label,
      keymap.duplicate.label,
      "Show in Loading",
      keymap.delete.label
    ])
  })

  it("lists Rename, Duplicate and Delete for a design", () => {
    const menu = rightClick({ design })
    expect(outline(menu)).toEqual(["rename", "duplicate", "---", "delete"])
  })

  it("can't duplicate, hide or delete the design's root", () => {
    expect(outline(rightClick({ design, node: "root" }))).toEqual([
      "rename",
      "duplicate (unavailable)",
      "---",
      "hide (unavailable)",
      "---",
      "delete (unavailable)"
    ])
  })

  it("acts on every selected layer when the row is one of them", () => {
    const both = layersSelection(design, ["title", "subtitle"], { state: "default" })
    // The title shows in Default, so the two aren't all hidden.
    expect(labelOf(rightClick({ design, node: "subtitle" }, both), "hide")).toBe("Hide in Default")
  })

  it("hides in the state the selection was picked in, as the Hide command does (PAR-586)", () => {
    // The title, picked in Default's frame while the board shows Loading: Hide lands in Default, where it shows.
    const picked = layersSelection(design, ["title"], { mode: "desktop", state: "default" })
    expect(labelOf(rightClick({ design, node: "title" }, picked), "hide")).toBe("Hide in Default")
    // Selected from its row, with no state picked, it's the state the board shows, which hides it.
    expect(labelOf(rightClick({ design, node: "title" }), "hide")).toBe("Show in Loading")
  })
})

describe("what a right-click on a row selects", () => {
  it("keeps the selection for a row inside it", () => {
    const several = layersSelection(design, ["title", "subtitle"], { state: "default" })
    expect(rowSelection(several, { design, node: "title" })).toBe(several)
    const designs = designsSelection([design, other])
    expect(rowSelection(designs, { design })).toBe(designs)
  })

  it("selects the row as a click would, outside the selection", () => {
    expect(rowSelection(layersSelection(design, ["title"]), { design, node: "header" })).toEqual({
      design,
      node: "header"
    })
    // A design's row, with one of its layers selected, selects the design.
    expect(rowSelection(layersSelection(design, ["title"]), { design })).toEqual({ design })
    // The same layer id in another design isn't the selected one.
    expect(rowSelection(layersSelection(other, ["title"]), { design, node: "title" })).toEqual({
      design,
      node: "title"
    })
  })
})
