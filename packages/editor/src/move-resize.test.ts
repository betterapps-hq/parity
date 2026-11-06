import { type ContainerSpec, type DesignNode, findNode, type NodeStyle } from "@parity-app/core"
import { effectiveFixture } from "@parity-app/core/fixtures"
import { describe, expect, it } from "vite-plus/test"
import type { Flow, Rect } from "./drop-slot.ts"
import type { Edge } from "./handles.ts"
import {
  absoluteDrag,
  arrowOf,
  type Drawn,
  type DrawnSteps,
  edgeAxes,
  frameResize,
  frameSizeReset,
  layerResize,
  layerSizeReset,
  layersResize,
  nudgedPosition,
  nudgeLayers,
  reorder,
  reorderStep,
  type ResizeStart,
  resizeGesture,
  resizeInsets,
  resizeStart,
  shiftInsets,
  withFrame
} from "./move-resize.ts"

/** Where a layer's sides are drawn, in steps. */
const drawn = (sides: Partial<DrawnSteps> = {}): DrawnSteps => ({ top: 0, right: 0, bottom: 0, left: 0, ...sides })

describe("moving an absolutely placed layer", () => {
  it("moves it by the sides it's placed from", () => {
    expect(shiftInsets({ top: 4, left: 2 }, 1, 0)).toEqual({ change: { left: 3 } })
    expect(shiftInsets({ top: 4, left: 2 }, 0, -10)).toEqual({ change: { top: -6 } })
    expect(shiftInsets({ bottom: 4, right: 2 }, 1, 1)).toEqual({ change: { right: 1, bottom: 3 } })
  })

  it("moves both sides of a layer stretched between them, so it keeps its size", () => {
    expect(shiftInsets({ left: 0, right: 0, top: 2 }, 1, 0)).toEqual({ change: { left: 1, right: -1 } })
    // Calendar's Review slot, dragged six steps right and four down.
    expect(shiftInsets({ top: 40, left: 0, right: 0, height: 16 }, 6, 4, drawn({ top: 40 }))).toEqual({
      change: { left: 6, right: -6, top: 44 }
    })
  })

  it("keeps negative insets, and lets them go negative", () => {
    expect(shiftInsets({ left: -4, top: -2 }, 1, 1)).toEqual({ change: { left: -3, top: -1 } })
    expect(shiftInsets({ left: 1 }, -3, 0)).toEqual({ change: { left: -2 } })
  })

  it("moves in half steps", () => {
    expect(shiftInsets({ left: 1.5 }, 0.5, 0)).toEqual({ change: { left: 2 } })
  })

  it("moves a side set to a token, or not set, from where it's drawn", () => {
    const at = { top: 10, right: 71.5, bottom: 40, left: 2 }
    expect(shiftInsets({ top: "header", left: 2 }, 0, 1, at)).toEqual({ change: { top: 11 } })
    expect(shiftInsets({}, 1, 0, at)).toEqual({ change: { left: 3 } })
    // A token on one side of a stretched layer, and a negative number on the other.
    expect(shiftInsets({ left: -2, right: "gutter" }, 4, 0, drawn({ right: 6 }))).toEqual({
      change: { left: 2, right: 2 }
    })
  })

  it("keeps an axis with a token when it isn't drawn, and an axis it doesn't move along", () => {
    expect(shiftInsets({ top: "header", left: 2 }, 0, 1)).toEqual({ change: {}, blocked: "top" })
    expect(shiftInsets({ top: "header", left: 2 }, 1, 0)).toEqual({ change: { left: 3 } })
    expect(shiftInsets({}, 1, 0)).toEqual({ change: { left: 1 } })
  })
})

// Steps of 4px, as Tailwind's default spacing.
const unit = 4

