import { describe, expect, it } from "vite-plus/test"
import {
  fieldLength,
  fieldSize,
  isFill,
  isHug,
  isNamedLength,
  lengthField,
  lengthSteps,
  lengthToken,
  nodeStyle,
  styleKeys
} from "./model.ts"

/** The messages a style was refused with, each after the path it's at. */
function problems(result: ReturnType<typeof nodeStyle.safeParse>): string[] {
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
}

describe("nodeStyle", () => {
  it("reads a style and leaves out what's set to undefined, as JSON does", () => {
    expect(
      nodeStyle.parse({ gap: { step: 4 }, padding: [{ step: 2 }, { token: "gutter" }], fills: undefined })
    ).toEqual({
      gap: { step: 4 },
      padding: [{ step: 2 }, { token: "gutter" }]
    })
  })

  it("refuses a key it doesn't know", () => {
    expect(nodeStyle.safeParse({ colour: "red" }).success).toBe(false)
  })

  it.each([
    ["steps", { step: 4 }],
    ["steps of none", { step: 0 }],
    ["part of a step", { step: 0.5 }],
    ["a token", { token: "gutter" }],
    ["a value", { value: "280px" }],
    ["a keyword", { keyword: "auto" }],
    ["an expression", { expr: "clamp(1rem, 2vw, 2rem)" }]
  ])("takes a length as %s", (_name, length) => {
    const style = { gap: length, minWidth: length, top: length, translate: { x: length } }

    expect(nodeStyle.parse(style)).toEqual(style)
  })

  it("refuses a length with two forms, an empty one, or steps that aren't a number", () => {
    expect(nodeStyle.safeParse({ gap: { step: 4, token: "gutter" } }).success).toBe(false)
    expect(nodeStyle.safeParse({ gap: { token: "" } }).success).toBe(false)
    expect(nodeStyle.safeParse({ gap: { value: "" } }).success).toBe(false)
    expect(nodeStyle.safeParse({ gap: { step: "4" } }).success).toBe(false)
    expect(nodeStyle.safeParse({ gap: {} }).success).toBe(false)
  })

  it("takes a size as a length, as hug, or as fill with the share it takes", () => {
    const sizes = [
      { step: 20 },
      { token: "container-sm" },
      { value: "50%" },
      { keyword: "auto" },
      { expr: "calc(100% - 2rem)" },
      { size: "hug" },
      { size: "fill" },
      { size: "fill", share: 2 }
    ]

    for (const size of sizes) {
      expect(nodeStyle.parse({ width: size, height: size })).toEqual({ width: size, height: size })
    }
  })

  it("refuses a share on hug, a share of none, a size it doesn't know, and a size where a length goes", () => {
    expect(nodeStyle.safeParse({ width: { size: "hug", share: 2 } }).success).toBe(false)
    expect(nodeStyle.safeParse({ width: { size: "fill", share: 0 } }).success).toBe(false)
    expect(nodeStyle.safeParse({ width: { size: "stretch" } }).success).toBe(false)
    expect(nodeStyle.safeParse({ minWidth: { size: "fill" } }).success).toBe(false)
    expect(nodeStyle.safeParse({ gap: { size: "hug" } }).success).toBe(false)
  })

  it("refuses a value in the form before this one, saying what it takes", () => {
    expect(problems(nodeStyle.safeParse({ gap: 4 }))).toEqual([
      "gap: expected { step }, { token }, { value }, { keyword } or { expr }"
    ])
    expect(problems(nodeStyle.safeParse({ gap: "gutter" }))).toEqual([
      "gap: expected { step }, { token }, { value }, { keyword } or { expr }"
    ])
    expect(problems(nodeStyle.safeParse({ width: "fill" }))).toEqual([
      "width: expected { step }, { token }, { value }, { keyword } or { expr }, or { size }"
    ])
    expect(problems(nodeStyle.safeParse({ height: "hug" }))).toEqual([
      "height: expected { step }, { token }, { value }, { keyword } or { expr }, or { size }"
    ])
    expect(problems(nodeStyle.safeParse({ zIndex: 10 }))).toEqual(["zIndex: expected { step } or { token }"])
    expect(problems(nodeStyle.safeParse({ borderRadius: "radius-lg" }))).toEqual([
      "borderRadius: expected { token }, { value }, { keyword } or { expr }"
    ])
    expect(problems(nodeStyle.safeParse({ color: "primary" }))).toEqual([
      "color: expected { token }, { value }, { keyword } or { expr }"
    ])
    expect(problems(nodeStyle.safeParse({ lineHeight: "leading-6" }))).toEqual([
      "lineHeight: expected { step }, { token }, { value }, { keyword } or { expr }"
    ])
  })

  it.each([
    "direction",
    "columns",
    "rows",
    "align",
    "justify",
    "wrap",
    "self",
    "background",
    "foreground",
    "border",
    "radius",
    "shadow",
    "font",
    "size",
    "weight",
    "leading",
    "tracking",
    "decoration",
    "italic",
    "lines",
    "transitions"
  ])("refuses %s, a key of the form before this one", (key) => {
    expect(styleKeys).not.toContain(key)
    expect(nodeStyle.safeParse({ [key]: "row" }).success).toBe(false)
    expect(nodeStyle.safeParse({ [key]: 3 }).success).toBe(false)
    expect(nodeStyle.safeParse({ [key]: true }).success).toBe(false)
  })

  it("refuses the values the keys that kept their names no longer take", () => {
    expect(nodeStyle.safeParse({ justifyContent: "between" }).success).toBe(false)
    expect(nodeStyle.safeParse({ overflow: "scroll" }).success).toBe(false)
    expect(nodeStyle.safeParse({ flexWrap: true }).success).toBe(false)
    expect(nodeStyle.safeParse({ fontStyle: true }).success).toBe(false)
    expect(nodeStyle.safeParse({ transform: { x: 4, rotate: 45 } }).success).toBe(false)
    expect(nodeStyle.safeParse({ fills: "card" }).success).toBe(false)
    expect(nodeStyle.safeParse({ boxShadow: "shadow-md" }).success).toBe(false)
    expect(nodeStyle.safeParse({ fills: [{ kind: "solid", color: { token: "card" } }] }).success).toBe(false)
    expect(nodeStyle.safeParse({ fills: [{ type: "solid", color: { color: "card", alpha: 50 } }] }).success).toBe(false)
    expect(nodeStyle.safeParse({ fills: [{ type: "solid", color: { token: "card" }, hidden: true }] }).success).toBe(
      false
    )
    expect(nodeStyle.safeParse({ filter: [{ type: "blur", value: "blur-sm" }] }).success).toBe(false)
  })

  it("takes padding on all sides, per axis or per side, and no other list", () => {
    expect(nodeStyle.safeParse({ padding: { step: 4 } }).success).toBe(true)
    expect(nodeStyle.safeParse({ padding: [{ step: 1 }, { step: 2 }] }).success).toBe(true)
    expect(nodeStyle.safeParse({ padding: [{ step: 1 }, { step: 2 }, { step: 3 }, { token: "gutter" }] }).success).toBe(
      true
    )
    expect(nodeStyle.safeParse({ padding: [{ step: 1 }, { step: 2 }, { step: 3 }] }).success).toBe(false)
    expect(nodeStyle.safeParse({ padding: [2, "gutter"] }).success).toBe(false)
    expect(nodeStyle.safeParse({ margin: [{ step: 0 }, { keyword: "auto" }] }).success).toBe(true)
  })

  it("takes a whole number of steps or a token for zIndex", () => {
    expect(nodeStyle.safeParse({ zIndex: { step: 10 } }).success).toBe(true)
    expect(nodeStyle.safeParse({ zIndex: { step: -1 } }).success).toBe(true)
    expect(nodeStyle.safeParse({ zIndex: { token: "z-modal" } }).success).toBe(true)
    expect(nodeStyle.safeParse({ zIndex: { step: 1.5 } }).success).toBe(false)
    expect(nodeStyle.safeParse({ zIndex: { value: "10" } }).success).toBe(false)
  })

  it("takes a grid's tracks, each a share of what's left or a length, and at least one", () => {
    const style = {
      display: "grid",
      gridTemplateColumns: [{ fr: 1 }, { fr: 2 }, { step: 10 }, { token: "sidebar" }, { value: "200px" }],
      gridTemplateRows: [{ keyword: "auto" }, { expr: "minmax(4rem, auto)" }]
    }

    expect(nodeStyle.parse(style)).toEqual(style)
    expect(problems(nodeStyle.safeParse({ gridTemplateColumns: [] }))).toEqual([
      "gridTemplateColumns: expected at least one track"
    ])
    expect(problems(nodeStyle.safeParse({ gridTemplateColumns: [3] }))).toEqual([
      "gridTemplateColumns.0: expected { fr } or a length: expected { step }, { token }, { value }, { keyword } or { expr }"
    ])
    expect(nodeStyle.safeParse({ gridTemplateColumns: [{ fr: 0 }] }).success).toBe(false)
    expect(nodeStyle.safeParse({ gridTemplateColumns: 3 }).success).toBe(false)
    expect(nodeStyle.safeParse({ gridTemplateRows: [{ size: "fill" }] }).success).toBe(false)
  })

  it("takes a color as a token or a value, each with an alpha, a keyword or an expression", () => {
    const colors = [
      { token: "primary" },
      { token: "primary", alpha: { step: 50 } },
      { token: "primary", alpha: { value: 0.5 } },
      { token: "primary", alpha: { token: "opacity-muted" } },
      { value: "#2563eb" },
      { value: "#2563eb", alpha: { step: 0 } },
      { keyword: "currentColor" },
      { expr: "light-dark(#111, #eee)" }
    ]

    for (const color of colors) {
      expect(nodeStyle.parse({ color, borderColor: color })).toEqual({ color, borderColor: color })
    }

    expect(problems(nodeStyle.safeParse({ color: { token: "primary", alpha: 50 } }))).toEqual([
      "color: expected { token }, { value }, { keyword } or { expr }"
    ])
    expect(nodeStyle.safeParse({ color: { token: "primary", alpha: { step: 101 } } }).success).toBe(false)
    expect(nodeStyle.safeParse({ color: { value: "#2563eb", alpha: { value: 1.5 } } }).success).toBe(false)
    expect(nodeStyle.safeParse({ color: { keyword: "currentColor", alpha: { step: 50 } } }).success).toBe(false)
  })

  it("takes a named value as a token or written out, and steps only for a line height", () => {
    const named = [{ token: "text-sm" }, { value: "18px" }, { keyword: "inherit" }, { expr: "clamp(1rem, 2vw, 2rem)" }]

    for (const value of named) {
      const style = { borderRadius: value, fontFamily: value, fontSize: value, letterSpacing: value, lineHeight: value }

      expect(nodeStyle.parse(style)).toEqual(style)
    }

    expect(nodeStyle.safeParse({ lineHeight: { step: 6 } }).success).toBe(true)
    expect(nodeStyle.safeParse({ fontSize: { step: 6 } }).success).toBe(false)
    expect(nodeStyle.safeParse({ borderRadius: { step: 2 } }).success).toBe(false)
  })

  it("takes a transform in its parts, with an entry of transform turned off", () => {
    const style = {
      translate: { x: { step: 2 }, y: { value: "-50%" } },
      rotate: 45,
      scale: { x: -100 },
      transform: [
        { type: "skewX", value: 10 },
        { type: "skewY", value: 5, off: true }
      ],
      transformOrigin: { x: 50, y: 0 }
    }

    expect(nodeStyle.parse(style)).toEqual(style)
    expect(nodeStyle.safeParse({ transform: [{ type: "rotate", value: 10 }] }).success).toBe(false)
    expect(nodeStyle.safeParse({ translate: { x: 4 } }).success).toBe(false)
    expect(nodeStyle.safeParse({ transformOrigin: { x: 50 } }).success).toBe(false)
  })

  it("takes in the CSS map a property no key owns, on or off", () => {
    const css = {
      "scroll-snap-type": { value: "x mandatory" },
      "mix-blend-mode": { value: "multiply", off: true },
      "--accent": { value: "#2563eb" },
      "-webkit-text-stroke": { value: "1px red" }
    }

    expect(nodeStyle.parse({ css })).toEqual({ css })
  })

  it("refuses in the CSS map a property a key owns, naming the key", () => {
    expect(problems(nodeStyle.safeParse({ css: { color: { value: "red" } } }))).toEqual([
      "css.color: color is set by the color key"
    ])
    expect(problems(nodeStyle.safeParse({ css: { "Background-Color": { value: "red" } } }))).toEqual([
      "css.Background-Color: Background-Color is set by the fills key"
    ])
    expect(
      problems(
        nodeStyle.safeParse({ css: { "line-height": { value: "1.5" }, "scroll-snap-type": { value: "x mandatory" } } })
      )
    ).toEqual(["css.line-height: line-height is set by the lineHeight key"])
  })

  it("refuses in the CSS map a name that isn't a property, a value that isn't text, and one that is empty", () => {
    expect(nodeStyle.safeParse({ css: { "scroll snap": { value: "x" } } }).success).toBe(false)
    expect(nodeStyle.safeParse({ css: { "scroll-snap-type": "x mandatory" } }).success).toBe(false)
    expect(nodeStyle.safeParse({ css: { "scroll-snap-type": { value: "" } } }).success).toBe(false)
    expect(nodeStyle.safeParse({ css: { "scroll-snap-type": { value: "x", hidden: true } } }).success).toBe(false)
  })

  it("lists its keys in the order panels show them", () => {
    expect(styleKeys.slice(0, 4)).toEqual(["display", "flexDirection", "gridTemplateColumns", "gridTemplateRows"])
    expect(styleKeys.slice(-2)).toEqual(["transition", "css"])
    expect(styleKeys).toHaveLength(56)
  })
})

