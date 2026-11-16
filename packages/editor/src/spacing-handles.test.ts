import type { NodeStyle } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import type { Rect } from "./drop-slot.ts"
import {
  changedSides,
  type PaddingSide,
  pickedSpacing,
  type SpacingEditStart,
  spacingDrag,
  type SpacingHandle,
  spacingHandles,
  type SpacingLayout,
  spacingName,
  spacingScaleName,
  spacingStep,
  typedSpacing
} from "./spacing-handles.ts"

const rect = (left: number, top: number, width: number, height: number): Rect => ({
  left,
  top,
  right: left + width,
  bottom: top + height
})

const sides = (top: number, right = top, bottom = top, left = right): Record<PaddingSide, number> => ({
  top,
  right,
  bottom,
  left
})

// The dashboard's stats row at 100%: padding 16 and 24, three cards 112 by 56, 12 apart.
const stats: SpacingLayout = {
  rect: rect(0, 0, 408, 88),
  border: sides(0),
  padding: sides(16, 24),
  children: [rect(24, 16, 112, 56), rect(148, 16, 112, 56), rect(272, 16, 112, 56)],
  direction: "row",
  oneLine: true
}

const find = (handles: SpacingHandle[], key: string) =>
  handles.find((handle) => (handle.kind === "padding" ? handle.side : `gap ${handle.index}`) === key)!

