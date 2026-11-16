import { describe, expect, it } from "vite-plus/test"
import { kindColors } from "./kinds.tsx"
import type { SpacingMeasure } from "./layer-measure.ts"
import { type FrameBox, type OverlayScene, overlayMarks, type SceneLayer } from "./overlay-marks.ts"

// What the canvas's overlay draws, from boxes written out as plain data (PAR-986): no browser lays anything out here.
// Reading the boxes from the page is `readScene` in CanvasOverlay.tsx, which CanvasOverlay.test.ts drives in Chrome.

const design = "app.par#dash"

/** The dashboard's Default frame, picked, drawn at twice its size; and its Loading frame beside it, at the same size. */
const shown: FrameBox = { mode: "desktop", state: "default", box: { x: 40, y: 40, w: 800, h: 600 }, scale: 2 }
const loading: FrameBox = { mode: "desktop", state: "loading", box: { x: 880, y: 40, w: 800, h: 600 }, scale: 2 }

/** A layer of the dashboard, in both frames, at the same place in each. */
function layer(id: string, box: { x: number; y: number; w: number; h: number }, extra: Partial<SceneLayer> = {}) {
  return {
    id,
    name: id,
    color: kindColors.layer,
    inner: false,
    boxes: [
      { ...shown, box, picked: true },
      { ...loading, box: { ...box, x: box.x + 840 }, picked: false }
    ],
    ...extra
  } satisfies SceneLayer
}

const card = layer("card", { x: 100, y: 120, w: 300, h: 200 })
const chart = layer("chart", { x: 100, y: 360, w: 600, h: 240 })

/** The dashboard selected with the Move tool, and whatever else a test gives. */
function scene(change: Partial<OverlayScene> = {}): OverlayScene {
  return {
    tool: "select",
    design: { key: design, kind: "screen", locked: false, frames: [], picked: shown },
    layers: [],
    locked: false,
    slots: [],
    alt: false,
    snaps: [],
    unit: 4,
    ...change
  }
}

describe("a selected layer", () => {
  const marks = overlayMarks(scene({ node: "card", layers: [card] }))

  it("is outlined thick in the frame it was picked in, and dashed in the design's other frames", () => {
    expect(marks.outlines).toEqual([
      { key: "sel:card:desktop:default", box: card.boxes[0]!.box, color: kindColors.layer, dashed: false, thick: true },
      { key: "sel:card:desktop:loading", box: card.boxes[1]!.box, color: kindColors.layer, dashed: true, thick: false }
    ])
  })

  it("is named, with its size in the design's pixels, not the screen's", () => {
    expect(marks.label).toEqual({ box: card.boxes[0]!.box, name: "card", size: "150 × 100", color: kindColors.layer })
  })

  it("takes resize handles on every side, in the frame it was picked in", () => {
    expect(marks.handles).toEqual([
      expect.objectContaining({ kind: "node", key: "node", box: card.boxes[0]!.box, mode: "desktop", state: "default" })
    ])
    expect(marks.handles[0]!.edges).toHaveLength(8)
  })

  it("takes no handles while locked, inside an instance, while dragged, or with another tool", () => {
    const inner = layer("stat/card", card.boxes[0]!.box, { inner: true, color: kindColors.component })

    for (const without of [
      scene({ node: "card", layers: [card], locked: true }),
      scene({ node: "stat/card", layers: [inner] }),
      scene({ node: "card", layers: [card], drag: { line: { x: 0, y: 0, w: 2, h: 40 } } }),
      scene({ node: "card", layers: [card], tool: "hand" })
    ]) {
      const drawn = overlayMarks(without)
      expect(drawn.handles).toEqual([])
      expect(drawn.label?.name).toBe(without.node)
    }
  })
})

describe("several selected layers", () => {
  it("have one box around them, counted, with handles that resize them together", () => {
    const marks = overlayMarks(scene({ node: "chart", layers: [card, chart] }))
    const around = { x: 100, y: 120, w: 600, h: 480 }

    expect(marks.outlines.at(-1)).toEqual({
      key: "union",
      box: around,
      color: kindColors.layer,
      dashed: false,
      thick: false
    })
    expect(marks.label).toEqual({
      box: around,
      name: "2 layers",
      size: "300 × 240",
      color: kindColors.layer,
      counted: true
    })
    expect(marks.handles).toEqual([expect.objectContaining({ key: "union", box: around, nodes: ["card", "chart"] })])
  })

  it("aren't resized together when one is inside an instance", () => {
    const inner = layer("stat/value", { x: 500, y: 120, w: 100, h: 40 }, { inner: true })

    expect(overlayMarks(scene({ node: "card", layers: [card, inner] })).handles).toEqual([])
  })
})

describe("a selected design, with no layer selected", () => {
  it("takes handles on each of its frames, and a frame's size under it", () => {
    const marks = overlayMarks(
      scene({ design: { key: design, kind: "frame", locked: false, frames: [shown, loading] } })
    )

    expect(marks.handles.map(({ key, box, label }) => ({ key, box, label }))).toEqual([
      { key: "frame:desktop:default", box: shown.box, label: "Drag to resize the frame" },
      { key: "frame:desktop:loading", box: loading.box, label: "Drag to resize the frame" }
    ])
    expect(marks.frameSize).toEqual({ box: shown.box, size: "400 × 300", color: kindColors.layer })
  })

  it("takes no handles while locked, and has no size under it as a screen", () => {
    const marks = overlayMarks(scene({ design: { key: design, kind: "screen", locked: true, frames: [shown] } }))

    expect(marks.handles).toEqual([])
    expect(marks.frameSize).toBeUndefined()
  })
})