describe("resizing an absolutely placed layer", () => {
  it("moves the left inset with the left handle, keeping the right edge where it was", () => {
    // 100px wide at left 10; the left handle dragged 20px left.
    expect(resizeInsets({ left: 10 }, drawn({ left: 10 }), "x", false, -20, 100, unit)).toEqual({
      size: 30,
      insets: { left: 5 }
    })
  })

  it("moves the top inset with the top handle, and keeps it negative", () => {
    expect(resizeInsets({ top: -2 }, drawn({ top: -2 }), "y", false, 8, 40, unit)).toEqual({
      size: 8,
      insets: { top: 0 }
    })
    expect(resizeInsets({ top: -2 }, drawn({ top: -2 }), "y", false, -8, 40, unit)).toEqual({
      size: 12,
      insets: { top: -4 }
    })
  })

  it("moves a token inset from where it's drawn", () => {
    expect(resizeInsets({ left: "gutter" }, drawn({ left: 6 }), "x", false, 8, 100, unit)).toEqual({
      size: 23,
      insets: { left: 8 }
    })
  })

  it("keeps a token inset that doesn't move", () => {
    // The left handle moved too little to change the size, so the left side stays where it is.
    expect(resizeInsets({ left: "gutter" }, drawn({ left: 6 }), "x", false, 1, 100, unit)).toEqual({
      size: 25,
      insets: {}
    })
  })

  it("leaves the insets alone when the far handle grows a layer placed from the near side", () => {
    expect(resizeInsets({ left: "gutter", top: 2 }, drawn({ left: 6 }), "x", true, 20, 100, unit)).toEqual({
      size: 30,
      insets: {}
    })
  })

  it("resizes a layer placed from both sides by the dragged side's inset alone", () => {
    expect(resizeInsets({ left: 0, right: 0 }, drawn(), "x", false, 12, 300, unit)).toEqual({ insets: { left: 3 } })
    expect(resizeInsets({ left: 0, right: 0 }, drawn(), "x", true, 12, 300, unit)).toEqual({ insets: { right: -3 } })
  })

  it("keeps a layer placed from the right where it is", () => {
    // The right handle moves the right inset as the layer grows; the left handle only sizes it.
    expect(resizeInsets({ right: 4 }, drawn({ right: 4 }), "x", true, 20, 100, unit)).toEqual({
      size: 30,
      insets: { right: -1 }
    })
    expect(resizeInsets({ right: 4 }, drawn({ right: 4 }), "x", false, -20, 100, unit)).toEqual({
      size: 30,
      insets: {}
    })
  })

  it("places a layer with both sides and its own size from the near side", () => {
    expect(resizeInsets({ left: 2, right: 2, width: 20 }, drawn({ left: 2 }), "x", false, -8, 80, unit)).toEqual({
      size: 22,
      insets: { left: 0 }
    })
  })

  it("goes exactly where a snapped edge locks, to the half pixel, rather than in steps", () => {
    // 6px on a 4px scale is 1.5 steps, so the size is 26.5 where whole steps would round it; 5px is 1.25.
    expect(resizeInsets({ left: 3 }, drawn({ left: 3 }), "x", true, 6, 100, unit, true)).toEqual({
      size: 26.5,
      insets: {}
    })
    expect(resizeInsets({ left: 3 }, drawn({ left: 3 }), "x", false, 5, 100, unit, true)).toEqual({
      size: 23.75,
      insets: { left: 4.25 }
    })
    expect(resizeInsets({ left: 0, right: 0 }, drawn(), "x", false, 6.3, 300, unit, true)).toEqual({
      insets: { left: 1.625 }
    })
  })
})

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
const header = box(600, 200, 400 + 122.6 * scale, 32 * scale)
const start = (edge: Edge, fields: Partial<ResizeStart> = {}): ResizeStart => ({
  edge,
  rect: button,
  inner: header,
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

  it("takes an edge that snapped exactly where it locked, rather than in steps (PAR-174)", () => {
    // The bottom handle dragged 26px, its edge snapped 32px down to the Lunch slot's top: 24 steps, not 23.
    const gesture = resizeGesture(from("s", { top: 40, left: 0, right: 0, height: 16 }))
    expect(gesture({ dx: 0, dy: 26, shift: false, snapped: { y: 32 } })).toEqual({ height: 24 })
    // Snapped 30px down, it's 23.5 steps high, to the half pixel.
    expect(gesture({ dx: 0, dy: 26, shift: false, snapped: { y: 30 } })).toEqual({ height: 23.5 })
    // Along an axis that didn't snap, the pointer counts, in steps.
    expect(gesture({ dx: 0, dy: 26, shift: false, snapped: {} })).toEqual({ height: 23 })
  })
})