describe("where the padding and gap handles go", () => {
  it("puts a handle on each side's padding and each gap between children in a line", () => {
    const handles = spacingHandles(stats)
    expect(handles.map((handle) => (handle.kind === "padding" ? handle.side : `gap ${handle.index}`))).toEqual([
      "top",
      "right",
      "bottom",
      "left",
      "gap 0",
      "gap 1"
    ])
  })

  it("centres a padding's bar in it, with its press target clear of the resize strip on the edge", () => {
    const top = find(spacingHandles(stats), "top")
    // The top padding is shaded along the whole edge, 16 deep, its bar centred between the sides' padding.
    expect(top.area).toEqual({ x: 0, y: 0, w: 408, h: 16 })
    expect(top.bar).toEqual({ x: 196, y: 7, w: 16, h: 2 })
    // From 4px inside the edge, past the resize strip, to the padding's inside, 24 along.
    expect(top.hit).toEqual({ x: 192, y: 4, w: 24, h: 12 })
    const right = find(spacingHandles(stats), "right")
    // Corner to corner too, so a side shaded alone reads as Figma's does.
    expect(right.area).toEqual({ x: 384, y: 0, w: 24, h: 88 })
    expect(right.bar).toEqual({ x: 395, y: 36, w: 2, h: 16 })
    expect(right.hit).toEqual({ x: 384, y: 32, w: 20, h: 24 })
  })

  it("keeps a handle on padding of 0, just inside the edge, to drag padding out of nothing", () => {
    const none = { ...stats, padding: sides(0), children: [rect(40, 20, 150, 48), rect(208, 20, 150, 48)] }
    const left = find(spacingHandles(none), "left")
    expect(left.area.w).toBe(0)
    expect(left.hit).toEqual({ x: 4, y: 32, w: 8, h: 24 })
    expect(left.bar.x + left.bar.w / 2).toBe(8)
  })

  it("never covers a child, so a click on one still selects it", () => {
    // Padding of 0 with the children against every edge, as a Titles column's first line is: no padding handles.
    const flush = { ...stats, padding: sides(0), children: [rect(0, 0, 200, 88), rect(208, 0, 200, 88)] }
    expect(spacingHandles(flush).filter((handle) => handle.kind === "padding")).toEqual([])
    // A child 6px from the left edge leaves a target 2px deep, too thin, and one 10px away a target to it.
    const near = (left: number) => ({ ...flush, children: [rect(left, 0, 150, 88)] })
    expect(spacingHandles(near(6)).some((handle) => handle.kind === "padding" && handle.side === "left")).toBe(false)
    expect(find(spacingHandles(near(10)), "left").hit).toEqual({ x: 4, y: 32, w: 6, h: 24 })
    // A child placed absolutely over the top padding cuts that target back to it.
    const badge = { ...stats, covered: [...stats.children, rect(190, 10, 28, 20)] }
    expect(find(spacingHandles(badge), "top").hit).toEqual({ x: 192, y: 4, w: 24, h: 6 })
  })

  it("centres a gap's bar between the children, its press target at least 8 across", () => {
    const gap = find(spacingHandles(stats), "gap 0")
    expect(gap.area).toEqual({ x: 136, y: 16, w: 12, h: 56 })
    expect(gap.bar).toEqual({ x: 141, y: 36, w: 2, h: 16 })
    expect(gap.hit).toEqual({ x: 136, y: 32, w: 12, h: 24 })
    // A gap narrower than that is taken whole, never the children beside it, and one under 4px has none.
    const tight = (gap: number) => ({ ...stats, children: [rect(24, 16, 180, 56), rect(204 + gap, 16, 180 - gap, 56)] })
    expect(find(spacingHandles(tight(6)), "gap 0").hit).toEqual({ x: 204, y: 32, w: 6, h: 24 })
    expect(spacingHandles(tight(2)).some((handle) => handle.kind === "gap")).toBe(false)
  })

  it("follows children drawn in reverse", () => {
    const reversed = { ...stats, children: [...stats.children].reverse() }
    expect(find(spacingHandles(reversed), "gap 0").area).toEqual(find(spacingHandles(stats), "gap 1").area)
  })

  it("puts gaps in a column between the children's bottoms and tops", () => {
    const column: SpacingLayout = {
      ...stats,
      rect: rect(0, 0, 160, 200),
      padding: sides(24),
      children: [rect(24, 24, 112, 40), rect(24, 76, 112, 40)],
      direction: "column"
    }

    expect(find(spacingHandles(column), "gap 0").area).toEqual({ x: 24, y: 64, w: 112, h: 12 })
  })

  it("gives a grid or a wrap no gap handles, and a side too short for its press target none", () => {
    expect(spacingHandles({ ...stats, oneLine: false }).some((handle) => handle.kind === "gap")).toBe(false)
    const short = { ...stats, rect: rect(0, 0, 408, 50), padding: sides(16, 24), children: [] }
    // 50 high less 32 of padding leaves 18 along the left and right, under the press target's 24.
    expect(spacingHandles(short).map((handle) => handle.kind === "padding" && handle.side)).toEqual(["top", "bottom"])
  })

  it("measures inside the border", () => {
    const bordered = { ...stats, border: sides(2) }
    expect(find(spacingHandles(bordered), "top").area).toEqual({ x: 2, y: 2, w: 404, h: 16 })
  })
})

describe("which sides a padding handle changes", () => {
  it("changes its own side, the opposite one too, or every side", () => {
    expect(changedSides("left", { opposite: false, every: false })).toEqual(["left"])
    expect(changedSides("left", { opposite: false, every: false })).toEqual(["left"])
    expect(changedSides("left", { opposite: true, every: false })).toEqual(["left", "right"])
    expect(changedSides("top", { opposite: true, every: false })).toEqual(["top", "bottom"])
    expect(changedSides("top", { opposite: true, every: true })).toEqual(["top", "right", "bottom", "left"])
  })
})

const tokens = [
  { name: "stack-gap", px: 12 },
  { name: "card-padding", px: 24 },
  { name: "card-padding-lg", px: 32 },
  { name: "gutter", px: 32 }
]

const start = (
  handle: SpacingEditStart["handle"],
  style: NodeStyle = { padding: [{ step: 4 }, { step: 6 }], gap: { step: 3 } },
  fields: Partial<SpacingEditStart> = {}
): SpacingEditStart => ({
  handle,
  style,
  drawn: { padding: sides(16, 24), gap: 12 },
  unit: 4,
  scale: 1,
  tokens,
  ...fields
})

const still = { opposite: false, every: false }

