import type { ContainerSpec, DesignNode, NodesChange, NodeEvent, ProjectRoute } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { collectNodes, createNodeCollector, createNodeIndex } from "./node-index.ts"

const cardLayer: DesignNode = { type: "component", id: "card", component: "marketing/Card" }

const origin = { x: 0, y: 0 }

/** The pricing design with its title saying `text`, and the same card layer object each time. */
const titled = (text: string): ContainerSpec => ({
  id: "pricing",
  name: "Pricing",
  position: origin,
  root: { type: "layout", id: "root", children: [{ type: "text", id: "title", text }, cardLayer] }
})

const pricing = titled("Plans")

const route = (id: string, parent?: string): ProjectRoute => ({
  id,
  path: id,
  file: `src/routes${id}.tsx`,
  params: [],
  index: false,
  loads: false,
  guards: false,
  parent
})

const sources = {
  designs: [{ key: "app.par#pricing", container: pricing }],
  components: {
    owner: "react",
    sources: {
      Card: { path: "src/components/ui/card.tsx", export: "Card" },
      "marketing/Card": { path: "src/marketing/card.tsx", export: "Card" },
      "nova/Card": { path: "@kit/nova", export: "Card", library: "nova" }
    }
  },
  routes: { owner: "tanstack-router", routes: [route("__root__"), route("/settings", "__root__")] },
  screens: [
    {
      adapter: "storybook",
      ref: "src/stories/card.stories.tsx#Invite",
      group: "Card",
      component: "marketing/Card",
      screen: { ...pricing, id: "invite", name: "Invite" }
    }
  ]
}

const design = (key: string) => ({ owner: "design", type: "design", key })
const layer = (type: string, key: string) => ({ owner: "design", type, key: `app.par#pricing/${key}` })

describe("collectNodes", () => {
  it("gives every node one ref, owner first, so namesakes of any kind never share one", () => {
    const refs = collectNodes(sources).map((node) => node.ref)

    expect(refs).toEqual([
      design("app.par#pricing"),
      layer("layout", "root"),
      layer("text", "title"),
      layer("component", "card"),
      { owner: "react", type: "component", key: "Card" },
      { owner: "react", type: "component", key: "marketing/Card" },
      { owner: "react", type: "component", key: "nova/Card" },
      { owner: "tanstack-router", type: "route", key: "__root__" },
      { owner: "tanstack-router", type: "route", key: "/settings" },
      { owner: "storybook", type: "story", key: "src/stories/card.stories.tsx#Invite" }
    ])
  })
})

describe("createNodeIndex", () => {
  it("finds nodes by ref, by type from any owner or one, and by what they're inside", () => {
    const index = createNodeIndex(collectNodes(sources))

    expect(index.get(layer("text", "title"))?.name).toBe("title")
    expect(index.ofType("component").map((node) => `${node.ref.owner}:${node.ref.key}`)).toEqual([
      "design:app.par#pricing/card",
      "react:Card",
      "react:marketing/Card",
      "react:nova/Card"
    ])
    expect(index.ofType("component", { owner: "react" })).toHaveLength(3)
    expect(index.query({ owner: "design", within: design("app.par#pricing") }).map((node) => node.name)).toEqual([
      "root",
      "title",
      "card"
    ])
    expect(index.children(layer("layout", "root")).map((node) => node.name)).toEqual(["title", "card"])
    expect(index.parent({ owner: "tanstack-router", type: "route", key: "/settings" })?.ref.key).toBe("__root__")
  })

  it("tells a node's subscribers when its own fields change, and not when a node inside it does", () => {
    const index = createNodeIndex(collectNodes(sources))
    const told = { title: new Array<NodeEvent>(), root: new Array<NodeEvent>() }
    index.subscribe(layer("text", "title"), (event) => told.title.push(event))
    index.subscribe(layer("layout", "root"), (event) => told.root.push(event))

    const retitled: ContainerSpec = {
      ...pricing,
      root: {
        type: "layout",
        id: "root",
        children: [
          { type: "text", id: "title", text: "Pricing plans" },
          { type: "component", id: "card", component: "marketing/Card" }
        ]
      }
    }

    index.set(collectNodes({ ...sources, designs: [{ key: "app.par#pricing", container: retitled }] }))

    expect(told.title.map((event) => (event.kind === "changed" ? event.fields : event.kind))).toEqual([["text"]])
    expect(told.root).toEqual([])
  })

  it("tells watches what was added and removed among the nodes they're about", () => {
    const index = createNodeIndex(collectNodes(sources))
    const changes: NodesChange[] = []
    index.watch({ type: "route" }, (change) => changes.push(change))

    index.set(
      collectNodes({
        ...sources,
        routes: { owner: "tanstack-router", routes: [route("__root__"), route("/billing", "__root__")] }
      })
    )

    expect(changes).toHaveLength(1)
    expect(changes[0]?.added.map((node) => node.ref.key)).toEqual(["/billing"])
    expect(changes[0]?.removed.map((ref) => ref.key)).toEqual(["/settings"])
  })

  it("moves a node's subscriptions to its new key when its owner renames it", () => {
    const before = { owner: "react", type: "element", key: "marketing/Card>div.0" }
    const after = { owner: "react", type: "element", key: "marketing/Card>div.1" }
    const index = createNodeIndex([{ ref: before, name: "div", data: {} }])
    const told: string[] = []
    index.subscribe(before, (event) => told.push(event.kind))

    index.set([{ ref: after, name: "div", data: { className: "p-4" } }], [{ from: before, to: after }])
    index.emit("element:clicked", after)

    expect(told).toEqual(["renamed", "changed", "type"])
  })

  it("sends a type's own events to the node's subscribers and to watches of its type", () => {
    const index = createNodeIndex(collectNodes(sources))
    const settings = { owner: "tanstack-router", type: "route", key: "/settings" }
    const events: string[] = []
    index.subscribe(settings, (event) => events.push(event.kind === "type" ? event.name : event.kind))
    index.watch({ type: "route" }, (change) => events.push(...change.events.map((event) => `watched ${event.name}`)))

    index.emit("route:visited", settings, { url: "/settings" })

    expect(events).toEqual(["route:visited", "watched route:visited"])
  })
})