describe("resizing a layer from what the board shows and what was measured", () => {
  // A layer 100 by 40 at full size, far from its parent's inside.
  const measured = { rect: box(0, 0, 100, 40), inner: box(-100, -100, 400, 400), scale: 1, unit: 4 }

  it("takes grow away with a size along its layout's direction, and keeps it across", () => {
    const growing = (edge: Edge, parentDirection: "row" | "column") =>
      layerResize({ ...measured, edge, layer: { style: { grow: true }, parentDirection } })
    expect(growing("e", "row")({ dx: 20, dy: 0, shift: false, snaps: true }).style).toStrictEqual({
      width: 30,
      grow: undefined
    })
    expect(growing("s", "row")({ dx: 0, dy: 20, shift: false, snaps: true }).style).toStrictEqual({ height: 15 })
    expect(growing("s", "column")({ dx: 0, dy: 20, shift: false, snaps: true }).style).toStrictEqual({
      height: 15,
      grow: undefined
    })
  })

  it("gives no style until the drag has started, and nothing to snap for a layer in a layout", () => {
    const resize = layerResize({ ...measured, edge: "e", layer: { style: { grow: true }, parentDirection: "row" } })
    expect(resize({ dx: 3, dy: 0, shift: false, snaps: true })).toEqual({})
  })

  // Calendar's Review slot, 16 steps tall at top 40, stretched between its day's sides, with Lunch 8 steps below.
  const slot = { x: 0, y: 160, w: 200, h: 64 }
  const day = { siblings: [{ x: 0, y: 256, w: 200, h: 48 }], parent: { x: 0, y: 0, w: 200, h: 560 } }
  const review = (edge: Edge) =>
    layerResize({
      ...measured,
      edge,
      rect: box(0, 160, 200, 64),
      inner: box(0, 0, 200, 560),
      layer: { style: { position: "absolute", top: 40, left: 0, right: 0, height: 16 } },
      drawn: { top: 40, right: 0, bottom: 84, left: 0 },
      snapping: { box: slot, scene: day }
    })

  it("snaps an absolutely placed layer's dragged edge, and takes it exactly", () => {
    // The bottom handle dragged 26px: its edge, 6px from Lunch's top, locks there, 32px down, so it's 24 steps high.
    const snapped = review("s")({ dx: 0, dy: 26, shift: false, snaps: true })
    expect(snapped.style).toEqual({ height: 24 })
    expect(snapped.snapped?.box).toEqual({ x: 0, y: 160, w: 200, h: 96 })
    // With Ctrl held, it goes by the pointer, in steps.
    expect(review("s")({ dx: 0, dy: 26, shift: false, snaps: false })).toEqual({ style: { height: 23 } })
  })

  it("keeps a corner's proportions with Shift rather than snapping", () => {
    expect(review("se")({ dx: 26, dy: 26, shift: false, snaps: true }).snapped).toBeDefined()
    expect(review("se")({ dx: 26, dy: 26, shift: true, snaps: true }).snapped).toBeUndefined()
  })
})

describe("double-clicking a layer's handle (PAR-169)", () => {
  it("makes the size on the handle's axes hug its content", () => {
    expect(layerSizeReset("e")).toStrictEqual({ width: "hug" })
    expect(layerSizeReset("n")).toStrictEqual({ height: "hug" })
    expect(layerSizeReset("se")).toStrictEqual({ width: "hug", height: "hug" })
  })

  it("makes it fill its parent with Alt", () => {
    expect(layerSizeReset("w", true)).toStrictEqual({ width: "fill" })
    expect(layerSizeReset("nw", true)).toStrictEqual({ width: "fill", height: "fill" })
  })

  it("takes `grow` away along the direction of the layout the layer is in, and keeps it across", () => {
    const layer = { style: { grow: true }, parentDirection: "row" as const }
    expect(layerSizeReset("e", false, layer)).toStrictEqual({ width: "hug", grow: undefined })
    expect(layerSizeReset("s", true, layer)).toStrictEqual({ height: "fill" })
  })
})