describe("a hovered layer", () => {
  const hover = { box: { x: 100, y: 360, w: 600, h: 240 }, color: kindColors.text, scale: 2, inPicked: true }

  it("is outlined, and measured from the selected layer with Alt, in the design's pixels", () => {
    const marks = overlayMarks(scene({ node: "card", layers: [card], hover, alt: true }))

    expect(marks.outlines.at(-1)).toEqual({
      key: "hover",
      box: hover.box,
      color: kindColors.text,
      dashed: false,
      thick: false
    })
    // The card's bottom is at 320 and the chart's top at 360: 40 screen pixels, 20 of the design's, five steps of 4.
    expect(marks.redlines).toContainEqual({ x1: 250, y1: 320, x2: 250, y2: 360, px: 20, steps: 5 })
  })

  it("has no redlines without Alt", () => {
    expect(overlayMarks(scene({ node: "card", layers: [card], hover })).redlines).toEqual([])
  })

  it("is measured from the selected layer as its own frame draws it, when that's another frame", () => {
    const from = { x: 100, y: 300, w: 300, h: 20 }

    const marks = overlayMarks(
      scene({ node: "card", layers: [card], hover: { ...hover, inPicked: false, from }, alt: true })
    )

    expect(marks.redlines).toContainEqual({ x1: 250, y1: 320, x2: 250, y2: 360, px: 20, steps: 5 })
  })

  it("is measured to its parent's edges with nothing selected", () => {
    const parent = { x: 80, y: 340, w: 640, h: 280 }

    const nothingSelected: OverlayScene = {
      tool: "select",
      layers: [],
      locked: false,
      slots: [],
      snaps: [],
      unit: 4,
      alt: true
    }

    const marks = overlayMarks({ ...nothingSelected, hover: { ...hover, parent } })

    expect(marks.redlines.map(({ px }) => px)).toEqual([10, 10, 10, 10])
  })
})

describe("a layer snapping", () => {
  it("shows its distances in place of Alt's, leaving out those too short to see", () => {
    const hover = { box: chart.boxes[0]!.box, color: kindColors.layer, scale: 2, inPicked: true }

    const snaps = [
      { from: { x: 100, y: 320 }, to: { x: 100, y: 360 }, length: 20 },
      { from: { x: 400, y: 200 }, to: { x: 400.2, y: 200 }, length: 0.1 }
    ]

    const marks = overlayMarks(scene({ node: "card", layers: [card], hover, alt: true, snaps }))

    expect(marks.redlines).toEqual([{ x1: 100, y1: 320, x2: 100, y2: 360, px: 20, steps: 5 }])
  })
})

describe("a selected layout's padding and gaps", () => {
  const measure: SpacingMeasure = {
    layout: {
      rect: { left: 100, top: 120, right: 400, bottom: 320 },
      border: { top: 0, right: 0, bottom: 0, left: 0 },
      padding: { top: 32, right: 32, bottom: 32, left: 32 },
      children: [],
      direction: "column",
      oneLine: true
    },
    drawn: { padding: { top: 16, right: 16, bottom: 16, left: 16 }, gap: 8 },
    scale: 2
  }

  const spacing = { target: { design, mode: "desktop", state: "default", node: "card" }, measure }

  it("take handles with the Move tool", () => {
    expect(overlayMarks(scene({ node: "card", layers: [card], spacing })).spacingHandles).toEqual(spacing)
  })

  it("take none inside an instance, while locked or dragged, or with another tool", () => {
    const inner = layer("stat/card", card.boxes[0]!.box, { inner: true })

    for (const without of [
      scene({ node: "stat/card", layers: [inner], spacing }),
      scene({ node: "card", layers: [card], spacing, locked: true }),
      scene({ node: "card", layers: [card], spacing, drag: { line: { x: 0, y: 0, w: 2, h: 40 } } }),
      scene({ node: "card", layers: [card], spacing, tool: "interact" })
    ]) {
      expect(overlayMarks(without).spacingHandles).toBeUndefined()
    }
  })
})

describe("a component's slots", () => {
  const slots = [{ id: "body", name: "children", box: { x: 120, y: 140, w: 260, h: 160 } }]

  it("are outlined and named in the frame it was picked in", () => {
    expect(overlayMarks(scene({ slots })).slots).toEqual([{ key: "slot:body", box: slots[0]!.box, name: "children" }])
  })

  it("aren't shown while a layer is dragged", () => {
    expect(overlayMarks(scene({ slots, drag: { ghost: { x: 0, y: 0, w: 10, h: 10 } } })).slots).toBeUndefined()
  })
})

describe("the layout grid", () => {
  it("lays 4 columns over a phone's frame and 12 over a desktop's, at the frame's scale", () => {
    const phone = {
      key: `${design}:phone:default`,
      mode: "phone",
      state: "default",
      box: { x: 0, y: 0, w: 750, h: 1600 },
      scale: 2
    }

    const wide = { ...phone, key: `${design}:desktop:default`, box: { x: 800, y: 0, w: 1440, h: 900 }, scale: 1 }
    const columns = overlayMarks(scene({ grid: [phone, wide] })).columns!

    expect(columns.filter(({ key }) => key.startsWith(phone.key))).toHaveLength(4)
    expect(columns.filter(({ key }) => key.startsWith(wide.key))).toHaveLength(12)
    // 375 wide in the design: 16 of margin, then (375 - 32 - 48) / 4 = 73.75 a column, drawn twice as big.
    expect(columns[0]).toEqual({ key: `${phone.key}:0`, box: { x: 32, y: 0, w: 147.5, h: 1600 } })
  })

  it("is off with View > Layout grid off", () => {
    expect(overlayMarks(scene()).columns).toBeUndefined()
  })
})
