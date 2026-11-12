import { fillCss, fillTokens, type Paint, paintsOf } from "@parity-app/style"
import { describe, expect, it } from "vite-plus/test"
import { type DesignNode, parseDesignNode } from "./document.ts"
import { resolveDesign } from "./render.ts"

const stack: Paint[] = [
  {
    kind: "linear",
    angle: 90,
    stops: [
      { color: "primary", alpha: 0, position: 0 },
      { color: "primary", position: 100, hint: undefined }
    ]
  },
  { kind: "image", src: "/images/hero.jpg", fit: "crop", scale: 120, position: [0, 100] },
  { kind: "gradient", token: "gradient-brand", hidden: true },
  { kind: "solid", color: "muted", alpha: 50 }
]

describe("a fill in a design", () => {
  it("is still one color token, as files before paint stacks hold it", () => {
    const node = parseDesignNode({ type: "layout", id: "card", style: { background: "card" }, children: [] })
    expect(node.style?.background).toBe("card")
    expect(paintsOf(node.style?.background)).toEqual([{ kind: "solid", color: "card" }])
  })

  it("reads and writes a stack of paints as it was", () => {
    const node: DesignNode = { type: "layout", id: "hero", style: { background: stack }, children: [] }
    // As a project file holds it.
    const file = JSON.stringify(node)
    const read = parseDesignNode(JSON.parse(file))
    expect(read).toEqual(node)
  })

  it("refuses a gradient of one stop, a fit it doesn't know and an alpha past 100", () => {
    const style = (background: readonly object[]) => ({ type: "layout", id: "x", style: { background }, children: [] })
    const one = [{ kind: "radial", stops: [{ color: "primary", position: 0 }] }]
    expect(() => parseDesignNode(style(one))).toThrow(/expected at least two stops/)
    expect(() => parseDesignNode(style([{ kind: "image", src: "/a.png", fit: "stretch" }]))).toThrow(/fit/)
    expect(() => parseDesignNode(style([{ kind: "solid", color: "muted", alpha: 120 }]))).toThrow(/alpha/)
  })
})

describe("fillTokens", () => {
  it("lists the colors of solids and stops, and gradient tokens, hidden ones too", () => {
    expect(fillTokens(stack)).toEqual({ colors: ["primary", "primary", "muted"], gradients: ["gradient-brand"] })
    expect(fillTokens("card")).toEqual({ colors: ["card"], gradients: [] })
    expect(fillTokens(undefined)).toEqual({ colors: [], gradients: [] })
  })
})

describe("fillCss", () => {
  it("writes one color token as it always has", () => {
    expect(fillCss("card")).toEqual({ background: "var(--card)" })
    expect(fillCss(undefined)).toEqual({})
  })

  it("writes the bottom solid as the color and the rest as image layers, top first, leaving out hidden ones", () => {
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
      { kind: "solid", color: "primary" },
      { kind: "gradient", token: "gradient-brand" }
    ])

    expect(css).toEqual({ backgroundImage: "linear-gradient(var(--primary), var(--primary)), var(--gradient-brand)" })
  })

  it("writes radial and conic gradients about their center, with hints, repeats and the blend's color space", () => {
    const stops = [
      { color: "a", position: 0, hint: 30 },
      { color: "b", position: 100 }
    ]

    expect(fillCss([{ kind: "radial", center: [25, 75], stops }]).backgroundImage).toBe(
      "radial-gradient(at 25% 75% in oklab, var(--a) 0%, 30%, var(--b) 100%)"
    )
    expect(fillCss([{ kind: "conic", angle: 45, repeat: true, interpolation: "oklch", stops }]).backgroundImage).toBe(
      "repeating-conic-gradient(from 45deg at 50% 50% in oklch, var(--a) 0%, 30%, var(--b) 100%)"
    )
  })

  it("covers, contains or tiles an image", () => {
    const image = (fit: "fill" | "fit" | "tile") => fillCss([{ kind: "image", src: "/t.png", fit }])
    expect(image("fill")).toMatchObject({ backgroundSize: "cover", backgroundRepeat: "no-repeat" })
    expect(image("fit")).toMatchObject({ backgroundSize: "contain", backgroundPosition: "50% 50%" })
    expect(image("tile")).toMatchObject({ backgroundSize: "auto", backgroundRepeat: "repeat" })
  })

  it("is what a rendered layer is drawn with", () => {
    const [hero] = resolveDesign(
      { type: "layout", id: "hero", style: { background: stack }, children: [] },
      undefined,
      "desktop"
    )

    expect(hero).toMatchObject({ kind: "element", style: fillCss(stack) })
  })
})