describe("resizing from the middle with Alt (PAR-169)", () => {
  const square = box(0, 0, 40, 40)
  const far = box(-400, -400, 800, 800)

  it("moves the opposite edge as far, so a layer in a layout grows twice the pointer's movement", () => {
    const gesture = resizeGesture({ edge: "e", rect: square, inner: far, scale: 1, unit: 4 })
    expect(gesture({ dx: 20, dy: 0, shift: false, centre: true })).toEqual({ width: 20 })
    expect(gesture({ dx: 20, dy: 0, shift: false })).toEqual({ width: 15 })
    // From the left, moving left grows it.
    const left = resizeGesture({ edge: "w", rect: square, inner: far, scale: 1, unit: 4 })
    expect(left({ dx: -8, dy: 0, shift: false, centre: true })).toEqual({ width: 14 })
  })

  it("doesn't fill when the edge reaches the inside of its parent", () => {
    const gesture = resizeGesture({ edge: "e", rect: button, inner: header, scale, unit: 4 })
    gesture({ dx: -30, dy: 0, shift: false, centre: true })
    expect(gesture({ dx: -2, dy: 0, shift: false, centre: true })).toEqual({ width: 29 })
  })

  it("moves an absolutely placed layer's inset back by half of what it grows, keeping its middle", () => {
    // Calendar's Review slot, 16 steps high at top 40: the top handle 16px up grows it 32px, so 24 steps at top 36.
    const slot = box(100, 160, 200, 64)
    const from = (edge: Edge, style: NodeStyle) =>
      resizeGesture({
        edge,
        rect: slot,
        inner: box(100, 0, 200, 560),
        scale: 1,
        unit: 4,
        absolute: { style, drawn: { top: 40, right: 0, bottom: 84, left: 0 } }
      })
    const style: NodeStyle = { top: 40, left: 0, right: 0, height: 16 }
    expect(from("n", style)({ dx: 0, dy: -16, shift: false, centre: true })).toEqual({ height: 24, top: 36 })
    // Stretched between both sides, both insets move.
    expect(from("e", style)({ dx: 12, dy: 0, shift: false, centre: true })).toEqual({ left: -3, right: -3 })
    // Placed from the bottom alone, the bottom inset moves.
    expect(from("s", { bottom: 10, left: 0, height: 16 })({ dx: 0, dy: 8, shift: false, centre: true })).toEqual({
      height: 20,
      bottom: 8
    })
  })
})

describe("resizing several layers together (PAR-169)", () => {
  // Three cards 40px wide, 10px apart, in a row from 0 to 140, at full size with a 4px unit.
  const cards = [box(0, 0, 40, 40), box(50, 0, 40, 40), box(100, 0, 40, 40)]
  const union = box(0, 0, 140, 40)
  const together = (edge: Edge) =>
    layersResize(
      cards.map((rect) => ({
        edge,
        rect,
        inner: box(-400, -400, 800, 800),
        scale: 1,
        unit: 4,
        layer: { style: {}, parentDirection: "row" as const }
      })),
      union
    )

  it("gives each layer its share of the movement, so they grow in proportion", () => {
    // 28px across the box, of which each card is 40/140: 8px each, so 12 steps.
    expect(together("e")({ dx: 28, dy: 0, shift: false, snaps: false })).toEqual([
      { width: 12 },
      { width: 12 },
      { width: 12 }
    ])
  })

  it("starts them all once the pointer has gone four pixels, though each one's share is less", () => {
    const resize = together("e")
    expect(resize({ dx: 3, dy: 0, shift: false, snaps: false })).toEqual([undefined, undefined, undefined])
    expect(resize({ dx: 14, dy: 0, shift: false, snaps: false })).toEqual([{ width: 11 }, { width: 11 }, { width: 11 }])
  })

  it("resizes them all from their middles with Alt", () => {
    expect(together("e")({ dx: 28, dy: 0, shift: false, centre: true, snaps: false })).toEqual([
      { width: 14 },
      { width: 14 },
      { width: 14 }
    ])
  })
})

