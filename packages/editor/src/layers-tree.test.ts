import type { ComponentLibrary, ContainerSpec, DesignNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import {
  branchIds,
  closedTree,
  expandedRows,
  layerRowId,
  revealIds,
  revealRows,
  searchRows,
  siblingIds,
  toggleRow,
  toggleRows,
  type TreeDesign,
  type TreeRow,
  treeRows
} from "./layers-tree.ts"

const text = (id: string, value: string): DesignNode => ({ type: "text", id, text: value })
const layout = (id: string, children: DesignNode[]): DesignNode => ({ type: "layout", id, name: id, children })

function design(key: string, root: DesignNode, more: Partial<ContainerSpec> = {}): TreeDesign {
  const container: ContainerSpec = {
    id: key,
    name: key,
    position: { x: 0, y: 0 },
    root,
    states: [{ id: "default", name: "Default" }],
    ...more
  }
  return { key, container }
}

/** No components, for designs without instances. */
const none: ComponentLibrary = new Map()

// Pricing's page holds a hero and a plans row of two cards; About's page holds one text.
const pricing = design(
  "pricing",
  layout("page", [
    layout("hero", [text("headline", "Plans for every team")]),
    layout("plans", [layout("basic", [text("basic-price", "$9")]), layout("pro", [text("pro-price", "$29")])])
  ])
)
const about = design("about", layout("main", [text("story", "Our story")]))
const designs = [pricing, about]

const id = (node: string) => layerRowId("pricing", node)

/** Each row as its depth and name, with where it is among the rows beside it, for reading at a glance. */
function outline(rows: TreeRow[]): string[] {
  return rows.map((row) => {
    const name = row.node ? (row.node.name ?? (row.node.type === "text" ? row.node.text : row.node.id)) : row.design.key
    return `${"  ".repeat(row.depth)}${name}${row.expanded ? " (open)" : ""} ${row.position}/${row.siblings}`
  })
}

const label = (target: TreeDesign, node?: DesignNode) => {
  if (!node) return target.container.name
  return node.name ?? (node.type === "text" ? node.text : node.id)
}

describe("the tree's rows", () => {
  it("lists only the designs while nothing is open, each numbered among them", () => {
    expect(outline(treeRows(designs, new Set(), none))).toEqual(["pricing 1/2", "about 2/2"])
  })

  it("shows the layers of open rows, with how many share their parent", () => {
    const rows = treeRows(designs, new Set(["pricing", id("page"), id("plans")]), none)
    expect(outline(rows)).toEqual([
      "pricing (open) 1/2",
      "  page (open) 1/1",
      "    hero 1/2",
      "    plans (open) 2/2",
      "      basic 1/2",
      "      pro 2/2",
      "about 2/2"
    ])
    expect(rows.find((row) => row.id === id("hero"))).toMatchObject({ hasChildren: true, expanded: false })
  })

  it("keeps a row closed whose design is closed, though it was opened before", () => {
    expect(outline(treeRows(designs, new Set([id("page")]), none))).toEqual(["pricing 1/2", "about 2/2"])
  })
})

describe("searching", () => {
  it("finds layers by their label, ignoring case, with the rows above them open", () => {
    expect(outline(searchRows(designs, "PRICE", label, none))).toEqual([])
    expect(outline(searchRows(designs, "pro", label, none))).toEqual([
      "pricing (open) 1/1",
      "  page (open) 1/1",
      "    plans (open) 1/1",
      "      pro 1/1"
    ])
  })

  it("numbers the rows it finds among those it shows, and leaves a match's own layers closed", () => {
    expect(outline(searchRows(designs, "$", label, none))).toEqual([
      "pricing (open) 1/1",
      "  page (open) 1/1",
      "    plans (open) 1/1",
      "      basic (open) 1/2",
      "        $9 1/1",
      "      pro (open) 2/2",
      "        $29 1/1"
    ])
    expect(outline(searchRows(designs, "hero", label, none))).toEqual([
      "pricing (open) 1/1",
      "  page (open) 1/1",
      "    hero 1/1"
    ])
  })

  it("finds a design by its name, closed, beside the designs with layers that match", () => {
    expect(outline(searchRows(designs, "abo", label, none))).toEqual(["about 1/1"])
    expect(outline(searchRows(designs, "o", label, none)).filter((row) => !row.startsWith(" "))).toEqual([
      "pricing (open) 1/2",
      "about (open) 2/2"
    ])
  })
})

describe("opening and closing rows", () => {
  it("opens and closes rows by hand, and closing one closes it however it was opened", () => {
    const opened = toggleRow(closedTree, "pricing")
    expect([...expandedRows(opened)]).toEqual(["pricing"])
    expect(toggleRow(opened, "pricing", true)).toBe(opened)
    const revealed = revealRows(closedTree, revealIds(pricing, ["pro-price"], none), false)
    expect(expandedRows(toggleRow(revealed, id("plans"))).has(id("plans"))).toBe(false)
    expect(toggleRow(closedTree, "pricing", false)).toBe(closedTree)
  })

  it("opens a whole branch at once, and closes it the same way", () => {
    const rows = treeRows(designs, new Set(["pricing", id("page")]), none)
    const plans = rows.find((row) => row.id === id("plans"))!
    expect(branchIds(plans, none)).toEqual([id("plans"), id("basic"), id("pro")])
    const all = branchIds(rows[0]!, none)
    expect(all).toEqual(["pricing", id("page"), id("hero"), id("plans"), id("basic"), id("pro")])
    const opened = toggleRows(closedTree, all, true)
    expect(outline(treeRows(designs, expandedRows(opened), none))).toHaveLength(10)
    expect(expandedRows(toggleRows(opened, all, false)).size).toBe(0)
  })

  it("finds the rows beside a row that can open, wherever it is among them", () => {
    const rows = treeRows(designs, new Set(["pricing", id("page"), id("plans")]), none)
    const at = (node: string) => rows.findIndex((row) => row.id === id(node))
    expect(siblingIds(rows, at("plans"))).toEqual([id("plans"), id("hero")])
    expect(siblingIds(rows, at("basic"))).toEqual([id("basic"), id("pro")])
    expect(siblingIds(rows, 0)).toEqual(["pricing", "about"])
  })

  it("reveals the design, its page and every layer above what's selected", () => {
    expect(revealIds(pricing, ["pro-price"], none)).toEqual(["pricing", id("page"), id("plans"), id("pro")])
    expect(revealIds(pricing, [], none)).toEqual(["pricing", id("page")])
    expect(revealIds(pricing, ["headline", "basic-price"], none)).toEqual([
      "pricing",
      id("page"),
      id("hero"),
      id("plans"),
      id("basic")
    ])
  })

  it("closes what an earlier selection opened once the selection moves elsewhere", () => {
    const first = revealRows(closedTree, revealIds(pricing, ["pro-price"], none), false)
    const next = revealRows(first, revealIds(pricing, ["headline"], none), false)
    expect([...expandedRows(next)]).toEqual(["pricing", id("page"), id("hero")])
  })

  it("keeps rows opened by hand open as the selection moves", () => {
    const opened = toggleRow(closedTree, "about")
    const first = revealRows(opened, revealIds(pricing, ["pro-price"], none), false)
    const next = revealRows(first, revealIds(pricing, ["headline"], none), false)
    expect(expandedRows(next).has("about")).toBe(true)
    expect(expandedRows(next).has(id("plans"))).toBe(false)
  })

  it("keeps what it opened while the selection moves within the tree, so no row moves under the pointer", () => {
    const first = revealRows(closedTree, revealIds(pricing, ["pro-price"], none), false)
    const next = revealRows(first, revealIds(pricing, ["headline"], none), true)
    expect([...expandedRows(next)]).toEqual(["pricing", id("page"), id("plans"), id("pro"), id("hero")])
  })

  it("gives back the same expansion when the selection needs nothing new", () => {
    const first = revealRows(closedTree, revealIds(pricing, ["pro-price"], none), false)
    expect(revealRows(first, revealIds(pricing, ["pro"], none), true)).toBe(first)
  })
})

// A card component holds a title and a badge, itself an instance of the badge component. The team screen places the
// card twice, the lead's copy with a title of its own, and an instance of a component that doesn't exist.
const badge = design("badge", layout("badge-root", [text("badge-label", "New")]))
const card = design(
  "card",
  layout("card-root", [
    { ...text("title", "Card"), bind: { text: "heading" } },
    { type: "instance", id: "badge", design: "badge" }
  ]),
  { kind: "component", params: { heading: { type: "text", default: "Card" } } }
)
const team = design(
  "team",
  layout("team-page", [
    { type: "instance", id: "lead", design: "card", overrides: { "badge/badge-label": { text: "Lead" } } },
    { type: "instance", id: "member", design: "card", args: { heading: "Member" } },
    { type: "instance", id: "lost", design: "gone" }
  ])
)
const library: ComponentLibrary = new Map([badge, card].map((entry) => [entry.container.id, entry.container]))
const inTeam = (path: string) => layerRowId("team", path)

describe("an instance's layers", () => {
  it("opens an instance to its component's layers, by their paths, into nested instances", () => {
    const open = new Set(["team", inTeam("team-page"), inTeam("lead"), inTeam("lead/badge")])
    const rows = treeRows([team], open, library)
    expect(outline(rows)).toEqual([
      "team (open) 1/1",
      "  team-page (open) 1/1",
      "    lead (open) 1/3",
      "      Card 1/2",
      "      badge (open) 2/2",
      "        New 1/1",
      "    member 2/3",
      "    lost 3/3"
    ])
    const inner = rows.find((row) => row.id === inTeam("lead/badge/badge-label"))
    expect(inner).toMatchObject({ path: "lead/badge/badge-label", within: ["card", "badge"] })
    expect(rows.find((row) => row.id === inTeam("lead"))).toMatchObject({ path: "lead", within: [] })
  })

  it("gives an instance of a missing component, or of one it's inside, no layers", () => {
    const looped = design("card", layout("card-root", [{ type: "instance", id: "again", design: "card" }]), {
      kind: "component"
    })
    const loops: ComponentLibrary = new Map([["card", looped.container]])
    const rows = treeRows([looped], new Set(["card", layerRowId("card", "card-root")]), loops)
    expect(rows.find((row) => row.path === "again")).toMatchObject({ hasChildren: true })
    const opened = treeRows(
      [looped],
      new Set(["card", layerRowId("card", "card-root"), layerRowId("card", "again")]),
      loops
    )
    expect(opened.find((row) => row.path === "again/again")).toMatchObject({ hasChildren: false })
    const page = treeRows([team], new Set(["team", inTeam("team-page")]), library)
    expect(page.find((row) => row.path === "lost")).toMatchObject({ hasChildren: false })
  })

  it("searches inside instances too", () => {
    expect(outline(searchRows([team], "new", label, library))).toEqual([
      "team (open) 1/1",
      "  team-page (open) 1/1",
      "    lead (open) 1/2",
      "      badge (open) 1/1",
      "        New 1/1",
      "    member (open) 2/2",
      "      badge (open) 1/1",
      "        New 1/1"
    ])
  })

  it("reveals the instances above a layer selected inside them, and leaves a selected instance closed", () => {
    expect(revealIds(team, ["lead/badge/badge-label"], library)).toEqual([
      "team",
      inTeam("team-page"),
      inTeam("lead"),
      inTeam("lead/badge")
    ])
    expect(revealIds(team, ["lead"], library)).toEqual(["team", inTeam("team-page")])
  })

  it("opens a whole branch through the instances in it", () => {
    const rows = treeRows([team], new Set(["team", inTeam("team-page")]), library)
    const lead = rows.find((row) => row.path === "lead")!
    expect(branchIds(lead, library)).toEqual([inTeam("lead"), inTeam("lead/badge")])
  })

  it("shows what an instance fills a slot with in place of the placeholder, as the design's own layers", () => {
    const panel = design(
      "panel",
      layout("panel-root", [
        { type: "layout", id: "panel-body", name: "panel-body", slot: "body", children: [text("placeholder", "Empty")] }
      ]),
      { kind: "component" }
    )
    const screen = design(
      "home",
      layout("home-page", [
        { type: "instance", id: "filled", design: "panel", slots: { body: [layout("note", [text("hi", "Hi")])] } },
        { type: "instance", id: "empty", design: "panel" }
      ])
    )
    const panels: ComponentLibrary = new Map([["panel", panel.container]])
    const at = (path: string) => layerRowId("home", path)
    const open = new Set([
      "home",
      at("home-page"),
      at("filled"),
      at("filled/panel-body"),
      at("empty"),
      at("empty/panel-body")
    ])
    expect(outline(treeRows([screen], open, panels))).toEqual([
      "home (open) 1/1",
      "  home-page (open) 1/1",
      "    filled (open) 1/2",
      "      panel-body (open) 1/1",
      "        note 1/1",
      "    empty (open) 2/2",
      "      panel-body (open) 1/1",
      "        Empty 1/1"
    ])
    const rows = treeRows([screen], open, panels)
    expect(rows.find((row) => row.path === "note")).toMatchObject({ within: [] })
    expect(revealIds(screen, ["hi"], panels)).toEqual([
      "home",
      at("home-page"),
      at("filled"),
      at("filled/panel-body"),
      at("note")
    ])
    expect(
      branchIds(
        rows.find((row) => row.path === "filled")!,
        panels
      )
    ).toEqual([at("filled"), at("filled/panel-body"), at("note")])
  })
})