describe("a length field", () => {
  it("tells a name from steps", () => {
    expect(isNamedLength("fill")).toBe(true)
    expect(isNamedLength(4)).toBe(false)
    expect(isNamedLength(undefined)).toBe(false)
  })

  it("holds a stored length as its steps, its token's name, fill or hug, or as it's written", () => {
    expect(lengthField({ step: 4 })).toBe(4)
    expect(lengthField({ token: "gutter" })).toBe("gutter")
    expect(lengthField({ size: "fill", share: 2 })).toBe("fill")
    expect(lengthField({ size: "hug" })).toBe("hug")
    expect(lengthField({ value: "50%" })).toBe("50%")
    expect(lengthField({ keyword: "auto" })).toBe("auto")
    expect(lengthField({ expr: "calc(100% - 2rem)" })).toBe("calc(100% - 2rem)")
    expect(lengthField(undefined)).toBeUndefined()
  })

  it("is stored as steps or the token it names, and for a size as fill or hug", () => {
    expect(fieldLength(4)).toEqual({ step: 4 })
    expect(fieldLength("gutter")).toEqual({ token: "gutter" })
    // A length takes no fill, so a token of that name is what a length field means by it.
    expect(fieldLength("fill")).toEqual({ token: "fill" })
    expect(fieldSize("fill")).toEqual({ size: "fill" })
    expect(fieldSize("hug")).toEqual({ size: "hug" })
    expect(fieldSize(20)).toEqual({ step: 20 })
    expect(fieldSize("container-sm")).toEqual({ token: "container-sm" })
  })

  it("reads a stored size's steps, its token, and whether it fills or hugs", () => {
    expect(lengthSteps({ step: 4 })).toBe(4)
    expect(lengthSteps({ token: "gutter" })).toBeUndefined()
    expect(lengthToken({ token: "gutter" })).toBe("gutter")
    expect(lengthToken({ size: "fill" })).toBeUndefined()
    expect(isFill({ size: "fill", share: 2 })).toBe(true)
    expect(isFill({ token: "fill" })).toBe(false)
    expect(isHug({ size: "hug" })).toBe(true)
    expect(isHug({ size: "fill" })).toBe(false)
    expect(isHug(undefined)).toBe(false)
  })
})