describe("dragging a padding or gap handle", () => {
  it("grows padding as its handle goes outwards, away from the content, on every side", () => {
    expect(spacingDrag(start({ kind: "padding", side: "top" }))({ dx: 0, dy: -8, ...still })?.change).toEqual({
      padding: [{ step: 6 }, { step: 6 }, { step: 4 }, { step: 6 }]
    })
    expect(spacingDrag(start({ kind: "padding", side: "bottom" }))({ dx: 0, dy: 8, ...still })?.change).toEqual({
      padding: [{ step: 4 }, { step: 6 }, { step: 6 }, { step: 6 }]
    })
    expect(spacingDrag(start({ kind: "padding", side: "left" }))({ dx: -8, dy: 0, ...still })?.change).toEqual({
      padding: [{ step: 4 }, { step: 6 }, { step: 4 }, { step: 8 }]
    })
    expect(spacingDrag(start({ kind: "padding", side: "right" }))({ dx: 8, dy: 0, ...still })?.change).toEqual({
      padding: [{ step: 4 }, { step: 8 }, { step: 4 }, { step: 6 }]
    })
    // Inwards, it shrinks.
    expect(spacingDrag(start({ kind: "padding", side: "right" }))({ dx: -8, dy: 0, ...still })?.change).toEqual({
      padding: [{ step: 4 }, { step: 4 }, { step: 4 }, { step: 6 }]
    })
  })

  it("grows a gap as its handle goes right in a row or down in a column", () => {
    expect(spacingDrag(start({ kind: "gap", direction: "row" }))({ dx: 8, dy: 30, ...still })).toEqual({
      change: { gap: { step: 5 } },
      px: 20
    })
    expect(spacingDrag(start({ kind: "gap", direction: "column" }))({ dx: 30, dy: -8, ...still })?.change).toEqual({
      gap: { step: 1 }
    })
  })

  it("changes nothing until the pointer has gone four pixels towards or away from the space", () => {
    const drag = spacingDrag(start({ kind: "padding", side: "left" }))
    expect(drag({ dx: -3, dy: 40, ...still })).toBeUndefined()
    expect(drag({ dx: -4, dy: 0, ...still })?.change).toEqual({
      padding: [{ step: 4 }, { step: 6 }, { step: 4 }, { step: 7 }]
    })
    // Once started, coming back within four pixels goes on following the pointer.
    expect(drag({ dx: -1, dy: 0, ...still })?.change).toEqual({ padding: [{ step: 4 }, { step: 6 }] })
  })

  it("goes in whole steps of the scale, never below 0, counting the zoom", () => {
    const drag = spacingDrag(
      start({ kind: "padding", side: "top" }, { padding: [{ step: 4 }, { step: 6 }] }, { scale: 0.5 })
    )

    // 5 screen pixels at 50% is 10 layout pixels: 26, which rounds to 7 steps.
    expect(drag({ dx: 0, dy: -5, ...still })?.change).toEqual({
      padding: [{ step: 7 }, { step: 6 }, { step: 4 }, { step: 6 }]
    })
    expect(drag({ dx: 0, dy: 100, ...still })).toMatchObject({
      change: { padding: [{ step: 0 }, { step: 6 }, { step: 4 }, { step: 6 }] },
      px: 0
    })
  })

  it("gives the opposite side the same value, or every side", () => {
    const drag = spacingDrag(start({ kind: "padding", side: "left" }))
    expect(drag({ dx: -8, dy: 0, opposite: true, every: false })).toEqual({
      change: { padding: [{ step: 4 }, { step: 8 }] },
      px: 32,
      sides: ["left", "right"]
    })
    expect(drag({ dx: -8, dy: 0, opposite: true, every: true })?.change).toEqual({ padding: { step: 8 } })
    // Letting go puts the other sides back.
    expect(drag({ dx: -8, dy: 0, ...still })?.change).toEqual({
      padding: [{ step: 4 }, { step: 6 }, { step: 4 }, { step: 8 }]
    })
  })

  it("keeps a value bound to a token bound wherever it lands on a token's value, its own first", () => {
    const drag = spacingDrag(
      start(
        { kind: "padding", side: "top" },
        { padding: { token: "card-padding" } },
        { drawn: { padding: sides(24), gap: 12 } }
      )
    )

    // 24 + 8 is 32: card-padding-lg and gutter are both 32; the first listed wins.
    expect(drag({ dx: 0, dy: -8, ...still })).toMatchObject({
      change: {
        padding: [
          { token: "card-padding-lg" },
          { token: "card-padding" },
          { token: "card-padding" },
          { token: "card-padding" }
        ]
      },
      token: "card-padding-lg"
    })
    // Between tokens it's steps, and back on its own value it's its own token again.
    expect(drag({ dx: 0, dy: -4, ...still })?.change).toEqual({
      padding: [{ step: 7 }, { token: "card-padding" }, { token: "card-padding" }, { token: "card-padding" }]
    })
    expect(drag({ dx: 0, dy: 0, ...still })?.change).toEqual({ padding: { token: "card-padding" } })

    // Its own token comes before another with the same value.
    const gutter = spacingDrag(
      start(
        { kind: "padding", side: "top" },
        { padding: { token: "gutter" } },
        { drawn: { padding: sides(32), gap: 12 } }
      )
    )

    expect(gutter({ dx: 0, dy: 4, ...still })).toMatchObject({ px: 28 })
    expect(gutter({ dx: 0, dy: 0, ...still })?.token).toBe("gutter")
  })

  it("keeps a number a number, though it lands on a token's value", () => {
    const drag = spacingDrag(
      start({ kind: "gap", direction: "row" }, { gap: { step: 1 } }, { drawn: { padding: sides(0), gap: 4 } })
    )

    expect(drag({ dx: 8, dy: 0, ...still })).toEqual({ change: { gap: { step: 3 } }, px: 12 })
  })

  it("takes a value written out, which has no steps, to steps from where it's drawn, as a token off its value", () => {
    const written = start(
      { kind: "padding", side: "top" },
      { padding: [{ value: "10px" }, { expr: "calc(1rem + 2px)" }], gap: { keyword: "normal" } },
      { drawn: { padding: sides(10, 18), gap: 0 } }
    )

    // 10px drawn and 8px more is 18px, which rounds to 5 steps; the sides it doesn't change stay as they're written.
    expect(spacingDrag(written)({ dx: 0, dy: -8, ...still })).toEqual({
      change: {
        padding: [{ step: 5 }, { expr: "calc(1rem + 2px)" }, { value: "10px" }, { expr: "calc(1rem + 2px)" }]
      },
      px: 20,
      sides: ["top"]
    })
    expect(spacingStep({ ...written, handle: { kind: "gap", direction: "row" } }, 1, still)).toEqual({
      change: { gap: { step: 1 } },
      px: 4
    })
  })

  it("starts a side that's unset from 0", () => {
    const drag = spacingDrag(start({ kind: "padding", side: "left" }, {}, { drawn: { padding: sides(0), gap: 0 } }))
    expect(drag({ dx: -8, dy: 0, ...still })?.change).toEqual({
      padding: [{ step: 0 }, { step: 0 }, { step: 0 }, { step: 2 }]
    })
  })
})

