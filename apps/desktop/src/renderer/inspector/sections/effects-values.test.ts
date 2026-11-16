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
  boxShadow: [
    { type: "inner", x: 0, y: 1, blur: 2, spread: 0, color: { token: "foreground", alpha: { step: 10 } } },
    { type: "drop", token: "shadow-lg", color: { token: "primary", alpha: { step: 20 } } },
    { type: "ring", width: 2, inset: true, color: { token: "ring" }, off: true }
  ],
  filter: [
    { type: "blur", value: { token: "blur-sm" } },
    { type: "dropShadow", shadow: { type: "drop", token: "drop-shadow-md" }, off: true }
  ],
  backdropFilter: [{ type: "adjust", values: { brightness: -20 } }]
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
    expect(shadowEntriesOf({ boxShadow: [{ type: "drop", token: "shadow-sm" }] })).toMatchObject([
      { kind: "drop", token: "shadow-sm" }
    ])
  })

  it("shows a color written out as its text, and keeps one no field edits as it was stored", () => {
    const written: NodeStyle = {
      boxShadow: [
        { type: "ring", width: 1, color: { value: "#2563eb" } },
        { type: "ring", width: 2, color: { keyword: "currentColor" } }
      ]
    }

    const entries = shadowEntriesOf(written)

    expect(entries).toMatchObject([{ layer: { color: "#2563eb" } }, { layer: { color: "currentColor" } }])
    expect(shadowStyleOf([{ ...entries[0]!, width: 4 }, entries[1]!], written).boxShadow).toEqual([
      { type: "ring", width: 4, color: { value: "#2563eb" } },
      written.boxShadow![1]
    ])
  })

  it("writes back what it read, keeping the layer's other filters", () => {
    expect(shadowStyleOf(shadowEntriesOf(style), style)).toEqual({
      boxShadow: style.boxShadow,
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
      boxShadow: undefined,
      filter: [
        { type: "dropShadow", shadow: { type: "drop", x: 0, y: 2, blur: 4, spread: 0, color: { token: "foreground" } } }
      ]
    })
    expect(shadowStyleOf([], {})).toEqual({ boxShadow: undefined, filter: undefined })
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

  it("keeps a blur written out, which no field edits, when another filter changes", () => {
    const written: NodeStyle = {
      filter: [{ type: "blur", value: { value: "6px" } }],
      backdropFilter: [
        { type: "blur", value: { expr: "calc(var(--blur-sm) * 2)" } },
        { type: "adjust", values: { contrast: 10 } }
      ]
    }

    const entries = filterEntriesOf(written)

    expect(entries).toMatchObject([
      { kind: "blur", value: { px: 6 } },
      { kind: "custom", behind: true, text: "blur(calc(var(--blur-sm) * 2))" },
      { kind: "adjust", behind: true }
    ])
    expect(filterStyleOf([entries[0]!, entries[1]!, { ...entries[2]!, off: true }], written)).toEqual({
      filter: written.filter,
      backdropFilter: [written.backdropFilter![0], { ...written.backdropFilter![1], off: true }]
    })
  })
})

describe("Transform", () => {
  it("shows moves in px, and scale as a size and a flip", () => {
    expect(
      transformValueOf(
        {
          translate: { x: { step: 2 }, y: { value: "-50%" } },
          scale: { x: -150, y: 150 },
          transformOrigin: { x: 0, y: 100 }
        },
        4
      )
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
    expect(
      transformValueOf({ translate: { x: { token: "gutter" } } }, 4, (name) => (name === "gutter" ? 24 : undefined))
    ).toEqual({ moveX: { px: 24 } })
  })

  it("writes moves as steps, a flip as a negative scale, and leaves rotation and skew alone", () => {
    expect(
      transformOf(
        { moveX: { px: 8 }, flipY: true, origin: { x: 50, y: 0 } },
        { rotate: 45, transform: [{ type: "skewY", value: 5 }], translate: { x: { step: 1 } } },
        4
      )
    ).toEqual({ translate: { x: { step: 2 } }, scale: { y: -100 }, transformOrigin: { x: 50, y: 0 } })
  })

  it("writes a move in percent as a length, and keeps a move it didn't change as it was stored", () => {
    const tokenPx = (name: string) => (name === "gutter" ? 24 : undefined)
    const under = { translate: { x: { token: "gutter" }, y: { expr: "clamp(1rem, 2vw, 2rem)" } } }
    const shown = transformValueOf(under, 4, tokenPx)

    expect(transformOf({ ...shown, scaleX: 50 }, under, 4, tokenPx)).toEqual({
      translate: under.translate,
      scale: { x: 50 },
      transformOrigin: undefined
    })
    expect(transformOf({ moveY: { percent: 50 } }, {}, 4).translate).toEqual({ y: { value: "50%" } })
  })

  it("unsets each transform key when nothing is left of it", () => {
    expect(transformOf({}, { translate: { x: { step: 2 } } }, 4)).toEqual({
      translate: undefined,
      scale: undefined,
      transformOrigin: undefined
    })
  })
})
