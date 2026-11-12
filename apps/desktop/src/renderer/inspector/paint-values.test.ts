import { type Paint, solidFill } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import type { PaintEntry } from "./controls/lists-data.ts"
import { gradientToken } from "./controls/tokens.ts"
import { entriesFromFill, gradientTokenOf, paintsFromEntries } from "./paint-values.ts"

const brand = gradientToken("gradient-brand", {
  kind: "linear",
  angle: 90,
  stops: [
    { id: "a", position: 0, color: "blue-500" },
    { id: "b", position: 100, color: "teal-600" }
  ]
})

const stack: Paint[] = [
  {
    type: "conic",
    angle: 30,
    center: [20, 80],
    repeat: true,
    interpolation: "oklch",
    stops: [
      { color: { token: "primary" }, position: 0, hint: 40 },
      { color: { token: "muted", alpha: { step: 50 } }, position: 100 }
    ]
  },
  { type: "gradient", token: "gradient-brand" },
  { type: "image", src: "/images/hero.jpg", fit: "crop", scale: 120, position: [0, 100] },
  { type: "solid", color: { token: "card" }, off: true }
]

describe("a fill in the Paint stack control", () => {
  it("comes back from the control as it went in", () => {
    expect(paintsFromEntries(entriesFromFill(stack, [brand]))).toEqual(structuredClone(stack))
  })

  it("is one solid entry for one color token, and none for no fills", () => {
    expect(entriesFromFill(solidFill("card"), [])).toEqual([{ id: "fill-0", paint: { kind: "solid", color: "card" } }])
    expect(entriesFromFill(undefined, [])).toEqual([])
  })

  it("shows a color written out as its text, and stores one typed as a value", () => {
    const fills: Paint[] = [{ type: "solid", color: { value: "#2563eb", alpha: { step: 40 } } }]
    const entries = entriesFromFill(fills, [])

    expect(entries[0]?.paint).toEqual({ kind: "solid", color: "#2563eb", alpha: 40 })
    expect(paintsFromEntries(entries)).toEqual(fills)
  })

  it("keeps a color no field edits in the form it was stored, when another paint changes", () => {
    const fills: Paint[] = [
      { type: "solid", color: { keyword: "currentColor" } },
      { type: "solid", color: { token: "card", alpha: { token: "opacity-muted" } } }
    ]

    const [first, second] = entriesFromFill(fills, [])
    const edited = [{ ...first!, off: true }, second!]

    expect(paintsFromEntries(edited, fills)).toEqual([{ ...fills[0], off: true }, fills[1]])
  })

  it("draws a conic gradient as the control's angular one, a gradient token with its stops, and one that's off", () => {
    const [conic, token, , solid] = entriesFromFill(stack, [brand])
    expect(conic?.paint).toMatchObject({ kind: "angular", angle: 30 })
    expect(token?.paint).toMatchObject({ kind: "linear", token: "gradient-brand", stops: brand.paint.stops })
    expect(solid).toMatchObject({ off: true })
  })

  it("keeps the ids the control gave its entries, so an open editor stays open as its paint changes", () => {
    const previous: PaintEntry[] = [
      { id: "fill-7", paint: { kind: "solid", color: "card" } },
      { id: "fill-9", paint: { kind: "solid", color: "muted" } }
    ]

    expect(entriesFromFill(paintsFromEntries(previous), [], previous)).toEqual(previous)

    const changed = entriesFromFill(
      [
        { type: "solid", color: { token: "primary" } },
        { type: "solid", color: { token: "muted" } }
      ],
      [],
      previous
    )

    expect(changed.map((entry) => entry.id)).toEqual(["fill-7", "fill-9"])
    expect(changed[0]?.paint).toEqual({ kind: "solid", color: "primary" })
  })

  it("keeps a gradient's own stops once they're edited away from its token", () => {
    const [entry] = entriesFromFill([{ type: "gradient", token: "gradient-brand" }], [brand])

    if (entry?.paint.kind !== "linear") {
      throw new Error("expected a linear gradient")
    }

    const { token: _token, ...own } = entry.paint
    expect(paintsFromEntries([{ ...entry, paint: own }])).toEqual([
      {
        type: "linear",
        angle: 90,
        stops: [
          { color: { token: "blue-500" }, position: 0 },
          { color: { token: "teal-600" }, position: 100 }
        ]
      }
    ])
  })
})

describe("a project's gradient token in the Paint stack control", () => {
  it("reads a linear gradient's angle, its stops' tokens and places, and a hint", () => {
    expect(
      gradientTokenOf("gradient-brand", "linear-gradient(90deg in oklch, var(--primary) 0%, 30%, #fff 100%)")
    ).toEqual({
      name: "gradient-brand",
      kind: "gradient",
      value: "linear-gradient(90deg in oklch, var(--primary) 0%, 30%, #fff 100%)",
      detail: "Linear 90°",
      paint: {
        kind: "linear",
        angle: 90,
        interpolation: "oklch",
        stops: [
          { id: "gradient-brand-0", color: "primary", position: 0, hint: 30 },
          { id: "gradient-brand-1", color: "#fff", position: 100 }
        ]
      }
    })
  })

  it("spreads stops without places, reads a named direction, a center and a repeat", () => {
    expect(gradientTokenOf("a", "linear-gradient(to right, red, oklch(0.7 0.1 200), blue)")?.paint).toMatchObject({
      angle: 90,
      stops: [{ position: 0 }, { color: "oklch(0.7 0.1 200)", position: 50 }, { position: 100 }]
    })
    expect(gradientTokenOf("b", "repeating-radial-gradient(circle at 20% 80%, red 0%, blue 10%)")?.paint).toMatchObject(
      {
        kind: "radial",
        center: [20, 80],
        repeat: true
      }
    )
    expect(gradientTokenOf("c", "conic-gradient(from 45deg, red, blue)")?.paint).toMatchObject({
      kind: "angular",
      angle: 45
    })
  })

  it("leaves out what isn't a gradient of two stops or more", () => {
    expect(gradientTokenOf("d", "url(/a.png)")).toBeUndefined()
    expect(gradientTokenOf("e", "linear-gradient(red)")).toBeUndefined()
  })
})
