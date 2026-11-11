import type { NodeStyle } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import type { FilterEntry, ShadowEntry } from "../controls/lists-data.ts"
import {
  filterEntriesOf,
  filterStyleOf,
  shadowEntriesOf,
  shadowStyleOf,
  transformOf,
  transformValueOf
} from "./effects-values.ts"

const style: NodeStyle = {
  shadow: [
    { kind: "inner", x: 0, y: 1, blur: 2, spread: 0, color: { color: "foreground", alpha: 10 } },
    { kind: "drop", token: "shadow-lg", color: { color: "primary", alpha: 20 } },
    { kind: "ring", width: 2, inset: true, color: { color: "ring" }, off: true }
  ],
  filter: [
    { kind: "blur", value: "blur-sm" },
    { kind: "dropShadow", shadow: { kind: "drop", token: "drop-shadow-md" }, off: true }
  ],
  backdropFilter: [{ kind: "adjust", values: { brightness: -20 } }]
}

describe("the Shadow list", () => {
  it("lists the box's shadows, then the drop shadows that follow the shape", () => {
    expect(shadowEntriesOf(style)).toMatchObject([
      { kind: "inner", layer: { x: 0, y: 1, blur: 2, spread: 0, color: "foreground", alpha: 10 } },
      { kind: "drop", token: "shadow-lg", colorOverride: { color: "primary", alpha: 20 } },
      { kind: "ring", width: 2, inset: true, off: true, layer: { color: "ring" } },
      { kind: "drop", token: "drop-shadow-md", follow: true, off: true }
    ])
  })

  it("lists one shadow token as a drop shadow", () => {
    expect(shadowEntriesOf({ shadow: "shadow-sm" })).toMatchObject([{ kind: "drop", token: "shadow-sm" }])
  })

  it("writes back what it read, keeping the layer's other filters", () => {
    expect(shadowStyleOf(shadowEntriesOf(style), style)).toEqual({
      shadow: style.shadow,
      filter: [style.filter![0], style.filter![1]]
    })
  })

  it("puts a drop shadow that follows the shape in the filter, and unsets what's left empty", () => {
    const follow: ShadowEntry = {
      id: "a",
      kind: "drop",
      follow: true,
      layer: { x: 0, y: 2, blur: 4, spread: 0, color: "foreground" }
    }

    expect(shadowStyleOf([follow], {})).toEqual({
      shadow: undefined,
      filter: [
        { kind: "dropShadow", shadow: { kind: "drop", x: 0, y: 2, blur: 4, spread: 0, color: { color: "foreground" } } }
      ]
    })
    expect(shadowStyleOf([], {})).toEqual({ shadow: undefined, filter: undefined })
  })
})

describe("the Filter list", () => {
  it("lists the layer's blurs and adjustments, then those behind it, leaving drop shadows to the Shadow list", () => {
    expect(filterEntriesOf(style)).toMatchObject([
      { kind: "blur", value: "blur-sm" },
      { kind: "adjust", behind: true, values: { brightness: -20 } }
    ])
  })

  it("writes back what it read, keeping the layer's drop shadows after its filters", () => {
    expect(filterStyleOf(filterEntriesOf(style), style)).toEqual({
      filter: [style.filter![0], style.filter![1]],
      backdropFilter: style.backdropFilter
    })
  })

  it("writes nothing for a blur with no token yet", () => {
    const entries: FilterEntry[] = [
      { id: "a", kind: "backdropBlur", value: { px: 6 } },
      { id: "b", kind: "blur", value: undefined }
    ]

    expect(filterStyleOf(entries, {})).toEqual({ filter: undefined, backdropFilter: undefined })
  })
})

describe("Transform", () => {
  it("shows moves in px, and scale as a size and a flip", () => {
    expect(
      transformValueOf({ x: 2, y: { percent: -50 }, scaleX: -150, scaleY: 150, origin: { x: 0, y: 100 } }, 4)
    ).toEqual({
      moveX: { px: 8 },
      moveY: { percent: -50 },
      scaleX: 150,
      flipX: true,
      scaleY: 150,
      scaleLinked: true,
      origin: { x: 0, y: 100 }
    })
  })

  it("shows a move by a length token as what it comes to", () => {
    expect(transformValueOf({ x: "gutter" }, 4, (name) => (name === "gutter" ? 24 : undefined))).toEqual({
      moveX: { px: 24 }
    })
  })

  it("writes moves as steps, a flip as a negative scale, and keeps rotation and skew", () => {
    expect(
      transformOf({ moveX: { px: 8 }, flipY: true, origin: { x: 50, y: 0 } }, { rotate: 45, skewY: 5, x: 1 }, 4)
    ).toEqual({ rotate: 45, skewY: 5, x: 2, scaleY: -100, origin: { x: 50, y: 0 } })
  })

  it("unsets the transform when nothing is left", () => {
    expect(transformOf({}, { x: 2 }, 4)).toBeUndefined()
  })
})
