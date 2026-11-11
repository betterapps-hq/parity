import { describe, expect, it } from "vite-plus/test"
import { type ContainerSpec, includeComponent, linkAllowed, parseCanvasDocument, parseDesignNode } from "./document.ts"

const toaster = { path: "src/components/ui/sonner.tsx", export: "Toaster" }
const price = { path: "src/promo.tsx", export: "PromoPrice" }

describe("includeComponent", () => {
  it("lists each export once", () => {
    const once = includeComponent(undefined, price)
    expect(once).toEqual({ include: [price] })
    expect(includeComponent(once, price)).toEqual({ include: [price] })
    expect(includeComponent(once, toaster)).toEqual({ include: [price, toaster] })
  })
})

describe("a frame in a project file", () => {
  const frame: ContainerSpec = {
    id: "sketch",
    name: "Sketch",
    kind: "frame",
    position: { x: 40, y: 80 },
    size: { width: 400, height: 300 },
    root: { type: "layout", id: "root", children: [{ type: "text", id: "note", text: "Idea" }] },
    states: [{ id: "default", name: "Default" }]
  }

  const file = (design: Partial<ContainerSpec>) => ({ version: 3, containers: [design] })

  it("is read and written like the other kinds, with a size of its own", () => {
    const read = parseCanvasDocument(file(frame))
    expect(read.containers[0]).toEqual(frame)
    const written = JSON.stringify(read)
    expect(parseCanvasDocument(JSON.parse(written))).toEqual(read)
    expect(parseCanvasDocument(file({ ...frame, size: undefined })).containers[0]).not.toHaveProperty("size")
  })

  it("has a layout at its root, one state drawn as its layers are, and no params, view or sizes per viewport", () => {
    const cases: [Partial<ContainerSpec>, string][] = [
      [{ root: { type: "text", id: "root", text: "Idea" } }, "/containers/0/root: a frame's root is a layout"],
      [{ states: [...frame.states, { id: "empty", name: "Empty" }] }, "/containers/0/states: a frame has one state"],
      [
        { states: [{ id: "default", name: "Default", overrides: { note: { text: "Other" } } }] },
        "/containers/0/states/0/overrides"
      ],
      [{ params: { title: { type: "text" } } }, "/containers/0/params: a frame has no params"],
      [{ view: { modes: ["desktop-dark"] } }, "/containers/0/view"],
      [{ frames: { mobile: { width: 390 } } }, "/containers/0/frames"]
    ]

    for (const [change, message] of cases) {
      expect(() => parseCanvasDocument(file({ ...frame, ...change }))).toThrow(message)
    }
  })

  it("is the only kind with a size of its own", () => {
    for (const kind of ["screen", "component", undefined] as const) {
      expect(() => parseCanvasDocument(file({ ...frame, kind }))).toThrow("/containers/0/size: only a frame")
    }
  })
})

