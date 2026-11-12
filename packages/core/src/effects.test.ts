import { describe, expect, it } from "vite-plus/test"
import { type DesignNode, type NodeStyle, parseDesignNode } from "./document.ts"
import { filterCss, resolveDesign, shadowCss, transformCss } from "./render.ts"

// Effects (PAR-933): a stack of shadows, the layer's filters and those behind it, and a transform.

const effects: NodeStyle = {
  shadow: [
    { kind: "drop", token: "shadow-md", color: { color: "primary", alpha: 20 } },
    { kind: "drop", x: 0, y: 4, blur: 12, spread: -2, color: { color: "foreground", alpha: 10 } },
    { kind: "inner", x: 0, y: 1, blur: 2, spread: 0, color: { color: "foreground" }, off: true },
    { kind: "ring", width: 1, inset: true, color: { color: "border" } }
  ],
  filter: [
    { kind: "blur", value: "blur-sm" },
    { kind: "adjust", values: { brightness: 25, hue: -30, grayscale: 100 } },
    {
      kind: "dropShadow",
      shadow: { kind: "drop", x: 0, y: 2, blur: 4, spread: 0, color: { color: "#000000", alpha: 15 } }
    }
  ],
  backdropFilter: [{ kind: "blur", value: "blur-md" }],
  transform: { x: 2, y: { percent: -50 }, rotate: 45, scaleX: -100, scaleY: 150, skewX: 10, origin: { x: 50, y: 0 } },
  textTransform: "uppercase"
}

const layout = (style: NodeStyle): DesignNode => ({ type: "layout", id: "box", style, children: [] })

function drawn(style: NodeStyle) {
  const [box] = resolveDesign(layout(style), undefined, "desktop")

  if (box?.kind !== "element") {
    throw new Error("expected an element")
  }

  return box.style
}

describe("effects in the document", () => {
  it("keeps shadows, filters, the transform and text case through a file", () => {
    const read = parseDesignNode(structuredClone(layout(effects)), "node")

    expect(read.style).toEqual(effects)
  })

  it("still takes one shadow token", () => {
    expect(parseDesignNode(layout({ shadow: "shadow-sm" }), "node").style).toEqual({ shadow: "shadow-sm" })
  })

  it("rejects text case under its old name, transform", () => {
    expect(() => parseDesignNode({ ...layout({}), style: { transform: "uppercase" } }, "node")).toThrow(
      "node/style/transform"
    )
  })

  it("rejects a shadow that's half a token and half numbers", () => {
    expect(() =>
      parseDesignNode({ ...layout({}), style: { shadow: [{ kind: "drop", token: "shadow-sm", x: 1 }] } }, "node")
    ).toThrow("node/style/shadow")
  })
})

describe("drawing effects", () => {
  it("draws the shadows that are on, top first, with a token's alpha mixed in", () => {
    expect(shadowCss(effects.shadow)).toBe(
      [
        "var(--shadow-md)",
        "0 4px 12px -2px color-mix(in oklab, var(--foreground) 10%, transparent)",
        "inset 0 0 0 1px var(--border)"
      ].join(", ")
    )
    expect(shadowCss("shadow-sm")).toBe("var(--shadow-sm)")
    expect(shadowCss([{ kind: "ring", width: 2, color: { color: "ring" }, off: true }])).toBeUndefined()
  })

  it("writes the filters in the list's order, adjustments as changes from 100%", () => {
    expect(filterCss(effects.filter)).toBe(
      "blur(var(--blur-sm)) brightness(125%) hue-rotate(-30deg) grayscale(100%) " +
        "drop-shadow(0 2px 4px color-mix(in oklab, #000000 15%, transparent))"
    )
    expect(filterCss([{ kind: "adjust", values: { contrast: 0 } }])).toBeUndefined()
  })

  it("moves, turns, scales and skews about the origin", () => {
    expect(transformCss(effects.transform)).toEqual({
      translate: "calc(var(--spacing) * 2) -50%",
      rotate: "45deg",
      scale: "-1 1.5",
      transform: "skewX(10deg)",
      transformOrigin: "50% 0%"
    })
    expect(transformCss({ y: 4 })).toEqual({ translate: "0 calc(var(--spacing) * 4)" })
  })

  it("puts every effect and text case on the layer", () => {
    expect(drawn(effects)).toMatchObject({
      boxShadow: shadowCss(effects.shadow),
      filter: filterCss(effects.filter),
      backdropFilter: "blur(var(--blur-md))",
      rotate: "45deg",
      textTransform: "uppercase"
    })
  })
})