describe("dragging an absolutely placed layer", () => {
  // The Review slot again, with Lunch's top 32px below its bottom, or 33px.
  const style: NodeStyle = { position: "absolute", top: 40, left: 0, right: 0, height: 16 }
  const slot = { x: 0, y: 160, w: 200, h: 64 }
  const day = (lunch: number) => ({
    siblings: [{ x: 0, y: lunch, w: 200, h: 48 }],
    parent: { x: 0, y: 0, w: 200, h: 560 }
  })
  const moving = (lunch: number) =>
    absoluteDrag({ style, unit: 4, scale: 1, snapping: { box: slot, scene: day(lunch) } })

  it("moves in half steps where nothing is near", () => {
    expect(moving(256)({ dx: 0, dy: 30, snaps: false })).toEqual({ change: { top: 47.5 } })
    expect(moving(256)({ dx: 0, dy: 31, snaps: false })).toEqual({ change: { top: 48 } })
  })

  it("goes exactly where it snaps, to the half pixel", () => {
    // Dragged 30px down, its bottom locks to Lunch's top, 32px down: 8 steps.
    const snapped = moving(256)({ dx: 0, dy: 30, snaps: true })
    expect(snapped.change).toEqual({ top: 48 })
    expect(snapped.snapped?.locked).toEqual({ x: true, y: true })
    // A line off the scale, 33px down, is 8.25 steps.
    expect(moving(257)({ dx: 0, dy: 30, snaps: true }).change).toEqual({ top: 48.25 })
  })

  it("moves by the pointer when it isn't drawn", () => {
    expect(absoluteDrag({ style, unit: 4, scale: 0.5 })({ dx: 10, dy: 0, snaps: true })).toEqual({
      change: { left: 5, right: -5 }
    })
  })
})

// A design with no frame size of its own, in a desktop mode 1280 wide, drawn at half size and 900 high.
const pricing: ContainerSpec = {
  id: "pricing",
  name: "Pricing",
  position: { x: 0, y: 0 },
  root: { type: "layout", id: "root", children: [] },
  states: [{ id: "default", name: "Default" }]
}
const desktop = { viewport: "desktop", width: 1280 }
const framed = (edge: Edge, design = pricing, rect = box(0, 0, 640, 450)) =>
  frameResize({ design, mode: desktop, edge, rect, scale: 0.5 })

describe("resizing a frame", () => {
  it("takes a width in whole pixels from the right handle", () => {
    expect(framed("e")({ dx: 100, dy: 30 })).toEqual({ width: 1480 })
    expect(
      frameResize({ design: pricing, mode: desktop, edge: "e", rect: box(0, 0, 909, 639), scale: 0.71 })({
        dx: 50,
        dy: 0
      })
    ).toEqual({ width: 1350 })
  })

  it("goes back to its viewport's width within six screen pixels of it", () => {
    expect(framed("e")({ dx: 2, dy: 0 })).toEqual({})
    expect(framed("e")({ dx: -2, dy: 0 })).toEqual({})
    expect(framed("e")({ dx: 12, dy: 0 })).toEqual({ width: 1304 })
  })

  it("hugs its content again within six screen pixels of where it started hugging it", () => {
    expect(framed("s")({ dx: 30, dy: 50 })).toEqual({ height: 1000 })
    expect(framed("s")({ dx: 0, dy: 2 })).toEqual({})
  })

  it("keeps a height of its own, with nothing to go back to", () => {
    const tall = { ...pricing, frames: { desktop: { height: 600 } } }
    expect(framed("s", tall, box(0, 0, 640, 300))({ dx: 0, dy: 2 })).toEqual({ height: 604 })
    expect(framed("e", tall, box(0, 0, 640, 300))({ dx: 100, dy: 0 })).toEqual({ width: 1480, height: 600 })
  })

  it("changes both from the corner", () => {
    expect(framed("se")({ dx: 100, dy: 50 })).toEqual({ width: 1480, height: 1000 })
  })

  it("never goes narrower than 160 or shorter than 80", () => {
    expect(framed("se")({ dx: -1000, dy: -1000 })).toEqual({ width: 160, height: 80 })
  })
})