describe("canvas objects, links and sources in a project file", () => {
  const objects = [
    { kind: "table", ref: "public.users", position: { x: 0, y: 0 } },
    { kind: "operation", ref: "getUser", position: { x: 400, y: 0 } },
    { kind: "route", ref: "/users/:id", position: { x: 800, y: 0 } }
  ]

  const links = [
    { id: "l1", type: "shows", from: { kind: "screen", ref: "user-page" }, to: { kind: "route", ref: "/users/:id" } },
    { id: "l2", type: "calls", from: { kind: "route", ref: "/users/:id" }, to: { kind: "operation", ref: "getUser" } },
    { id: "l3", type: "reads", from: { kind: "operation", ref: "getUser" }, to: { kind: "table", ref: "public.users" } }
  ]

  const file = {
    version: 3,
    containers: [],
    objects,
    links,
    sources: { data: "migrations", routes: "tanstack-router" }
  }

  it("are read and written as saved, with nothing of the models themselves", () => {
    const read = parseCanvasDocument(file)
    expect(read).toEqual(file)
    const written = JSON.stringify(read)
    expect(parseCanvasDocument(JSON.parse(written))).toEqual(read)
    expect(parseCanvasDocument({ version: 3, containers: [] })).toEqual({ version: 3, containers: [] })
  })

  it("keep a table, operation or route only as where it sits", () => {
    const cases: [unknown, string][] = [
      [[{ ...objects[0], columns: ["id"] }], "/objects/0/columns: unknown property"],
      [[{ ...objects[0], kind: "screen" }], "/objects/0/kind"],
      [[objects[0], { ...objects[0], position: { x: 9, y: 9 } }], '/objects/1: the table "public.users" is already'],
      [[{ ...objects[0], position: { x: 0 } }], "/objects/0/position/y"]
    ]

    for (const [list, message] of cases) {
      expect(() => parseCanvasDocument({ ...file, objects: list })).toThrow(message)
    }
  })

  it("join only the kinds each type of link allows", () => {
    const tableToScreen = { ...links[0], from: links[2]!.to, to: links[0]!.from }

    const cases: [unknown, string][] = [
      [[tableToScreen], "/links/0: a shows link goes from screen to route, not table to screen"],
      [[{ ...links[2], type: "joins" }], "/links/0/type"],
      [[links[0], { ...links[1], id: "l1" }], '/links/1/id: duplicate link id "l1"'],
      [[{ ...links[0], from: { kind: "frame", ref: "sketch" } }], "/links/0/from/kind"]
    ]

    for (const [list, message] of cases) {
      expect(() => parseCanvasDocument({ ...file, links: list })).toThrow(message)
    }

    expect(linkAllowed("writes", "operation", "table")).toBe(true)
    expect(linkAllowed("calls", "component", "operation")).toBe(true)
    expect(linkAllowed("calls", "operation", "table")).toBe(false)
  })

  it("choose a source for the data, API and routes lenses only", () => {
    expect(() => parseCanvasDocument({ ...file, sources: { flags: "openfeature" } })).toThrow("/sources/flags")
    expect(() => parseCanvasDocument({ ...file, sources: { api: 3 } })).toThrow("/sources/api: expected a string")
  })
})

describe("a design's layers", () => {
  it("each have an id of their own, in slots too", () => {
    const title = { type: "text", id: "title", text: "Plans" }
    const card = { type: "component", id: "card", component: "Card", slots: { header: [title] } }
    const page = { type: "layout", id: "page", children: [title, card] }
    expect(() => parseDesignNode(page, "node")).toThrow('node/children/1/slots/header/0/id: duplicate node id "title"')
  })
})

describe("a project file's modes", () => {
  it("are checked where they sit in the file", () => {
    expect(() => parseCanvasDocument({ version: 3, containers: [], modes: { version: 2 } })).toThrow(
      "/modes/version: expected 1"
    )
  })
})

describe("a project file's corrections", () => {
  it("are read with the designs, and checked", () => {
    const file = { version: 3, containers: [], detection: { include: [price] } }
    expect(parseCanvasDocument(file).detection).toEqual({ include: [price] })
    // A list of components taken off by hand, as an earlier version saved, is dropped (PAR-531).
    expect(parseCanvasDocument({ ...file, detection: { include: [price], exclude: [toaster] } }).detection).toEqual({
      include: [price]
    })
    expect(() => parseCanvasDocument({ ...file, detection: { include: [{ path: "src/promo.tsx" }] } })).toThrow(
      "/detection/include/0/export"
    )
  })
})

describe("a layer's order", () => {
  it("is a whole number or a z-index token's name", () => {
    const layer = (zIndex: number | string) => ({ type: "layout", id: "plans", style: { zIndex }, children: [] })

    expect(parseDesignNode(layer(-5), "node").style).toEqual({ zIndex: -5 })
    expect(parseDesignNode(layer("z-overlay"), "node").style).toEqual({ zIndex: "z-overlay" })
    expect(() => parseDesignNode(layer(1.5), "node")).toThrow("node/style/zIndex: expected a whole number")
  })
})
