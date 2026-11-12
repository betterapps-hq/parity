import type { ContainerSpec } from "@parity-app/core"
import { absoluteDrag, layerResize, resizeStart, type SnapBox } from "@parity-app/editor"
import { describe, expect, it } from "vite-plus/test"
import {
  areaSpaceAt,
  type ElementGeometry,
  type FrameGeometry,
  insetsWithin,
  insideOf,
  type NodeGeometry,
  type Sides
} from "./frame-geometry.ts"
import { insetSteps, resizeBoxes, snapScene, spacingMeasure } from "./layer-measure.ts"

// What a layer's gestures start from, from a frame's geometry written out as plain boxes: no browser lays anything
// out here. Each is checked at several scales, the camera's zoom times the frame's own, since what a gesture writes is
// in the design's pixels however big the frame is drawn.

const noSides: Sides = { left: 0, top: 0, right: 0, bottom: 0 }
const scales = [0.1, 0.37, 1, 2.6]

/** Pixels in a step of the spacing scale. */
const unit = 4

/**
 * Calendar's day as a frame draws it at `scale`, its corner at (120, 80) on screen. The day is a layout 16px in and
 * 200px down, with a 4px border; inside it Review is placed absolutely, 160px down and stretched between its sides,
 * with Lunch 32px below it and a slot that isn't drawn.
 */
function calendar(scale: number): FrameGeometry {
  const rect = { left: 120, top: 80, right: 120 + 832 * scale, bottom: 80 + 900 * scale }

  const screen = ({ x, y, w, h }: SnapBox) => ({
    left: rect.left + x * scale,
    top: rect.top + y * scale,
    right: rect.left + (x + w) * scale,
    bottom: rect.top + (y + h) * scale
  })

  const element = (at: SnapBox, border = noSides, padding = noSides): ElementGeometry => {
    const borderBox = screen(at)
    const paddingBox = insideOf(borderBox, border, scale)

    return { borderBox, scale, border, padding, paddingBox, contentBox: insideOf(paddingBox, padding, scale) }
  }

  const day = element({ x: 16, y: 200, w: 208, h: 568 }, { left: 4, top: 4, right: 4, bottom: 4 })

  const placed = (at: SnapBox): NodeGeometry => {
    const own = element(at)

    return {
      ...own,
      box: own.borderBox,
      hasElement: true,
      parentContentBox: day.contentBox,
      offsetBox: day.paddingBox,
      insets: insetsWithin(own.borderBox, day.paddingBox, day.scale)
    }
  }

  const nodes = new Map<string, NodeGeometry>([
    [
      "day",
      {
        ...day,
        box: day.borderBox,
        hasElement: true,
        parentContentBox: undefined,
        offsetBox: undefined,
        insets: undefined
      }
    ],
    ["review", placed({ x: 20, y: 364, w: 200, h: 64 })],
    ["lunch", placed({ x: 20, y: 460, w: 200, h: 48 })],
    // Hidden in this state: an empty box at the frame's corner.
    ["focus", placed({ x: 0, y: 0, w: 0, h: 0 })]
  ])

  return { rect, scale, node: (id) => nodes.get(id), element: () => day }
}

const design: ContainerSpec = {
  id: "calendar",
  name: "Calendar",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "root",
    children: [
      {
        type: "layout",
        id: "day",
        children: [
          {
            type: "text",
            id: "review",
            text: "Review",
            style: {
              position: "absolute",
              top: { step: 40 },
              left: { step: 0 },
              right: { step: 0 },
              height: { step: 16 }
            }
          },
          {
            type: "text",
            id: "lunch",
            text: "Lunch",
            style: { position: "absolute", top: { step: 64 }, left: { step: 0 }, right: { step: 0 } }
          },
          {
            type: "text",
            id: "focus",
            text: "Focus",
            style: { position: "absolute", top: { step: 0 }, left: { step: 0 } }
          }
        ]
      }
    ]
  },
  states: [{ id: "default", name: "Default" }]
}

/** Each number of a box to the nearest millionth of a pixel, past what a scale's rounding leaves. */
const near = (box: SnapBox) => ({
  x: expect.closeTo(box.x, 6),
  y: expect.closeTo(box.y, 6),
  w: expect.closeTo(box.w, 6),
  h: expect.closeTo(box.h, 6)
})

describe("where an absolutely placed layer's sides are drawn", () => {
  it("is in half steps of the spacing scale from the inside of its containing block's border, at any scale", () => {
    for (const scale of scales) {
      const insets = calendar(scale).node("review")!.insets!

      expect(insetSteps(insets, unit)).toEqual({ left: 0, top: 40, right: 0, bottom: 84 })
    }
  })

  it("goes to the nearest half step", () => {
    expect(insetSteps({ left: 5, top: 6.9, right: 0.9, bottom: -3.2 }, unit)).toEqual({
      left: 1.5,
      top: 1.5,
      right: 0,
      bottom: -1
    })
  })
})