describe("double-clicking a frame's handle", () => {
  it("goes back to the viewport's width or the content's height on the handle's axes", () => {
    expect(frameSizeReset({ width: 1480, height: 600 }, "e")).toEqual({ height: 600 })
    expect(frameSizeReset({ width: 1480, height: 600 }, "se")).toEqual({})
    expect(frameSizeReset(undefined, "s")).toEqual({})
  })

  it("keeps no frame for a viewport that takes its own size", () => {
    expect(withFrame(pricing, "desktop", { width: 1480 }).frames).toEqual({ desktop: { width: 1480 } })
    const both = { ...pricing, frames: { desktop: { width: 1480 }, mobile: { height: 600 } } }
    expect(withFrame(both, "desktop", {}).frames).toEqual({ mobile: { height: 600 } })
    expect(withFrame(withFrame(both, "desktop", {}), "mobile", {})).not.toHaveProperty("frames")
  })
})

describe("what a resize starts from", () => {
  const found = effectiveFixture.designs.find((design) => design.id === "card")!
  const card = (variants: Record<string, string>): ContainerSpec => ({ ...found, view: { variants } })
  const [base, compact] = found.states

  it("reads the layout around the layer with the variant options the board shows", () => {
    expect(resizeStart(card({ layout: "inline" }), "copy", { state: base })?.parentDirection).toBe("row")
    expect(resizeStart(card({ layout: "stacked" }), "copy", { state: base })?.parentDirection).toBe("column")
  })

  it("reads the layer's style in the frame's viewport and the state edited", () => {
    const stacked = card({ layout: "stacked" })
    expect(resizeStart(stacked, "body", { state: base, viewport: "mobile" })?.style).toMatchObject({ padding: 2 })
    expect(resizeStart(stacked, "body", { state: base, viewport: "desktop" })?.style).toMatchObject({ padding: 4 })
    // The Compact state's gap wins over the mobile patch, and the Inline option's direction stays.
    const inline = card({ layout: "inline" })
    expect(resizeStart(inline, "body", { state: compact, viewport: "mobile" })?.style).toMatchObject({
      direction: "row",
      gap: 2,
      padding: 2
    })
  })

  it("has no layout around the root, and nothing for a layer that isn't there", () => {
    expect(resizeStart(card({}), "body", { state: base })).toEqual({
      style: { direction: "column", gap: 4, padding: 4 }
    })
    expect(resizeStart(card({}), "missing", { state: base })).toBeUndefined()
  })
})

const row: Flow = { direction: "row", wraps: false, reversed: false, linesReversed: false }
const column: Flow = { direction: "column", wraps: false, reversed: false, linesReversed: false }

describe("the arrow keys", () => {
  it("knows the arrow keys", () => {
    expect(arrowOf("ArrowLeft")).toBe("left")
    expect(arrowOf("ArrowDown")).toBe("down")
    expect(arrowOf("Enter")).toBeUndefined()
  })
})

