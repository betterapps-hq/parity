import { z } from "zod"
import { finiteNumber, stored } from "./stored.ts"
import { exprForm, keywordForm, off, token, tokenForm } from "./value.ts"

/*
 * Colors, and Fill's paint stack (PAR-931): what a node's `fills` holds. A color names one of the project's color
 * tokens or is written out; a gradient names a gradient token or lists its own stops.
 */

/**
 * How much of a color shows: a percentage as the styling framework's modifier takes it (`{ step: 50 }` is `/50`), a
 * number from 0 to 1, or an opacity token.
 */
export const alpha = z.union(
  [stored({ step: finiteNumber.min(0).max(100) }), stored({ value: finiteNumber.min(0).max(1) }), tokenForm],
  "expected { step } from 0 to 100, { value } from 0 to 1 or { token }"
)

export type Alpha = z.infer<typeof alpha>

/**
 * A color: a color token, or a color as CSS reads it (`#2563eb`, `oklch(…)`), each with its alpha when it's
 * see-through, or a keyword (`currentColor`) or an expression.
 */
export const color = z.union(
  [
    stored({ token: z.string().min(1), alpha: alpha.optional() }),
    stored({ value: z.string().min(1), alpha: alpha.optional() }),
    keywordForm,
    exprForm
  ],
  "expected { token }, { value }, { keyword } or { expr }"
)

export type Color = z.infer<typeof color>

/** A color token, with its alpha in % when it's see-through. */
export function tokenColor(name: string, percent?: number): Color {
  return percent === undefined ? { token: name } : { token: name, alpha: { step: percent } }
}

/** The color token a color names, if it names one. */
export function colorToken(value: Color | undefined): string | undefined {
  return value !== undefined && "token" in value ? value.token : undefined
}

/** A color's alpha in %, when it has one that isn't a token. */
export function alphaPercent(value: Color | undefined): number | undefined {
  const own = value !== undefined && "alpha" in value ? value.alpha : undefined

  if (own === undefined || "token" in own) {
    return undefined
  }

  return "step" in own ? own.step : own.value * 100
}

/** The same color at another alpha in %, or opaque with none. A keyword or an expression has no alpha to change. */
export function withAlpha(value: Color, percent: number | undefined): Color {
  if ("keyword" in value || "expr" in value) {
    return value
  }

  const { alpha: _, ...opaque } = value

  return percent === undefined ? opaque : { ...opaque, alpha: { step: percent } }
}

function alphaCss(value: Alpha): string {
  if ("token" in value) {
    return token(value.token)
  }

  return "step" in value ? `${value.step}%` : `${value.value * 100}%`
}

/** A color as CSS, mixed with transparent when it has an alpha below 100%. */
export function colorCss(value: Color): string {
  if ("keyword" in value) {
    return value.keyword
  }

  if ("expr" in value) {
    return value.expr
  }

  const base = "token" in value ? token(value.token) : value.value
  const opaque = value.alpha === undefined || ("step" in value.alpha && value.alpha.step >= 100)

  return opaque || value.alpha === undefined
    ? base
    : `color-mix(in oklab, ${base} ${alphaCss(value.alpha)}, transparent)`
}

/** A place in the box, `[x, y]` in % from its top left. */
const spot = z.tuple([finiteNumber, finiteNumber])

const paintStop = stored({
  color,
  /** Where along the gradient the stop sits, in %. */
  position: finiteNumber,
  /** A color hint: the midpoint between this stop and the next, in %, where it isn't halfway. */
  hint: finiteNumber.optional()
})

/** A gradient's stop: its color, and its place along the gradient. */
export type PaintStop = z.infer<typeof paintStop>

const solidPaint = stored({ type: z.literal("solid"), color, off })

export const gradientKinds = ["linear", "radial", "conic"] as const

export type GradientKind = (typeof gradientKinds)[number]

const gradientPaint = stored({
  type: z.enum(gradientKinds),
  stops: z.array(paintStop).min(2, "expected at least two stops"),
  /** Linear's angle, and conic's start angle, in degrees: 0 points up and 90 right, as in CSS. Defaults to 180. */
  angle: finiteNumber.optional(),
  /** Radial's and conic's center. Defaults to the middle, `[50, 50]`. */
  center: spot.optional(),
  /** Whether the stops repeat past the last one. */
  repeat: z.boolean().optional(),
  /** The color space the stops blend in. Defaults to OKLab. */
  interpolation: z.enum(["oklab", "oklch", "srgb"]).optional(),
  off
})

/** A gradient token: the project's own gradient, by name. Editing its stops makes it a gradient of its own. */
const tokenGradientPaint = stored({ type: z.literal("gradient"), token: z.string(), off })

export const paintFits = ["fill", "fit", "crop", "tile"] as const

export type PaintFit = (typeof paintFits)[number]

const imagePaint = stored({
  type: z.literal("image"),
  /** The image's file, as an image layer's `src` names it. */
  src: z.string(),
  /** Fill covers the box, Fit shows all of it, Crop draws it at `scale`, and Tile repeats it at its own size. */
  fit: z.enum(paintFits),
  /** For Crop, how large the image is drawn, in % of the box. Defaults to 150. */
  scale: finiteNumber.optional(),
  /** Where the image sits. Defaults to the middle, `[50, 50]`. */
  position: spot.optional(),
  off
})