describe("what a layer snaps to", () => {
  it("is its box, its drawn siblings' and the box its insets count from, in the frame's own pixels", () => {
    for (const scale of scales) {
      const measured = snapScene(calendar(scale), design, "review")!

      expect(measured.box).toEqual(near({ x: 20, y: 364, w: 200, h: 64 }))
      // Focus isn't drawn, so it's nothing to snap to.
      expect(measured.scene.siblings).toEqual([near({ x: 20, y: 460, w: 200, h: 48 })])
      expect(measured.scene.parent).toEqual(near({ x: 20, y: 204, w: 200, h: 560 }))
    }
  })

  it("is nothing for a layer that isn't drawn, has no containing block or isn't in the design", () => {
    const frame = calendar(1)

    expect(snapScene({ ...frame, node: () => undefined }, design, "review")).toBeUndefined()
    expect(snapScene(frame, design, "day")).toBeUndefined()
    expect(snapScene(frame, design, "gone")).toBeUndefined()
  })
})

describe("dragging an absolutely placed layer from what its frame measured", () => {
  it("moves by the same steps however big the frame is drawn, and snaps to the same sibling", () => {
    const shown = resizeStart(design, "review", { state: design.states[0]! })!

    for (const scale of scales) {
      const frame = calendar(scale)

      const follow = absoluteDrag({
        style: shown.style,
        drawn: insetSteps(frame.node("review")!.insets!, unit),
        unit,
        scale: frame.scale,
        snapping: snapScene(frame, design, "review")
      })

      // 120 of the design's pixels down, well clear of Lunch: 30 steps.
      expect(follow({ dx: 0, dy: 120 * scale, snaps: false }).change).toEqual({ top: { step: 70 } })
      // 30 of the design's pixels up from under Lunch, 2 short of touching it: its top locks to Lunch's bottom.
      expect(follow({ dx: 0, dy: 142 * scale, snaps: true }).change).toEqual({ top: { step: 76 } })
    }
  })
})

describe("what resizing a layer starts from", () => {
  it("is its box, its parent's content box and, placed absolutely, where its sides are drawn", () => {
    const frame = calendar(0.5)
    const review = frame.node("review")!

    expect(resizeBoxes(review, true, unit)).toEqual({
      rect: review.box,
      inner: frame.node("day")!.contentBox,
      drawn: { left: 0, top: 40, right: 0, bottom: 84 }
    })
  })

  it("leaves out the insets of a layer in a layout, and the parent the design's root doesn't have", () => {
    const day = calendar(0.5).node("day")!

    expect(resizeBoxes(calendar(0.5).node("review")!, false, unit).drawn).toBeUndefined()
    expect(resizeBoxes(day, false, unit)).toEqual({ rect: day.box, inner: undefined, drawn: undefined })
  })

  it("resizes by the same steps however big the frame is drawn", () => {
    const shown = resizeStart(design, "review", { state: design.states[0]! })!

    for (const scale of scales) {
      const frame = calendar(scale)

      const resize = layerResize({
        edge: "s",
        layer: shown,
        ...resizeBoxes(frame.node("review")!, true, unit),
        scale: frame.scale,
        unit,
        snapping: snapScene(frame, design, "review")
      })

      // The drag starts once the pointer has moved 4 pixels on screen, which is further in a frame drawn small.
      resize({ dx: 0, dy: 200 * scale, shift: false, snaps: false })
      // The bottom handle dragged 31 of the design's pixels: its edge, 1 from Lunch's top, locks there, 24 steps high.
      // How near it has to come is in screen pixels, so one of the design's is near enough at every scale here.
      expect(resize({ dx: 0, dy: 31 * scale, shift: false, snaps: true }).style).toEqual({ height: { step: 24 } })
      // Without snapping it goes where the pointer is: 28 of the design's pixels taller, 7 steps.
      expect(resize({ dx: 0, dy: 28 * scale, shift: false, snaps: false }).style).toEqual({ height: { step: 23 } })
    }
  })
})

describe("a layout measured for its padding and gap handles", () => {
  const border = { left: 1, top: 1, right: 1, bottom: 1 }
  const padding = { left: 16, top: 8, right: 16, bottom: 8 }
  const space = areaSpaceAt({ left: 100, top: 50 })
  const flow = { direction: "row", oneLine: true, gap: 12 } as const

  const layout = (scale: number): ElementGeometry => {
    const borderBox = { left: 300, top: 150, right: 300 + 400 * scale, bottom: 150 + 100 * scale }
    const paddingBox = insideOf(borderBox, border, scale)

    return { borderBox, scale, border, padding, paddingBox, contentBox: insideOf(paddingBox, padding, scale) }
  }

  it("draws its border and padding at its own scale, in the overlay's pixels, and keeps what they're written as", () => {
    const measured = spacingMeasure(layout(0.5), [], flow, space)

    expect(measured.layout.rect).toEqual({ left: 200, top: 100, right: 400, bottom: 150 })
    expect(measured.layout.border).toEqual({ left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 })
    expect(measured.layout.padding).toEqual({ left: 8, top: 4, right: 8, bottom: 4 })
    expect(measured.drawn).toEqual({ padding, gap: 12 })
    expect(measured.scale).toBe(0.5)
    expect(measured.layout).toMatchObject({ direction: "row", oneLine: true })
  })

  it("keeps a child placed absolutely out of the flow, but still covered", () => {
    const flowing = { left: 310, top: 160, right: 350, bottom: 190 }
    const badge = { left: 480, top: 150, right: 500, bottom: 160 }

    const measured = spacingMeasure(
      layout(0.5),
      [
        { box: flowing, flows: true },
        { box: badge, flows: false }
      ],
      flow,
      space
    )

    expect(measured.layout.children).toEqual([space.rect(flowing)])
    expect(measured.layout.covered).toEqual([space.rect(flowing), space.rect(badge)])
  })
})