describe("how far an arrow moves a layer in a layout", () => {
  it("moves one place along a row or column, and not across it", () => {
    expect(reorderStep(row, "left")).toBe(-1)
    expect(reorderStep(row, "right")).toBe(1)
    expect(reorderStep(row, "up")).toBeUndefined()
    expect(reorderStep(column, "up")).toBe(-1)
    expect(reorderStep(column, "down")).toBe(1)
    expect(reorderStep(column, "left")).toBeUndefined()
  })

  it("follows the layout's order on screen when it's reversed", () => {
    expect(reorderStep({ ...row, reversed: true }, "right")).toBe(-1)
    expect(reorderStep({ ...column, reversed: true }, "up")).toBe(1)
  })

  it("moves a row's worth of places up or down a grid", () => {
    const grid: Flow = { direction: "row", wraps: true, reversed: false, linesReversed: false, stride: 3 }
    expect(reorderStep(grid, "right")).toBe(1)
    expect(reorderStep(grid, "down")).toBe(3)
    expect(reorderStep(grid, "up")).toBe(-3)
  })
})

describe("reordering", () => {
  const children = (...ids: string[]) => ids.map((id) => ({ id, inFlow: !id.startsWith("x") }))

  it("moves a layer one place, and leaves one at the end where it is", () => {
    expect(reorder(children("a", "b", "c"), new Set(["a"]), 1)).toEqual(["b", "a", "c"])
    expect(reorder(children("a", "b", "c"), new Set(["c"]), 1)).toEqual(["a", "b", "c"])
    expect(reorder(children("a", "b", "c"), new Set(["a"]), -1)).toEqual(["a", "b", "c"])
  })

  it("moves several layers together, and stops them all at the end", () => {
    expect(reorder(children("a", "b", "c", "d"), new Set(["b", "c"]), 1)).toEqual(["a", "d", "b", "c"])
    expect(reorder(children("a", "b", "c", "d"), new Set(["a", "c"]), 1)).toEqual(["b", "a", "d", "c"])
    expect(reorder(children("a", "b", "c"), new Set(["b", "c"]), 1)).toEqual(["a", "b", "c"])
  })

  it("steps over absolutely placed and hidden layers, which keep their place in the list", () => {
    expect(reorder(children("a", "x1", "b", "c"), new Set(["a"]), 1)).toEqual(["b", "x1", "a", "c"])
  })

  it("moves a row down a grid only when there's a row below", () => {
    expect(reorder(children("a", "b", "c", "d", "e"), new Set(["a"]), 3)).toEqual(["b", "c", "d", "a", "e"])
    expect(reorder(children("a", "b", "c", "d", "e"), new Set(["c"]), 3)).toEqual(["a", "b", "c", "d", "e"])
    expect(reorder(children("a", "b", "c", "d", "e"), new Set(["e"]), -3)).toEqual(["a", "e", "b", "c", "d"])
  })
})

// Moving an absolutely placed layer by its insets is `shiftInsets`, tested above.

const text = (id: string, extra: { style?: NodeStyle } = {}): DesignNode => ({ type: "text", id, text: id, ...extra })

function card(): ContainerSpec {
  return {
    id: "card",
    name: "Card",
    position: { x: 100, y: 200 },
    root: {
      type: "layout",
      id: "root",
      children: [
        { type: "layout", id: "actions", style: { direction: "row" }, children: [text("save"), text("cancel")] },
        text("title"),
        text("badge", { style: { position: "absolute", top: 2, left: 2 } }),
        text("body"),
        { type: "instance", id: "stat", design: "stat" }
      ]
    },
    states: [
      { id: "default", name: "Default" },
      { id: "loading", name: "Loading", overrides: { body: { hidden: true } } }
    ]
  }
}

const nothingDrawn: Drawn = { flow: () => undefined, insets: () => undefined }
const order = (container: ContainerSpec, parent = "root") =>
  (findNode(container.root, parent) as Extract<DesignNode, { type: "layout" }>).children.map((child) => child.id)