describe("createNodeCollector", () => {
  it("returns only the parts whose sources changed, keeping every node an edit didn't touch", () => {
    const collect = createNodeCollector()
    const first = collect(sources)
    const before = first.parts.flatMap((part) => part.nodes)
    const designs = [{ key: "app.par#pricing", container: titled("Pricing plans") }]

    const next = collect({ ...sources, designs })

    expect(next.parts.map((part) => part.part)).toEqual(["design:app.par#pricing"])
    const after = next.parts[0]?.nodes ?? []
    expect(after.map((node, at) => node === before[at])).toEqual([true, false, false, true])
    expect(collect({ ...sources, designs }).parts).toEqual([])
  })

  it("empties a design's part when the design goes", () => {
    const collect = createNodeCollector()
    collect(sources)

    const next = collect({ ...sources, designs: [] })

    expect(next.parts).toEqual([{ part: "design:app.par#pricing", nodes: [] }])
    expect(next.order).toEqual(["components", "routes", "screens"])
  })
})

describe("NodeIndex.update", () => {
  it("compares only the nodes an edit touched and tells each watch once", () => {
    const collect = createNodeCollector()
    const index = createNodeIndex()
    index.update(collect(sources))
    const changes: NodesChange[] = []
    index.watch({}, (change) => changes.push(change))
    const card = index.get(layer("component", "card"))

    index.update(collect({ ...sources, designs: [{ key: "app.par#pricing", container: titled("Pricing plans") }] }))

    expect(changes).toHaveLength(1)
    expect(changes[0]?.changed.map(({ node, fields }) => [node.ref.key, fields])).toEqual([
      ["app.par#pricing/title", ["text"]]
    ])
    expect(index.get(layer("component", "card"))).toBe(card)
    expect(index.children(layer("layout", "root")).map((node) => node.name)).toEqual(["title", "card"])
  })

  it("keeps parts in the order given, and drops the ones it leaves out", () => {
    const index = createNodeIndex()
    const node = (key: string) => ({ ref: { owner: "test", type: "item", key }, name: key, data: {} })
    index.update({
      parts: [
        { part: "a", nodes: [node("a")] },
        { part: "b", nodes: [node("b")] }
      ],
      order: ["a", "b"]
    })
    const removed: string[] = []
    index.watch({}, (change) => removed.push(...change.removed.map((ref) => ref.key)))

    index.update({ parts: [{ part: "c", nodes: [node("c")] }], order: ["c", "a"] })

    expect(index.ofType("item").map((item) => item.name)).toEqual(["c", "a"])
    expect(removed).toEqual(["b"])
  })

  it("tells nobody anything when nothing changed", () => {
    const collect = createNodeCollector()
    const index = createNodeIndex()
    index.update(collect(sources))
    const changes: NodesChange[] = []
    index.watch({}, (change) => changes.push(change))

    index.update(collect(sources))

    expect(changes).toEqual([])
  })
})
