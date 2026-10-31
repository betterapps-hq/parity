import type { ContainerSpec } from "@parity-app/core"
import { effectiveFixture } from "@parity-app/core/fixtures"
import { describe, expect, it } from "vite-plus/test"
import { type Edge, handleBoxes, type HandleBox, resizeStart } from "./handles.ts"

const all: Edge[] = ["n", "e", "s", "w", "ne", "se", "sw", "nw"]

const boxes = (box: HandleBox) => Object.fromEntries(handleBoxes(box, all).map(({ edge, box }) => [edge, box]))

/** Whether two boxes share any area, rather than only an edge. */
const overlaps = (a: HandleBox, b: HandleBox) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe("resize handles", () => {
  it("straddle a large layer's edges, with the side strips stopping short of the corners", () => {
    const handles = boxes({ x: 100, y: 200, w: 120, h: 60 })
    expect(handles.nw).toEqual({ x: 96, y: 196, w: 8, h: 8 })
    expect(handles.se).toEqual({ x: 216, y: 256, w: 8, h: 8 })
    expect(handles.n).toEqual({ x: 108, y: 196, w: 104, h: 8 })
    expect(handles.e).toEqual({ x: 216, y: 208, w: 8, h: 44 })
  })

  it("sit outside a layer under 24px both ways, covering none of it", () => {
    const layer = { x: 100, y: 200, w: 16, h: 12 }
    const handles = boxes(layer)
    expect(all.filter((edge) => overlaps(handles[edge]!, layer))).toEqual([])
    expect(handles.nw).toEqual({ x: 92, y: 192, w: 8, h: 8 })
    expect(handles.se).toEqual({ x: 116, y: 212, w: 8, h: 8 })
    // The strips run the whole of each side, between the corners.
    expect(handles.n).toEqual({ x: 100, y: 192, w: 16, h: 8 })
    expect(handles.w).toEqual({ x: 92, y: 200, w: 8, h: 12 })
  })

  it("sit outside only along the axis that's small", () => {
    // New project at 50%: wide enough across, but 16px high.
    const layer = { x: 100, y: 200, w: 98, h: 16 }
    const handles = boxes(layer)
    // Only the left and right strips are on it, straddling its ends as on any layer wide enough.
    expect(all.filter((edge) => overlaps(handles[edge]!, layer))).toEqual(["e", "w"])
    expect(handles.n).toEqual({ x: 108, y: 192, w: 82, h: 8 })
    expect(handles.s).toEqual({ x: 108, y: 216, w: 82, h: 8 })
    // Running its whole height, now that the corners are above and below it.
    expect(handles.w).toEqual({ x: 96, y: 200, w: 8, h: 16 })
    expect(handles.ne).toEqual({ x: 194, y: 192, w: 8, h: 8 })
  })

  it("keeps a layer exactly 24px across at the edges, as before", () => {
    const handles = boxes({ x: 0, y: 0, w: 24, h: 24 })
    expect(handles.n).toEqual({ x: 8, y: -4, w: 8, h: 8 })
    expect(handles.e).toEqual({ x: 20, y: 8, w: 8, h: 8 })
  })

  it("puts handles around a layer that draws nothing, outside the point it's at", () => {
    const handles = boxes({ x: 50, y: 50, w: 0, h: 0 })
    expect(handles.n).toEqual({ x: 50, y: 42, w: 0, h: 8 })
    expect(handles.se).toEqual({ x: 50, y: 50, w: 8, h: 8 })
  })

  it("comes back in the order the edges are given, for a frame's three", () => {
    expect(handleBoxes({ x: 0, y: 0, w: 400, h: 300 }, ["e", "s", "se"]).map(({ edge }) => edge)).toEqual([
      "e",
      "s",
      "se"
    ])
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
