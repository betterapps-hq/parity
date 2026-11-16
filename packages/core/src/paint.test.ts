import { fillCss, fillToken, fillTokens, type Paint, solidFill } from "@parity-app/style-schema"
import { describe, expect, it } from "vite-plus/test"
import { type DesignNode, parseDesignNode } from "./document.ts"
import { resolveDesign } from "./render.ts"

const stack: Paint[] = [
  {
    type: "linear",
    angle: 90,
    stops: [
      { color: { token: "primary", alpha: { step: 0 } }, position: 0 },
      { color: { token: "primary" }, position: 100, hint: undefined }
    ]
  },
  { type: "image", src: "/images/hero.jpg", fit: "crop", scale: 120, position: [0, 100] },
  { type: "gradient", token: "gradient-brand", off: true },
  { type: "solid", color: { token: "muted", alpha: { step: 50 } } }
]

describe("a fill in a design", () => {
  it("holds one color token as a list of one paint, and refuses the token's name alone", () => {
    const node = parseDesignNode({
      type: "layout",
      id: "card",
      style: { fills: [{ type: "solid", color: { token: "card" } }] },
      children: []
    })

    expect(node.style?.fills).toEqual(solidFill("card"))
    expect(fillToken(node.style?.fills)).toBe("card")
    expect(() => parseDesignNode({ type: "layout", id: "card", style: { fills: "card" }, children: [] })).toThrow(
      /fills/
    )
  })

  it("reads and writes a stack of paints as it was", () => {
    const node: DesignNode = { type: "layout", id: "hero", style: { fills: stack }, children: [] }
    // As a project file holds it.
    const file = JSON.stringify(node)
    const read = parseDesignNode(JSON.parse(file))
    expect(read).toEqual(node)
  })

  it("refuses a gradient of one stop, a fit it doesn't know and an alpha past 100", () => {
    const style = (fills: readonly object[]) => ({ type: "layout", id: "x", style: { fills }, children: [] })
    const one = [{ type: "radial", stops: [{ color: { token: "primary" }, position: 0 }] }]

    expect(() => parseDesignNode(style(one))).toThrow(/expected at least two stops/)
    expect(() => parseDesignNode(style([{ type: "image", src: "/a.png", fit: "stretch" }]))).toThrow(/fit/)
    expect(() => parseDesignNode(style([{ type: "solid", color: { token: "muted", alpha: { step: 120 } } }]))).toThrow(
      /alpha/
    )
  })
})

describe("fillTokens", () => {
  it("lists the colors of solids and stops, and gradient tokens, those that are off too", () => {
    expect(fillTokens(stack)).toEqual({ colors: ["primary", "primary", "muted"], gradients: ["gradient-brand"] })
    expect(fillTokens(solidFill("card"))).toEqual({ colors: ["card"], gradients: [] })
    expect(fillTokens(undefined)).toEqual({ colors: [], gradients: [] })
  })
})

describe("fillCss", () => {
  it("writes one color token as the color", () => {
    expect(fillCss(solidFill("card"))).toEqual({ backgroundColor: "var(--card)" })
    expect(fillCss(undefined)).toEqual({})
  })

  it("writes the bottom solid as the color and the rest as image layers, top first, leaving out those that are off", () => {
    expect(fillCss(stack)).toEqual({
      backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)",
      backgroundImage:
        'linear-gradient(90deg in oklab, color-mix(in oklab, var(--primary) 0%, transparent) 0%, var(--primary) 100%), url("/images/hero.jpg")',
      backgroundSize: "auto, 120%",
      backgroundPosition: "0% 0%, 0% 100%",
      backgroundRepeat: "repeat, no-repeat"
    })
  })

  it("draws a solid above the bottom as a flat gradient, and a gradient token by its variable", () => {
    const css = fillCss([
      { type: "solid", color: { token: "primary" } },
      { type: "gradient", token: "gradient-brand" }
    ])

    expect(css).toEqual({ backgroundImage: "linear-gradient(var(--primary), var(--primary)), var(--gradient-brand)" })
  })

  it("writes radial and conic gradients about their center, with hints, repeats and the blend's color space", () => {
    const stops = [
      { color: { token: "a" }, position: 0, hint: 30 },
      { color: { token: "b" }, position: 100 }
    ]

    expect(fillCss([{ type: "radial", center: [25, 75], stops }]).backgroundImage).toBe(
      "radial-gradient(at 25% 75% in oklab, var(--a) 0%, 30%, var(--b) 100%)"
    )
    expect(fillCss([{ type: "conic", angle: 45, repeat: true, interpolation: "oklch", stops }]).backgroundImage).toBe(
      "repeating-conic-gradient(from 45deg at 50% 50% in oklch, var(--a) 0%, 30%, var(--b) 100%)"
    )
  })

  it("covers, contains or tiles an image", () => {
    const image = (fit: "fill" | "fit" | "tile") => fillCss([{ type: "image", src: "/t.png", fit }])

    expect(image("fill")).toMatchObject({ backgroundSize: "cover", backgroundRepeat: "no-repeat" })
    expect(image("fit")).toMatchObject({ backgroundSize: "contain", backgroundPosition: "50% 50%" })
    expect(image("tile")).toMatchObject({ backgroundSize: "auto", backgroundRepeat: "repeat" })
  })

  it("is what a rendered layer is drawn with", () => {
    const [hero] = resolveDesign(
      { type: "layout", id: "hero", style: { fills: stack }, children: [] },
      undefined,
      "desktop"
    )

    if (hero?.kind !== "element") {
      throw new Error("expected an element")
    }

    // The fill's CSS, each property as CSS names it: `backgroundColor` as `background-color`.
    const fill = Object.entries(fillCss(stack)).map(([name, value]) => ({
      property: name.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
      value
    }))

    expect(fill).toHaveLength(5)
    expect(hero.declarations).toEqual(expect.arrayContaining(fill))
  })
})
