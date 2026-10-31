import { type ContainerSpec, type DesignNode, findNode, nodeIds, nodeInState } from "@parity-app/core"
import { effectiveFixture } from "@parity-app/core/fixtures"
import { describe, expect, it } from "vite-plus/test"
import { moveLayersAcross, moveLayersWithin } from "./move-layers.ts"

const text = (id: string): DesignNode => ({ type: "text", id, text: id })

/** The dashboard: four stat cards in a row, a panel with a title, and a card component with a title in its slot. */
function dashboard(): ContainerSpec {
  return {
    id: "dashboard",
    name: "Dashboard",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "root",
      children: [
        { type: "layout", id: "stats", children: ["revenue", "users", "issues", "uptime"].map(text) },
        { type: "layout", id: "panel", children: [text("panel-title")] },
        { type: "component", id: "card", component: "ui/Card", slots: { children: [text("card-title")] } }
      ]
    },
    states: [
      { id: "default", name: "Default" },
      { id: "loading", name: "Loading", overrides: { users: { text: "…" }, stats: { style: { gap: 1 } } } }
    ]
  }
}

/** A settings page with a form, into which layers are dragged from the dashboard. */
function settings(): ContainerSpec {
  return {
    id: "settings",
    name: "Settings",
    position: { x: 600, y: 0 },
    root: {
      type: "layout",
      id: "root",
      children: [{ type: "layout", id: "form", children: [text("name"), text("email")] }]
    },
    states: [{ id: "default", name: "Default" }]
  }
}

const [base, loading] = dashboard().states as [ContainerSpec["states"][0], ContainerSpec["states"][0]]

const childIds = (container: ContainerSpec, id: string) => {
  const node = findNode(container.root, id)
  if (node?.type === "layout") return node.children.map((child) => child.id)
  if (node?.type === "component") return node.slots?.children?.map((child) => child.id)
  return undefined
}

describe("moving layers within their design", () => {
  it("puts them before what was at the index, counted before the move", () => {
    const moved = moveLayersWithin(dashboard(), ["users"], { parent: "stats", index: 3 })
    expect(childIds(moved, "stats")).toEqual(["revenue", "issues", "users", "uptime"])
  })

  it("moves several together, in the order they're in", () => {
    const moved = moveLayersWithin(dashboard(), ["uptime", "revenue"], { parent: "panel", index: 0 })
    expect(childIds(moved, "panel")).toEqual(["revenue", "uptime", "panel-title"])
    expect(childIds(moved, "stats")).toEqual(["users", "issues"])
  })

  it("keeps their ids and every state's changes to them", () => {
    const moved = moveLayersWithin(dashboard(), ["users"], { parent: "panel", index: 1 })
    expect(childIds(moved, "panel")).toEqual(["panel-title", "users"])
    expect(moved.states).toEqual(dashboard().states)
    expect(nodeInState(findNode(moved.root, "users")!, loading)).toMatchObject({ text: "…" })
  })

  it("moves into a component's slot", () => {
    const moved = moveLayersWithin(dashboard(), ["issues"], { parent: "card", index: 1, slot: "children" })
    expect(childIds(moved, "card")).toEqual(["card-title", "issues"])
  })

  it("gives the same design back when a layer is dropped where it is", () => {
    const container = dashboard()
    expect(moveLayersWithin(container, ["users"], { parent: "stats", index: 1 })).toBe(container)
    // Just after itself is where it is too.
    expect(moveLayersWithin(container, ["users"], { parent: "stats", index: 2 })).toBe(container)
  })

  it("gives the same design back when the move can't be made", () => {
    const container = dashboard()
    // Into itself.
    expect(moveLayersWithin(container, ["stats"], { parent: "stats", index: 0 })).toBe(container)
    // Into a layout that isn't there.
    expect(moveLayersWithin(container, ["users"], { parent: "gone", index: 0 })).toBe(container)
  })
})

describe("moving layers into another design", () => {
  it("takes them out of their design and puts copies at the index, in order", () => {
    const moved = moveLayersAcross(dashboard(), settings(), ["users", "issues"], { parent: "form", index: 1 }, base)
    expect(childIds(moved.source, "stats")).toEqual(["revenue", "uptime"])
    expect(childIds(moved.destination, "form")).toEqual(["name", ...moved.copies, "email"])
    expect(moved.copies.map((id) => findNode(moved.destination.root, id))).toMatchObject([
      { text: "users" },
      { text: "issues" }
    ])
  })

  it("gives the copies ids that are new in the destination", () => {
    // A destination that already has a layer with the dragged layer's id.
    const destination: ContainerSpec = {
      ...settings(),
      root: { type: "layout", id: "root", children: [text("users"), { type: "layout", id: "form", children: [] }] }
    }
    const moved = moveLayersAcross(dashboard(), destination, ["users"], { parent: "form", index: 0 }, base)
    expect(moved.copies).toHaveLength(1)
    expect(nodeIds(destination.root).has(moved.copies[0]!)).toBe(false)
  })

  it("copies them as the state being edited shows them", () => {
    const moved = moveLayersAcross(dashboard(), settings(), ["stats"], { parent: "root", index: 1 }, loading)
    const copy = findNode(moved.destination.root, moved.copies[0]!)
    expect(copy).toMatchObject({ type: "layout", style: { gap: 1 } })
    expect(copy?.type === "layout" && copy.children[1]).toMatchObject({ text: "…" })
    // Everything inside gets a fresh id too.
    expect(copy?.type === "layout" && copy.children.map((child) => child.id)).not.toContain("users")
  })

  it("copies them as the board shows them, keeping only the bindings the destination has params for", () => {
    const source = effectiveFixture.designs.find((design) => design.id === "card")!
    const inline: ContainerSpec = { ...source, view: { variants: { layout: "inline" } } }
    const moved = moveLayersAcross(inline, settings(), ["copy"], { parent: "root", index: 0 }, base, "mobile")
    const copy = findNode(moved.destination.root, moved.copies[0]!)
    const [title, meta] = copy?.type === "layout" ? copy.children : []
    expect(title).toMatchObject({ text: "Card title" })
    expect(title).not.toHaveProperty("bind")
    // The meta is hidden on mobile.
    expect(meta).toMatchObject({ text: "Updated today", hidden: true })
    const titled = moveLayersAcross(
      inline,
      { ...settings(), params: { title: { type: "text" } } },
      ["title"],
      {
        parent: "root",
        index: 0
      },
      base
    )
    expect(findNode(titled.destination.root, titled.copies[0]!)).toMatchObject({ bind: { text: "title" } })
  })

  it("moves only the outermost of layers inside each other", () => {
    const moved = moveLayersAcross(dashboard(), settings(), ["stats", "users"], { parent: "form", index: 2 }, base)
    expect(moved.copies).toHaveLength(1)
    expect(childIds(moved.source, "root")).toEqual(["panel", "card"])
  })

  it("goes into a component's slot", () => {
    const moved = moveLayersAcross(
      settings(),
      dashboard(),
      ["email"],
      { parent: "card", index: 0, slot: "children" },
      base
    )
    expect(childIds(moved.destination, "card")).toEqual([...moved.copies, "card-title"])
    expect(childIds(moved.source, "form")).toEqual(["name"])
  })

  it("changes nothing when none of the layers is in the design", () => {
    const source = dashboard()
    const destination = settings()
    const moved = moveLayersAcross(source, destination, ["gone"], { parent: "form", index: 0 }, base)
    expect(moved).toEqual({ source, destination, copies: [] })
    expect(moved.source).toBe(source)
    expect(moved.destination).toBe(destination)
  })
})
