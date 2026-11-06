import { type ContainerSpec, type DesignNode, locateNode } from "@parity-app/core"
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

function design(key: string, root: DesignNode): TreeDesign {
  const container: ContainerSpec = {
    id: key,
    name: key,
    position: { x: 0, y: 0 },
    root,
    states: [{ id: "default", name: "Default" }]
  }
  return { key, container }
}

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
    expect(outline(treeRows(designs, new Set()))).toEqual(["pricing 1/2", "about 2/2"])
  })

  it("shows the layers of open rows, with how many share their parent", () => {
    const rows = treeRows(designs, new Set(["pricing", id("page"), id("plans")]))
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
    expect(outline(treeRows(designs, new Set([id("page")])))).toEqual(["pricing 1/2", "about 2/2"])
  })
})

describe("searching", () => {
  it("finds layers by their label, ignoring case, with the rows above them open", () => {
    expect(outline(searchRows(designs, "PRICE", label))).toEqual([])
    expect(outline(searchRows(designs, "pro", label))).toEqual([
      "pricing (open) 1/1",
      "  page (open) 1/1",
      "    plans (open) 1/1",
      "      pro 1/1"
    ])
  })

  it("numbers the rows it finds among those it shows, and leaves a match's own layers closed", () => {
    expect(outline(searchRows(designs, "$", label))).toEqual([
      "pricing (open) 1/1",
      "  page (open) 1/1",
      "    plans (open) 1/1",
      "      basic (open) 1/2",
      "        $9 1/1",
      "      pro (open) 2/2",
      "        $29 1/1"
    ])
    expect(outline(searchRows(designs, "hero", label))).toEqual([
      "pricing (open) 1/1",
      "  page (open) 1/1",
      "    hero 1/1"
    ])
  })

  it("finds a design by its name, closed, beside the designs with layers that match", () => {
    expect(outline(searchRows(designs, "abo", label))).toEqual(["about 1/1"])
    expect(outline(searchRows(designs, "o", label)).filter((row) => !row.startsWith(" "))).toEqual([
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
    const revealed = revealRows(closedTree, revealIds(pricing, ["pro-price"]), false)
    expect(expandedRows(toggleRow(revealed, id("plans"))).has(id("plans"))).toBe(false)
    expect(toggleRow(closedTree, "pricing", false)).toBe(closedTree)
  })

  it("opens a whole branch at once, and closes it the same way", () => {
    const plans = locateNode(pricing.container.root, "plans")?.node
    expect(branchIds(pricing, plans)).toEqual([id("plans"), id("basic"), id("pro")])
    const all = branchIds(pricing)
    expect(all).toEqual(["pricing", id("page"), id("hero"), id("plans"), id("basic"), id("pro")])
    const opened = toggleRows(closedTree, all, true)
    expect(outline(treeRows(designs, expandedRows(opened)))).toHaveLength(10)
    expect(expandedRows(toggleRows(opened, all, false)).size).toBe(0)
  })

  it("finds the rows beside a row that can open, wherever it is among them", () => {
    const rows = treeRows(designs, new Set(["pricing", id("page"), id("plans")]))
    const at = (node: string) => rows.findIndex((row) => row.id === id(node))
    expect(siblingIds(rows, at("plans"))).toEqual([id("plans"), id("hero")])
    expect(siblingIds(rows, at("basic"))).toEqual([id("basic"), id("pro")])
    expect(siblingIds(rows, 0)).toEqual(["pricing", "about"])
  })

  it("reveals the design, its page and every layer above what's selected", () => {
    expect(revealIds(pricing, ["pro-price"])).toEqual(["pricing", id("page"), id("plans"), id("pro")])
    expect(revealIds(pricing, [])).toEqual(["pricing", id("page")])
    expect(revealIds(pricing, ["headline", "basic-price"])).toEqual([
      "pricing",
      id("page"),
      id("hero"),
      id("plans"),
      id("basic")
    ])
  })

  it("closes what an earlier selection opened once the selection moves elsewhere", () => {
    const first = revealRows(closedTree, revealIds(pricing, ["pro-price"]), false)
    const next = revealRows(first, revealIds(pricing, ["headline"]), false)
    expect([...expandedRows(next)]).toEqual(["pricing", id("page"), id("hero")])
  })

  it("keeps rows opened by hand open as the selection moves", () => {
    const opened = toggleRow(closedTree, "about")
    const first = revealRows(opened, revealIds(pricing, ["pro-price"]), false)
    const next = revealRows(first, revealIds(pricing, ["headline"]), false)
    expect(expandedRows(next).has("about")).toBe(true)
    expect(expandedRows(next).has(id("plans"))).toBe(false)
  })

  it("keeps what it opened while the selection moves within the tree, so no row moves under the pointer", () => {
    const first = revealRows(closedTree, revealIds(pricing, ["pro-price"]), false)
    const next = revealRows(first, revealIds(pricing, ["headline"]), true)
    expect([...expandedRows(next)]).toEqual(["pricing", id("page"), id("plans"), id("pro"), id("hero")])
  })

  it("gives back the same expansion when the selection needs nothing new", () => {
    const first = revealRows(closedTree, revealIds(pricing, ["pro-price"]), false)
    expect(revealRows(first, revealIds(pricing, ["pro"]), true)).toBe(first)
  })
})
