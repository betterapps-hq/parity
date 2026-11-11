import { z } from "zod"
import { fileObject, finiteNumber } from "./schema.ts"

/*
 * Fill's paint stack (PAR-931): what a node's `background` holds when it's more than one color token. Colors name the
 * project's color tokens, as a single `background` does; a gradient names a gradient token or lists its own stops.
 */

/** A place in the box, `[x, y]` in % from its top left. */
const spot = z.tuple([finiteNumber, finiteNumber])

/** Alpha in %, 0 to 100: how much of a color shows. */
const alpha = finiteNumber.min(0).max(100)

const paintStop = fileObject({
  /** A color token's name. */
  color: z.string(),
  alpha: alpha.optional(),
  /** Where along the gradient the stop sits, in %. */
  position: finiteNumber,
  /** A color hint: the midpoint between this stop and the next, in %, where it isn't halfway. */
  hint: finiteNumber.optional()
})

/** A gradient's stop: its color, and its place along the gradient. */
export type PaintStop = z.infer<typeof paintStop>

/** Whether a paint is kept in the file but not drawn, as a node's `hidden` is. */
const hidden = z.boolean().optional()

const solidPaint = fileObject({ kind: z.literal("solid"), color: z.string(), alpha: alpha.optional(), hidden })

export const gradientKinds = ["linear", "radial", "conic"] as const

export type GradientKind = (typeof gradientKinds)[number]

const gradientPaint = fileObject({
  kind: z.enum(gradientKinds),
  stops: z.array(paintStop).min(2, "expected at least two stops"),
  /** Linear's angle, and conic's start angle, in degrees: 0 points up and 90 right, as in CSS. Defaults to 180. */
  angle: finiteNumber.optional(),
  /** Radial's and conic's center. Defaults to the middle, `[50, 50]`. */
  center: spot.optional(),
  /** Whether the stops repeat past the last one. */
  repeat: z.boolean().optional(),
  /** The color space the stops blend in. Defaults to OKLab. */
  interpolation: z.enum(["oklab", "oklch", "srgb"]).optional(),
  hidden
})

/** A gradient token: the project's own gradient, by name. Editing its stops makes it a gradient of its own. */
const tokenGradientPaint = fileObject({ kind: z.literal("gradient"), token: z.string(), hidden })

export const paintFits = ["fill", "fit", "crop", "tile"] as const

export type PaintFit = (typeof paintFits)[number]

const imagePaint = fileObject({
  kind: z.literal("image"),
  /** The image's file, as an image layer's `src` names it. */
  src: z.string(),
  /** Fill covers the box, Fit shows all of it, Crop draws it at `scale`, and Tile repeats it at its own size. */
  fit: z.enum(paintFits),
  /** For Crop, how large the image is drawn, in % of the box. Defaults to 150. */
  scale: finiteNumber.optional(),
  /** Where the image sits. Defaults to the middle, `[50, 50]`. */
  position: spot.optional(),
  hidden
})

export const paint = z.discriminatedUnion("kind", [solidPaint, gradientPaint, tokenGradientPaint, imagePaint])

/** One layer of a fill: a color, a gradient, a gradient token or an image. */
export type Paint = z.infer<typeof paint>

export type SolidPaint = z.infer<typeof solidPaint>

export type GradientPaint = z.infer<typeof gradientPaint>

export type TokenGradientPaint = z.infer<typeof tokenGradientPaint>

export type ImagePaint = z.infer<typeof imagePaint>

/** A node's fill: one color token, or a stack of paints, top first. */
export const nodeFill = z.union([z.string(), z.array(paint)])

export type Fill = z.infer<typeof nodeFill>

/** A fill as its stack of paints, top first: one color token is one solid paint. */
export function paintsOf(fill: Fill | undefined): Paint[] {
  if (fill === undefined) {
    return []
  }

  return Array.isArray(fill) ? fill : [{ kind: "solid", color: fill }]
}

/** The tokens a fill names, by category. */
export interface FillTokens {
  /** Its solids' and its stops' color tokens. */
  colors: string[]
  gradients: string[]
}

/** Every token a fill names: its colors, its stops' colors and its gradient tokens. */
export function fillTokens(fill: Fill | undefined): FillTokens {
  const colors: string[] = []
  const gradients: string[] = []

  for (const layer of paintsOf(fill)) {
    if (layer.kind === "solid") {
      colors.push(layer.color)
    } else if (layer.kind === "gradient") {
      gradients.push(layer.token)
    } else if (layer.kind !== "image") {
      colors.push(...layer.stops.map((stop) => stop.color))
    }
  }

  return { colors, gradients }
}

/** A color token as CSS, mixed with transparent below 100% alpha. */
export function paintColorCss(color: string, alpha?: number): string {
  const variable = `var(--${color})`

  return alpha === undefined || alpha >= 100 ? variable : `color-mix(in oklab, ${variable} ${alpha}%, transparent)`
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
  }[layer.kind]

  const stops = [...layer.stops].sort((a, b) => a.position - b.position)

  const parts = stops.flatMap((stop, index) => {
    const own = `${paintColorCss(stop.color, stop.alpha)} ${stop.position}%`

    return stop.hint !== undefined && index < stops.length - 1 ? [own, `${stop.hint}%`] : [own]
  })

  return `${layer.repeat ? "repeating-" : ""}${gradientFunction[layer.kind]}(${head}, ${parts.join(", ")})`
}

/** A paint as a `background-image` layer: a solid that isn't the bottom one is `linear-gradient(c, c)`. */
function layerCss(layer: Paint): string {
  if (layer.kind === "solid") {
    const color = paintColorCss(layer.color, layer.alpha)

    return `linear-gradient(${color}, ${color})`
  }

  if (layer.kind === "image") {
    return `url(${JSON.stringify(layer.src)})`
  }

  if (layer.kind === "gradient") {
    return `var(--${layer.token})`
  }

  return gradientCss(layer)
}

const imageSize = { fill: "cover", fit: "contain", tile: "auto" } as const

/** A fill's inline style. */
export interface FillStyle {
  /** One color token, written as it always was. */
  background?: string
  backgroundColor?: string
  backgroundImage?: string
  backgroundSize?: string
  backgroundPosition?: string
  backgroundRepeat?: string
}

/** The CSS for a fill, as inline style: the bottom color as `background-color`, the rest as image layers. */
export function fillCss(fill: Fill | undefined): FillStyle {
  // One color token is written as it always was.
  if (!Array.isArray(fill)) {
    return fill ? { background: paintColorCss(fill) } : {}
  }

  const shown = fill.filter((layer) => !layer.hidden)
  const bottom = shown.at(-1)
  const base = bottom?.kind === "solid" ? bottom : undefined
  const images = base ? shown.slice(0, -1) : shown
  const css: FillStyle = {}

  if (base) {
    css.backgroundColor = paintColorCss(base.color, base.alpha)
  }

  if (images.length === 0) {
    return css
  }

  css.backgroundImage = images.map(layerCss).join(", ")

  if (images.some((layer) => layer.kind === "image")) {
    const each = (pick: (layer: ImagePaint) => string, other: string) =>
      images.map((layer) => (layer.kind === "image" ? pick(layer) : other)).join(", ")

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
