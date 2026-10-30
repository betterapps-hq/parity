import type { NodeStyle } from "@parity-app/core"
import type { Edge, Rect } from "@parity-app/editor"
import { describe, expect, it } from "vite-plus/test"
import { edgeAxes, type ResizeStart, resizeGesture } from "./resize.ts"

const box = (left: number, top: number, width: number, height: number): Rect => ({
  left,
  top,
  right: left + width,
  bottom: top + height
})

// The dashboard's New project button, 122.6 by 32, last in its header row, at 71% zoom: its right and top edges sit
// on the inside of the row.
const scale = 0.71
const button = box(1000, 200, 122.6 * scale, 32 * scale)
const row = box(600, 200, 400 + 122.6 * scale, 32 * scale)
const start = (edge: Edge, fields: Partial<ResizeStart> = {}): ResizeStart => ({
  edge,
  rect: button,
  inner: row,
  scale,
  unit: 4,
  ...fields
})

/** The style the gesture gives at each pointer position in turn, the last one returned. */
function drag(from: ResizeStart, ...moves: [number, number, boolean?][]) {
  const gesture = resizeGesture(from)
  return moves.map(([dx, dy, shift]) => gesture({ dx, dy, shift: !!shift })).at(-1)
}

describe("which sizes a handle changes", () => {
  it("changes the width from the left and right, the height from the top and bottom, and both from a corner", () => {
    const axes = Object.fromEntries(
      (["n", "e", "s", "w", "ne", "se", "sw", "nw"] as const).map((edge) => [edge, edgeAxes(edge)])
    )
    expect(axes).toEqual({
      n: { width: false, height: true },
      e: { width: true, height: false },
      s: { width: false, height: true },
      w: { width: true, height: false },
      ne: { width: true, height: true },
      se: { width: true, height: true },
      sw: { width: true, height: true },
      nw: { width: true, height: true }
    })
  })
})

describe("resizing a layer in a layout", () => {
  it("changes only the width with the right handle, whichever way the pointer drifts", () => {
    // Dragged 50px right, wandering up and down: 122.6 + 50 / 0.71 is 193px, 48 steps.
    expect(drag(start("e"), [10, -3], [30, 6], [50, 4])).toEqual({ width: 48 })
  })

  it("changes nothing when a side's handle is dragged along its side", () => {
    expect(drag(start("n"), [10, 0], [50, 0])).toBeUndefined()
    expect(drag(start("e"), [0, 30], [0, -30])).toBeUndefined()
  })

  it("changes nothing until the pointer has moved four pixels", () => {
    expect(drag(start("e"), [1, 0], [3, 0])).toBeUndefined()
    expect(drag(start("e"), [3, 0], [4, 0])).toEqual({ width: 32 })
  })

  it("doesn't fill when an edge starts on the inside of the parent", () => {
    // The right edge starts on the row's inside: moving it a little gives a fixed width, not fill.
    expect(drag(start("e"), [-5, 0])).toEqual({ width: 29 })
    expect(drag(start("n"), [0, -5])).toEqual({ height: 10 })
  })

  it("fills once the edge comes back to the inside of the parent", () => {
    expect(drag(start("e"), [-30, 0], [-2, 0])).toEqual({ width: "fill" })
    // Shift keeps it fixed.
    expect(drag(start("e"), [-30, 0], [-2, 0, true])).toEqual({ width: 30 })
  })

  it("fills when an edge that started away from the inside reaches it", () => {
    const narrow = box(1000, 200, 60, 10)
    expect(drag(start("s", { rect: narrow }), [0, 12])).toEqual({ height: "fill" })
  })

  it("keeps a corner's proportions with Shift", () => {
    const square = box(0, 0, 40, 40)
    expect(drag(start("se", { rect: square, inner: box(-100, -100, 400, 400), scale: 1 }), [20, 0, true])).toEqual({
      width: 15,
      height: 15
    })
  })
})

describe("resizing an absolutely placed layer", () => {
  // Calendar's Review slot: 16 steps tall, 40 steps from the top, stretched between its day's sides.
  const slot = box(100, 160, 200, 64)
  const from = (edge: Edge, style: NodeStyle) =>
    start(edge, {
      rect: slot,
      inner: box(100, 0, 200, 560),
      scale: 1,
      absolute: { style, drawn: { top: 40, right: 0, bottom: 84, left: 0 } }
    })

  it("moves the top inset with the top handle and keeps the bottom edge", () => {
    expect(drag(from("n", { top: 40, left: 0, right: 0, height: 16 }), [0, -16])).toEqual({ height: 20, top: 36 })
  })

  it("moves a stretched layer's left inset with the left handle, keeping both sides", () => {
    expect(drag(from("w", { top: 40, left: 0, right: 0, height: 16 }), [12, 0])).toEqual({ left: 3 })
    expect(drag(from("e", { top: 40, left: 0, right: 0, height: 16 }), [-12, 0])).toEqual({ right: 3 })
  })

  it("keeps a negative inset negative, and a token inset it doesn't move", () => {
    // The top-left corner dragged 8px left: the left inset moves further out, the top stays a token.
    expect(drag(from("nw", { top: "gutter", left: -2, width: 50, height: 16 }), [-8, 0])).toEqual({
      width: 52,
      height: 16,
      left: -4
    })
  })

  it("never fills", () => {
    expect(drag(from("s", { top: 40, left: 0, right: 0 }), [0, 336])).toEqual({ height: 100 })
  })
})