describe("stepping a padding or gap handle from the keyboard", () => {
  it("moves one step, from a half step to the whole step beside it, on the sides held", () => {
    expect(spacingStep(start({ kind: "gap", direction: "row" }), 1, still)).toEqual({
      change: { gap: { step: 4 } },
      px: 16
    })
    expect(spacingStep(start({ kind: "gap", direction: "row" }), 10, still).change).toEqual({ gap: { step: 13 } })

    const half = start(
      { kind: "padding", side: "top" },
      { padding: { step: 1.5 } },
      { drawn: { padding: sides(6), gap: 0 } }
    )

    expect(spacingStep(half, -1, still).change).toEqual({
      padding: [{ step: 1 }, { step: 1.5 }, { step: 1.5 }, { step: 1.5 }]
    })
    expect(spacingStep(half, 1, { opposite: true, every: true }).change).toEqual({ padding: { step: 2 } })
    expect(
      spacingStep(
        start({ kind: "gap", direction: "row" }, { gap: { step: 0 } }, { drawn: { padding: sides(0), gap: 0 } }),
        -1,
        still
      ).change
    ).toEqual({
      gap: { step: 0 }
    })
  })

  it("keeps a token-bound value bound when the step lands on a token", () => {
    const bound = start(
      { kind: "gap", direction: "row" },
      { gap: { token: "stack-gap" } },
      { drawn: { padding: sides(0), gap: 8 } }
    )

    expect(spacingStep(bound, 1, still)).toEqual({
      change: { gap: { token: "stack-gap" } },
      px: 12,
      token: "stack-gap"
    })
  })
})

