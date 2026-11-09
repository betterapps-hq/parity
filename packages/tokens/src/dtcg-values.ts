// What each DTCG type's `$value` holds once aliases are followed (the Format module, 2025.10), as a zod schema, and how
// Parity writes it as CSS. Any value may instead be a string: CSS, which Parity reads as written, as libgen writes values
// DTCG has no form for. The parts Parity fills in when they're left out are optional: a shadow's offsets, blur, spread
// and inset, and a typography's weight, line height and letter spacing.

import { finiteNumber } from "@parity-app/core/schema"
import { z } from "zod"

/** A value written as CSS. */
const css = z.string()

const colorSpace = z.enum([
  "srgb",
  "srgb-linear",
  "hsl",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "display-p3",
  "a98-rgb",
  "prophoto-rgb",
  "rec2020",
  "xyz-d65",
  "xyz-d50"
])

const colorObject = z.object({
  colorSpace,
  components: z.array(z.union([finiteNumber, z.literal("none")])).length(3, "expected 3 components"),
  alpha: finiteNumber.min(0).max(1).optional(),
  hex: z
    .string()
    .regex(/^#[\da-f]{6}$/i, "expected a 6-digit hex color such as #0a0a0a")
    .optional()
})

const color = z.union([css, colorObject.transform(colorCss)])

const dimensionObject = z.object({
  value: finiteNumber,
  // DTCG names px and rem; libgen also writes em, and CSS takes any unit.
  unit: z.string().regex(/^([a-z]+|%)$/i, "expected a unit such as px or rem")
})

const dimension = z.union([css, dimensionObject.transform(measureCss)])

const durationObject = z.object({ value: finiteNumber, unit: z.enum(["ms", "s"]) })
const duration = z.union([css, durationObject.transform(measureCss)])

/** A cubic Bézier's x coordinates, which CSS keeps between 0 and 1. */
const unitInterval = finiteNumber.min(0).max(1)

const cubicBezier = z.union([
  css,
  z
    .tuple([unitInterval, finiteNumber, unitInterval, finiteNumber])
    .transform((points) => `cubic-bezier(${points.join(", ")})`)
])

const fontFamily = z.union([
  css,
  z
    .array(z.string())
    .min(1)
    .transform((names) => names.map(fontName).join(", "))
])

const fontWeight = z.union([css, finiteNumber.min(1).max(1000).transform(String)])
const number = z.union([css, finiteNumber.transform(String)])

/** A stroke style as CSS: a border can't draw a dash pattern, so one is written as dashed. */
const strokeStyle = z.union([
  css,
  z
    .object({ dashArray: z.array(dimension).min(1), lineCap: z.enum(["round", "butt", "square"]) })
    .transform(() => "dashed")
])

const border = z.union([
  css,
  z
    .object({ color, width: dimension, style: strokeStyle })
    .transform((part) => `${part.width} ${part.style} ${part.color}`)
])

const transition = z.union([
  css,
  z
    .object({ duration, delay: duration, timingFunction: cubicBezier })
    .transform((part) => `${part.duration} ${part.timingFunction} ${part.delay}`)
])

const shadowLayer = z
  .object({
    color,
    offsetX: dimension.default("0"),
    offsetY: dimension.default("0"),
    blur: dimension.default("0"),
    spread: dimension.default("0"),
    inset: z.boolean().default(false)
  })
  .transform(
    (layer) =>
      `${layer.inset ? "inset " : ""}${layer.offsetX} ${layer.offsetY} ${layer.blur} ${layer.spread} ${layer.color}`
  )

const shadow = z.union([
  css,
  shadowLayer,
  z
    .array(z.union([css, shadowLayer]))
    .min(1)
    .transform((layers) => layers.join(", "))
])

const gradient = z.union([
  css,
  z
    .array(z.object({ color, position: finiteNumber }))
    .min(1)
    .transform((stops) => {
      const written = stops.map((stop) => `${stop.color} ${Math.round(stop.position * 1000) / 10}%`)

      return `linear-gradient(${written.join(", ")})`
    })
])

const typography = z.union([
  css,
  z
    .object({
      fontFamily,
      fontSize: dimension,
      fontWeight: fontWeight.default("normal"),
      letterSpacing: dimension.optional(),
      lineHeight: z.union([number, dimensionObject.transform(measureCss)]).optional()
    })
    .transform((part) => {
      const line = part.lineHeight === undefined ? "" : `/${part.lineHeight}`

      return `${part.fontWeight} ${part.fontSize}${line} ${part.fontFamily}`
    })
])

/** Each DTCG type, by its `$type`, as the schema that checks its value and writes it as CSS. */
export const valueTypes: ReadonlyMap<string, z.ZodType<string>> = new Map<string, z.ZodType<string>>([
  ["border", border],
  ["color", color],
  ["cubicBezier", cubicBezier],
  ["dimension", dimension],
  ["duration", duration],
  ["fontFamily", fontFamily],
  ["fontWeight", fontWeight],
  ["gradient", gradient],
  ["number", number],
  ["shadow", shadow],
  ["strokeStyle", strokeStyle],
  ["transition", transition],
  ["typography", typography]
])

/**
 * A value of a type Parity has no schema for, or of no type, written by its shape: text and numbers as they are, a
 * list's items with spaces between them, a color or a dimension as CSS, and anything else as JSON. It takes any value.
 */
export const untypedValue: z.ZodType<string> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().transform(String),
    z.array(untypedValue).transform((items) => items.join(" ")),
    colorObject.transform(colorCss),
    dimensionObject.transform(measureCss),
    z.unknown().transform((value) => JSON.stringify(value) ?? "")
  ])
)

const colorFunctions = new Set(["hsl", "hwb", "lab", "lch", "oklab", "oklch"])

function colorCss(value: z.infer<typeof colorObject>): string {
  const alpha = value.alpha !== undefined && value.alpha < 1 ? value.alpha : undefined

  if (value.hex && alpha === undefined) {
    return value.hex
  }

  const slash = alpha === undefined ? "" : ` / ${alpha}`

  if (value.colorSpace === "srgb") {
    const [r, g, b] = value.components.map((part) => (part === "none" ? part : Math.round(part * 255)))

    return `rgb(${r} ${g} ${b}${slash})`
  }

  const components = value.components.join(" ")

  if (colorFunctions.has(value.colorSpace)) {
    return `${value.colorSpace}(${components}${slash})`
  }

  return `color(${value.colorSpace} ${components}${slash})`
}

/** A dimension or a duration as CSS: its number, then its unit. */
function measureCss(value: z.infer<typeof dimensionObject> | z.infer<typeof durationObject>): string {
  return `${value.value}${value.unit}`
}

function fontName(name: string): string {
  return /^[\w-]+$/.test(name) ? name : `"${name}"`
}
