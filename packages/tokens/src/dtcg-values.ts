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
const color = z.union([css, colorObject])

const dimensionObject = z.object({
  value: finiteNumber,
  // DTCG names px and rem; libgen also writes em, and CSS takes any unit.
  unit: z.string().regex(/^([a-z]+|%)$/i, "expected a unit such as px or rem")
})
const dimension = z.union([css, dimensionObject])

const duration = z.union([css, z.object({ value: finiteNumber, unit: z.enum(["ms", "s"]) })])

/** A cubic Bézier's x coordinates, which CSS keeps between 0 and 1. */
const unitInterval = finiteNumber.min(0).max(1)
const cubicBezier = z.union([css, z.tuple([unitInterval, finiteNumber, unitInterval, finiteNumber])])

const fontFamily = z.union([css, z.array(z.string()).min(1)])
const fontWeight = z.union([css, finiteNumber.min(1).max(1000)])
const number = z.union([css, finiteNumber])

const strokeStyle = z.union([
  css,
  z.object({ dashArray: z.array(dimension).min(1), lineCap: z.enum(["round", "butt", "square"]) })
])

const border = z.union([css, z.object({ color, width: dimension, style: strokeStyle })])

const transition = z.union([css, z.object({ duration, delay: duration, timingFunction: cubicBezier })])

const shadowLayer = z.object({
  color,
  offsetX: dimension.default("0"),
  offsetY: dimension.default("0"),
  blur: dimension.default("0"),
  spread: dimension.default("0"),
  inset: z.boolean().default(false)
})
const shadow = z.union([css, shadowLayer, z.array(z.union([css, shadowLayer])).min(1)])

const gradient = z.union([css, z.array(z.object({ color, position: finiteNumber })).min(1)])

const typography = z.union([
  css,
  z.object({
    fontFamily,
    fontSize: dimension,
    fontWeight: fontWeight.default("normal"),
    letterSpacing: dimension.optional(),
    lineHeight: z.union([number, dimensionObject]).optional()
  })
])

/** Each DTCG type, by its `$type`, as the schema that checks its value and writes it as CSS. */
export const valueTypes: ReadonlyMap<string, z.ZodType<string>> = new Map<string, z.ZodType<string>>([
  ["border", border.transform(borderCss)],
  ["color", color.transform(colorCss)],
  ["cubicBezier", cubicBezier.transform(cubicBezierCss)],
  ["dimension", dimension.transform(dimensionCss)],
  ["duration", duration.transform(dimensionCss)],
  ["fontFamily", fontFamily.transform(fontFamilyCss)],
  ["fontWeight", fontWeight.transform(String)],
  ["gradient", gradient.transform(gradientCss)],
  ["number", number.transform(String)],
  ["shadow", shadow.transform(shadowCss)],
  ["strokeStyle", strokeStyle.transform(strokeStyleCss)],
  ["transition", transition.transform(transitionCss)],
  ["typography", typography.transform(typographyCss)]
])

/** A value of a type Parity has no schema for, or of no type, written by its shape. */
export function untypedCss(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  if (Array.isArray(value)) return value.map(untypedCss).join(" ")
  const asColor = colorObject.safeParse(value)
  if (asColor.success) return colorCss(asColor.data)
  const asDimension = dimensionObject.safeParse(value)
  if (asDimension.success) return dimensionCss(asDimension.data)
  return JSON.stringify(value) ?? ""
}

const colorFunctions = new Set(["hsl", "hwb", "lab", "lch", "oklab", "oklch"])

function colorCss(value: z.infer<typeof color>): string {
  if (typeof value === "string") return value
  const alpha = value.alpha !== undefined && value.alpha < 1 ? value.alpha : undefined
  if (value.hex && alpha === undefined) return value.hex
  const slash = alpha === undefined ? "" : ` / ${alpha}`
  if (value.colorSpace === "srgb") {
    const [r, g, b] = value.components.map((part) => (part === "none" ? part : Math.round(part * 255)))
    return `rgb(${r} ${g} ${b}${slash})`
  }
  const components = value.components.join(" ")
  if (colorFunctions.has(value.colorSpace)) return `${value.colorSpace}(${components}${slash})`
  return `color(${value.colorSpace} ${components}${slash})`
}

function dimensionCss(value: z.infer<typeof dimension> | z.infer<typeof duration>): string {
  return typeof value === "string" ? value : `${value.value}${value.unit}`
}

function cubicBezierCss(value: z.infer<typeof cubicBezier>): string {
  return typeof value === "string" ? value : `cubic-bezier(${value.join(", ")})`
}

function fontFamilyCss(value: z.infer<typeof fontFamily>): string {
  return typeof value === "string" ? value : value.map(fontName).join(", ")
}

function fontName(name: string): string {
  return /^[\w-]+$/.test(name) ? name : `"${name}"`
}

/** A stroke style as CSS: a border can't draw a dash pattern, so one is written as dashed. */
function strokeStyleCss(value: z.infer<typeof strokeStyle>): string {
  return typeof value === "string" ? value : "dashed"
}

function borderCss(value: z.infer<typeof border>): string {
  if (typeof value === "string") return value
  return `${dimensionCss(value.width)} ${strokeStyleCss(value.style)} ${colorCss(value.color)}`
}

function transitionCss(value: z.infer<typeof transition>): string {
  if (typeof value === "string") return value
  return `${dimensionCss(value.duration)} ${cubicBezierCss(value.timingFunction)} ${dimensionCss(value.delay)}`
}

function shadowCss(value: z.infer<typeof shadow>): string {
  if (typeof value === "string") return value
  const layers = Array.isArray(value) ? value : [value]
  return layers.map((layer) => (typeof layer === "string" ? layer : shadowLayerCss(layer))).join(", ")
}

function shadowLayerCss(layer: z.infer<typeof shadowLayer>): string {
  const lengths = [layer.offsetX, layer.offsetY, layer.blur, layer.spread].map(dimensionCss).join(" ")
  return `${layer.inset ? "inset " : ""}${lengths} ${colorCss(layer.color)}`
}

function gradientCss(value: z.infer<typeof gradient>): string {
  if (typeof value === "string") return value
  const stops = value.map((stop) => `${colorCss(stop.color)} ${Math.round(stop.position * 1000) / 10}%`)
  return `linear-gradient(${stops.join(", ")})`
}

function typographyCss(value: z.infer<typeof typography>): string {
  if (typeof value === "string") return value
  const { lineHeight } = value
  const line =
    lineHeight === undefined ? "" : `/${typeof lineHeight === "object" ? dimensionCss(lineHeight) : lineHeight}`
  return `${value.fontWeight} ${dimensionCss(value.fontSize)}${line} ${fontFamilyCss(value.fontFamily)}`
}
