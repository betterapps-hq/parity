import { filterCss, type NodeStyle, shadowCss, transformCss } from "@parity-app/style-schema"
import { describe, expect, it } from "vite-plus/test"
import { type DesignNode, parseDesignNode } from "./document.ts"
import { resolveDesign } from "./render.ts"

// Effects (PAR-933): a stack of shadows, the layer's filters and those behind it, and a transform.

const effects: NodeStyle = {
  boxShadow: [
    { type: "drop", token: "shadow-md", color: { token: "primary", alpha: { step: 20 } } },
    { type: "drop", x: 0, y: 4, blur: 12, spread: -2, color: { token: "foreground", alpha: { step: 10 } } },
    { type: "inner", x: 0, y: 1, blur: 2, spread: 0, color: { token: "foreground" }, off: true },
    { type: "ring", width: 1, inset: true, color: { token: "border" } }
  ],
  filter: [
    { type: "blur", value: { token: "blur-sm" } },
    { type: "adjust", values: { brightness: 25, hue: -30, grayscale: 100 } },
    {
      type: "dropShadow",
      shadow: { type: "drop", x: 0, y: 2, blur: 4, spread: 0, color: { value: "#000000", alpha: { step: 15 } } }
    }
  ],
  backdropFilter: [{ type: "blur", value: { token: "blur-md" } }],
  translate: { x: { step: 2 }, y: { value: "-50%" } },
  rotate: 45,
  scale: { x: -100, y: 150 },
  transform: [{ type: "skewX", value: 10 }],
  transformOrigin: { x: 50, y: 0 },
  textTransform: "uppercase"
}

const layout = (style: NodeStyle): DesignNode => ({ type: "layout", id: "box", style, children: [] })

function drawn(style: NodeStyle) {
  const [box] = resolveDesign(layout(style), undefined, "desktop")

  if (box?.kind !== "element") {
    throw new Error("expected an element")
  }

  return Object.fromEntries(box.declarations.map(({ property, value }) => [property, value]))
}

describe("effects in the document", () => {
  it("keeps shadows, filters, the transform and text case through a file", () => {
    const read = parseDesignNode(structuredClone(layout(effects)), "node")

    expect(read.style).toEqual(effects)
  })

  it("takes one shadow token as a list of one shadow, and refuses the token's name alone", () => {
    const boxShadow = [{ type: "drop", token: "shadow-sm" }]

    expect(parseDesignNode({ ...layout({}), style: { boxShadow } }, "node").style).toEqual({ boxShadow })
    expect(() => parseDesignNode({ ...layout({}), style: { boxShadow: "shadow-sm" } }, "node")).toThrow(
      "node/style/boxShadow"
    )
  })

  it("rejects text case as transform, which holds skew", () => {
    expect(() => parseDesignNode({ ...layout({}), style: { transform: "uppercase" } }, "node")).toThrow(
      "node/style/transform"
    )
  })

  it("rejects a shadow that's half a token and half numbers", () => {
    expect(() =>
      parseDesignNode({ ...layout({}), style: { boxShadow: [{ type: "drop", token: "shadow-sm", x: 1 }] } }, "node")
    ).toThrow("node/style/boxShadow")
  })
})

describe("drawing effects", () => {
  it("draws the shadows that are on, top first, with a token's alpha mixed in", () => {
    expect(shadowCss(effects.boxShadow)).toBe(
      [
        "var(--shadow-md)",
        "0 4px 12px -2px color-mix(in oklab, var(--foreground) 10%, transparent)",
        "inset 0 0 0 1px var(--border)"
      ].join(", ")
    )
    expect(shadowCss([{ type: "drop", token: "shadow-sm" }])).toBe("var(--shadow-sm)")
    expect(shadowCss([{ type: "ring", width: 2, color: { token: "ring" }, off: true }])).toBeUndefined()
  })

  it("writes the filters in the list's order, adjustments as changes from 100%", () => {
    expect(filterCss(effects.filter)).toBe(
      "blur(var(--blur-sm)) brightness(125%) hue-rotate(-30deg) grayscale(100%) " +
        "drop-shadow(0 2px 4px color-mix(in oklab, #000000 15%, transparent))"
    )
    expect(filterCss([{ type: "adjust", values: { contrast: 0 } }])).toBeUndefined()
  })

  it("moves, turns, scales and skews about the origin", () => {
    expect(transformCss(effects)).toEqual({
      translate: "calc(var(--spacing) * 2) -50%",
      rotate: "45deg",
      scale: "-1 1.5",
      transform: "skewX(10deg)",
      "transform-origin": "50% 0%"
    })
    expect(transformCss({ translate: { y: { step: 4 } } })).toEqual({ translate: "0 calc(var(--spacing) * 4)" })
  })

  it("puts every effect and text case on the layer", () => {
    expect(drawn(effects)).toMatchObject({
      "box-shadow": shadowCss(effects.boxShadow),
      filter: filterCss(effects.filter),
      "backdrop-filter": "blur(var(--blur-md))",
      rotate: "45deg",
      "text-transform": "uppercase"
    })
  })
})
