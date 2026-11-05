import { describe, expect, it } from "vite-plus/test"
import { correctDetection, parseCanvasDocument } from "./document.ts"

const toaster = { path: "src/components/ui/sonner.tsx", export: "Toaster" }
const price = { path: "src/promo.tsx", export: "PromoPrice" }

describe("correctDetection", () => {
  it("records each correction once", () => {
    const once = correctDetection(undefined, "exclude", toaster)
    expect(once).toEqual({ exclude: [toaster] })
    expect(correctDetection(once, "exclude", toaster)).toEqual({ exclude: [toaster] })
    expect(correctDetection(once, "include", price)).toEqual({ exclude: [toaster], include: [price] })
  })

  it("undoes a correction with its opposite, leaving nothing to write once none are left", () => {
    expect(correctDetection({ exclude: [toaster] }, "include", toaster)).toBeUndefined()
    expect(correctDetection({ include: [price], exclude: [toaster] }, "exclude", price)).toEqual({ exclude: [toaster] })
  })
})

describe("a frame in a project file", () => {
  const frame = {
    id: "sketch",
    name: "Sketch",
    kind: "frame",
    position: { x: 40, y: 80 },
    size: { width: 400, height: 300 },
    root: { type: "layout", id: "root", children: [{ type: "text", id: "note", text: "Idea" }] },
    states: [{ id: "default", name: "Default" }]
  }
  const file = (design: Record<string, unknown>) => ({ version: 3, containers: [design] })

  it("is read and written like the other kinds, with a size of its own", () => {
    const read = parseCanvasDocument(file(frame))
    expect(read.containers[0]).toEqual(frame)
    const written = JSON.stringify(read)
    expect(parseCanvasDocument(JSON.parse(written))).toEqual(read)
    expect(parseCanvasDocument(file({ ...frame, size: undefined })).containers[0]).not.toHaveProperty("size")
  })

  it("has a layout at its root, one state drawn as its layers are, and no params, view or sizes per viewport", () => {
    const cases: [Record<string, unknown>, string][] = [
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
    for (const kind of ["screen", "component", undefined]) {
      expect(() => parseCanvasDocument(file({ ...frame, kind }))).toThrow("/containers/0/size: only a frame")
    }
  })
})

describe("a project file's corrections", () => {
  it("are read with the designs, and checked", () => {
    const file = { version: 3, containers: [], detection: { include: [price] } }
    expect(parseCanvasDocument(file).detection).toEqual({ include: [price] })
    expect(() => parseCanvasDocument({ ...file, detection: { include: [{ path: "src/promo.tsx" }] } })).toThrow(
      "/detection/include/0/export"
    )
  })
})
