import { describe, expect, it } from "vite-plus/test"
import {
  baseState,
  type ContainerSpec,
  designStates,
  includeComponent,
  linkAllowed,
  parseCanvasDocument,
  parseDesignNode
} from "./document.ts"

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
    root: { type: "layout", id: "root", children: [{ type: "text", id: "note", text: "Idea" }] }
  }

  const file = (design: Partial<ContainerSpec>) => ({ version: 4, containers: [design] })

  it("is read and written like the other kinds, with a size of its own", () => {
    const read = parseCanvasDocument(file(frame))
    expect(read.containers[0]).toEqual(frame)
    const written = JSON.stringify(read)
    expect(parseCanvasDocument(JSON.parse(written))).toEqual(read)
    expect(parseCanvasDocument(file({ ...frame, size: undefined })).containers[0]).not.toHaveProperty("size")
  })

  it("has a layout at its root, and no states, params, view or sizes per viewport", () => {
    const cases: [Partial<ContainerSpec>, string][] = [
      [{ root: { type: "text", id: "root", text: "Idea" } }, "/containers/0/root: a frame's root is a layout"],
      [{ states: [{ id: "default", name: "Default" }] }, "/containers/0/states: only a component has states"],
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

describe("states in a project file (PAR-1002)", () => {
  const root = { type: "layout" as const, id: "root", children: [{ type: "text" as const, id: "label", text: "Save" }] }
  const hover = { id: "hover", name: "Hover", overrides: { label: { text: "Save now" } } }

  const file = (design: Partial<ContainerSpec>) => ({
    version: 4,
    containers: [{ id: "button", name: "Button", position: { x: 0, y: 0 }, root, ...design }]
  })

  it("are a component's, the base first, and shown on its board", () => {
    const states = [{ id: "default", name: "Default" }, hover]
    const read = parseCanvasDocument(file({ kind: "component", states, view: { state: "hover", allStates: true } }))
    expect(read.containers[0]!.states).toEqual(states)
    expect(designStates(read.containers[0]!)).toEqual(states)
  })

  it("leave a component that lists none with its base state alone", () => {
    expect(designStates(parseCanvasDocument(file({ kind: "component" })).containers[0]!)).toEqual([baseState])
  })

  it("are refused on a screen, which shows other data through its components' props instead", () => {
    const cases: [Partial<ContainerSpec>, string][] = [
      [{ states: [{ id: "default", name: "Default" }, hover] }, "/containers/0/states: only a component has states"],
      [{ view: { state: "hover" } }, "/containers/0/view/state: only a component has states"],
      [{ view: { allStates: true } }, "/containers/0/view/allStates: only a component has states"]
    ]

    for (const [change, message] of cases) {
      expect(() => parseCanvasDocument(file(change))).toThrow(message)
      expect(() => parseCanvasDocument(file({ ...change, kind: "screen" }))).toThrow(message)
    }

    expect(designStates(parseCanvasDocument(file({})).containers[0]!)).toEqual([baseState])
  })

  it("are no instance's to choose: a copy shows its component's base state", () => {
    const placed = { type: "instance", id: "save", design: "button", state: "hover" }
    const saved = { ...file({}), containers: [{ ...file({}).containers[0], root: { ...root, children: [placed] } }] }

    expect(() => parseCanvasDocument(saved)).toThrow("state")
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
    version: 4,
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
    expect(parseCanvasDocument({ version: 4, containers: [] })).toEqual({ version: 4, containers: [] })
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
    expect(() => parseCanvasDocument({ version: 4, containers: [], modes: { version: 2 } })).toThrow(
      "/modes/version: expected 1"
    )
  })
})

describe("a project file's corrections", () => {
  it("are read with the designs, and checked", () => {
    const file = { version: 4, containers: [], detection: { include: [price] } }
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
  it("is a whole number of steps or a z-index token", () => {
    const layer = (zIndex: { step: number } | { token: string } | number) => ({
      type: "layout",
      id: "plans",
      style: { zIndex },
      children: []
    })

    expect(parseDesignNode(layer({ step: -5 }), "node").style).toEqual({ zIndex: { step: -5 } })
    expect(parseDesignNode(layer({ token: "z-overlay" }), "node").style).toEqual({ zIndex: { token: "z-overlay" } })
    expect(() => parseDesignNode(layer({ step: 1.5 }), "node")).toThrow(
      "node/style/zIndex/step: expected a whole number"
    )
    expect(() => parseDesignNode(layer(10), "node")).toThrow("node/style/zIndex: expected { step } or { token }")
  })
})

describe("a style in an earlier file's form", () => {
  const layer = (key: string, value: number | string | { step: string }) => ({
    type: "layout",
    id: "plans",
    style: { [key]: value },
    children: []
  })

  it("is refused, saying the forms the value takes", () => {
    expect(() => parseDesignNode(layer("gap", 4), "node")).toThrow(
      "node/style/gap: expected { step }, { token }, { value }, { keyword } or { expr }"
    )
    expect(() => parseDesignNode(layer("width", "fill"), "node")).toThrow("node/style/width: expected { step }")
    expect(() => parseDesignNode(layer("color", "primary"), "node")).toThrow("node/style/color: expected { token }")
  })

  it("is refused for a key that has another name now", () => {
    expect(() => parseDesignNode(layer("direction", "row"), "node")).toThrow("node/style/direction: ")
  })

  it("says what a form that nearly fits got wrong", () => {
    expect(() => parseDesignNode(layer("gap", { step: "4" }), "node")).toThrow("node/style/gap/step: ")
  })
})

describe("a file's version", () => {
  it("is 4, and an earlier one is refused", () => {
    expect(parseCanvasDocument({ version: 4, containers: [] }).version).toBe(4)
    expect(() => parseCanvasDocument({ version: 3, containers: [] })).toThrow("/version: expected 4")
  })
})