describe("nudging a design's layers", () => {
  const base = card().states[0]!

  it("reorders a layer along its layout, and leaves it across", () => {
    const right = nudgeLayers(card(), ["save"], base, "right", false, 4, nothingDrawn).container
    expect(order(right, "actions")).toEqual(["cancel", "save"])
    const down = nudgeLayers(card(), ["save"], base, "down", false, 4, nothingDrawn).container
    expect(order(down, "actions")).toEqual(["save", "cancel"])
    expect(order(nudgeLayers(card(), ["title"], base, "up", false, 4, nothingDrawn).container)).toEqual([
      "title",
      "actions",
      "badge",
      "body",
      "stat"
    ])
  })

  it("moves one place with Shift too, and steps over absolutely placed layers", () => {
    // The badge is placed absolutely, so it keeps its place in the list while the title passes the body.
    const moved = nudgeLayers(card(), ["title"], base, "down", true, 4, nothingDrawn).container
    expect(order(moved)).toEqual(["actions", "body", "badge", "title", "stat"])
  })

  it("steps over a layer the state hides", () => {
    const loading = card().states[1]!
    const moved = nudgeLayers(card(), ["title"], loading, "down", false, 4, nothingDrawn).container
    expect(order(moved)).toEqual(["actions", "stat", "badge", "body", "title"])
  })

  it("follows the layout as the frame draws it, as a viewport can turn a row into a column", () => {
    const drawn: Drawn = { flow: (layer) => (layer === "save" ? column : undefined), insets: () => undefined }
    const moved = nudgeLayers(card(), ["save"], base, "down", false, 4, drawn).container
    expect(order(moved, "actions")).toEqual(["cancel", "save"])
  })

  it("moves an absolutely placed layer 1px, or 10px with Shift, off the spacing scale", () => {
    const pixel = nudgeLayers(card(), ["badge"], base, "right", false, 4, nothingDrawn).container
    expect(findNode(pixel.root, "badge")?.style).toEqual({ position: "absolute", top: 2, left: 2.25 })
    const ten = nudgeLayers(card(), ["badge"], base, "up", true, 4, nothingDrawn).container
    expect(findNode(ten.root, "badge")?.style).toEqual({ position: "absolute", top: -0.5, left: 2 })
    // With MUI's 8px unit, 1px is an eighth of a step.
    const mui = nudgeLayers(card(), ["badge"], base, "down", false, 8, nothingDrawn).container
    expect(findNode(mui.root, "badge")?.style?.top).toBe(2.125)
  })

  it("lands on whole pixels after many presses with a unit that doesn't divide evenly", () => {
    let container = card()
    for (let press = 0; press < 6; press++) {
      container = nudgeLayers(container, ["badge"], base, "right", false, 6, nothingDrawn).container
    }
    // 2 steps of 6px is 12px; six presses make it 18px, 3 steps exactly.
    expect(findNode(container.root, "badge")?.style?.left).toBe(3)
  })

  it("moves an absolutely placed layer in the state being edited only", () => {
    const loading = card().states[1]!
    const moved = nudgeLayers(card(), ["badge"], loading, "down", false, 4, nothingDrawn).container
    expect(findNode(moved.root, "badge")?.style?.top).toBe(2)
    expect(moved.states[1]?.overrides?.badge).toEqual({ style: { top: 2.25 } })
  })

  it("names a token it couldn't move by", () => {
    const container = card()
    const badge = findNode(container.root, "badge")!
    badge.style = { position: "absolute", top: "header", left: 2 }
    expect(nudgeLayers(container, ["badge"], base, "down", false, 4, nothingDrawn).blocked).toEqual({
      layer: "badge",
      side: "top",
      token: "header"
    })
  })

  it("leaves layers inside instances where they are", () => {
    const container = card()
    expect(nudgeLayers(container, ["stat/value"], base, "up", false, 4, nothingDrawn).container).toBe(container)
  })
})

describe("nudging designs and notes", () => {
  it("moves them 1px, or 10px with Shift, to the whole pixel", () => {
    expect(nudgedPosition({ x: 100, y: 200 }, "left", false)).toEqual({ x: 99, y: 200 })
    expect(nudgedPosition({ x: 100, y: 200 }, "down", true)).toEqual({ x: 100, y: 210 })
    expect(nudgedPosition({ x: 100.4, y: 0 }, "right", false)).toEqual({ x: 101, y: 0 })
  })
})