describe("typing a value after clicking a handle", () => {
  const top = start({ kind: "padding", side: "top" })

  it("reads pixels, rem, maths and tokens as the inspector's fields do", () => {
    expect(typedSpacing(top, "20", still)).toMatchObject({
      change: { padding: [{ step: 5 }, { step: 6 }, { step: 4 }, { step: 6 }] },
      px: 20
    })
    expect(typedSpacing(top, "1.5rem", still)).toMatchObject({
      change: { padding: [{ step: 6 }, { step: 6 }, { step: 4 }, { step: 6 }] },
      px: 24
    })
    expect(typedSpacing(top, "+8", still)).toMatchObject({ px: 24 })
    expect(typedSpacing(top, "card-padding", still)).toEqual({
      change: { padding: [{ token: "card-padding" }, { step: 6 }, { step: 4 }, { step: 6 }] },
      px: 24,
      token: "card-padding",
      sides: ["top"]
    })
  })

  it("changes the sides held at the click", () => {
    expect(typedSpacing(top, "8", { opposite: true, every: false })).toMatchObject({
      change: { padding: [{ step: 2 }, { step: 6 }] }
    })
  })

  it("takes an empty box to 0, and says why it can't read something", () => {
    expect(typedSpacing(top, "", still)).toMatchObject({
      change: { padding: [{ step: 0 }, { step: 6 }, { step: 4 }, { step: 6 }] },
      px: 0
    })
    expect(typedSpacing(top, "abc", still)).toEqual({ reason: `"abc" isn't a valid number` })
    expect(typedSpacing(top, "-8", still)).toMatchObject({ px: 0 })
  })
})

describe("picking a value from the list beside the box", () => {
  it("writes a token by name or a number of steps", () => {
    const gap = start({ kind: "gap", direction: "row" })
    expect(pickedSpacing(gap, "stack-gap", still)).toEqual({
      change: { gap: { token: "stack-gap" } },
      px: 12,
      token: "stack-gap"
    })
    expect(pickedSpacing(gap, 2.5, still)).toEqual({ change: { gap: { step: 2.5 } }, px: 10 })
  })
})

describe("what a handle's label and name say", () => {
  it("names the token a value is bound to, or else its step of the spacing scale", () => {
    expect(spacingScaleName({ px: 24, token: "card-padding" }, 4)).toBe("card-padding")
    expect(spacingScaleName({ px: 16 }, 4)).toBe("spacing-4")
    expect(spacingScaleName({ px: 2 }, 4)).toBe("spacing-0.5")
    expect(spacingScaleName({ px: 16 }, 8)).toBe("spacing-2")
    expect(spacingScaleName({ px: 13 }, 4)).toBeUndefined()
  })

  it("names a padding handle by its side, and gaps in order when there are several", () => {
    expect(spacingName({ kind: "padding", side: "left" })).toBe("Left padding")
    expect(spacingName({ kind: "gap", index: 0 })).toBe("Gap")
    expect(spacingName({ kind: "gap", index: 1 }, 2)).toBe("Gap 2")
  })
})