export const paint = z.discriminatedUnion("type", [solidPaint, gradientPaint, tokenGradientPaint, imagePaint])

/** One layer of a fill: a color, a gradient, a gradient token or an image. */
export type Paint = z.infer<typeof paint>

export type SolidPaint = z.infer<typeof solidPaint>

export type GradientPaint = z.infer<typeof gradientPaint>

export type TokenGradientPaint = z.infer<typeof tokenGradientPaint>

export type ImagePaint = z.infer<typeof imagePaint>

/** A node's fills: its stack of paints, top first. */
export type Fills = Paint[]

/** One color token as a fill. */
export function solidFill(name: string): Fills {
  return [{ type: "solid", color: { token: name } }]
}

/** The one color token a fill is, when it's a single solid paint that is on, opaque and names a token. */
export function fillToken(fills: readonly Paint[] | undefined): string | undefined {
  const [only, ...rest] = fills ?? []

  if (!only || rest.length > 0 || only.type !== "solid" || only.off || !("token" in only.color)) {
    return undefined
  }

  return only.color.alpha === undefined ? only.color.token : undefined
}

/** The tokens a fill names, by category. */
export interface FillTokens {
  /** Its solids' and its stops' color tokens. */
  colors: string[]
  gradients: string[]
}

/** Every token a fill names: its colors, its stops' colors and its gradient tokens. */
export function fillTokens(fills: readonly Paint[] | undefined): FillTokens {
  const colors: string[] = []
  const gradients: string[] = []

  const named = (value: Color) => {
    const name = colorToken(value)

    return name === undefined ? [] : [name]
  }

  for (const layer of fills ?? []) {
    if (layer.type === "solid") {
      colors.push(...named(layer.color))
    } else if (layer.type === "gradient") {
      gradients.push(layer.token)
    } else if (layer.type !== "image") {
      colors.push(...layer.stops.flatMap((stop) => named(stop.color)))
    }
  }

  return { colors, gradients }
}

const gradientFunction = { linear: "linear-gradient", radial: "radial-gradient", conic: "conic-gradient" } as const

/** A gradient as CSS: `linear-gradient(90deg in oklab, var(--a) 0%, 30%, var(--b) 100%)`. */
export function gradientCss(layer: GradientPaint): string {
  const blend = `in ${layer.interpolation ?? "oklab"}`
  const [x, y] = layer.center ?? [50, 50]

  const head = {
    linear: `${layer.angle ?? 180}deg ${blend}`,
    radial: `at ${x}% ${y}% ${blend}`,
    conic: `from ${layer.angle ?? 0}deg at ${x}% ${y}% ${blend}`
  }[layer.type]

  const stops = [...layer.stops].sort((a, b) => a.position - b.position)

  const parts = stops.flatMap((stop, index) => {
    const own = `${colorCss(stop.color)} ${stop.position}%`

    return stop.hint !== undefined && index < stops.length - 1 ? [own, `${stop.hint}%`] : [own]
  })

  return `${layer.repeat ? "repeating-" : ""}${gradientFunction[layer.type]}(${head}, ${parts.join(", ")})`
}

/** A paint as a `background-image` layer: a solid that isn't the bottom one is `linear-gradient(c, c)`. */
function layerCss(layer: Paint): string {
  if (layer.type === "solid") {
    const css = colorCss(layer.color)

    return `linear-gradient(${css}, ${css})`
  }

  if (layer.type === "image") {
    return `url(${JSON.stringify(layer.src)})`
  }

  if (layer.type === "gradient") {
    return token(layer.token)
  }

  return gradientCss(layer)
}

const imageSize = { fill: "cover", fit: "contain", tile: "auto" } as const

/** A fill's CSS, by property in camelCase. */
export interface FillStyle {
  backgroundColor?: string
  backgroundImage?: string
  backgroundSize?: string
  backgroundPosition?: string
  backgroundRepeat?: string
}

/** The CSS for a fill: the bottom color as `background-color`, the rest as image layers. */
export function fillCss(fills: readonly Paint[] | undefined): FillStyle {
  const shown = (fills ?? []).filter((layer) => !layer.off)
  const bottom = shown.at(-1)
  const base = bottom?.type === "solid" ? bottom : undefined
  const images = base ? shown.slice(0, -1) : shown
  const css: FillStyle = {}

  if (base) {
    css.backgroundColor = colorCss(base.color)
  }

  if (images.length === 0) {
    return css
  }

  css.backgroundImage = images.map(layerCss).join(", ")

  if (images.some((layer) => layer.type === "image")) {
    const each = (pick: (layer: ImagePaint) => string, other: string) =>
      images.map((layer) => (layer.type === "image" ? pick(layer) : other)).join(", ")

    css.backgroundSize = each(
      (layer) => (layer.fit === "crop" ? `${layer.scale ?? 150}%` : imageSize[layer.fit]),
      "auto"
    )
    css.backgroundPosition = each(
      (layer) => (layer.position ?? [50, 50]).map((value) => `${value}%`).join(" "),
      "0% 0%"
    )
    css.backgroundRepeat = each((layer) => (layer.fit === "tile" ? "repeat" : "no-repeat"), "repeat")
  }

  return css
}
