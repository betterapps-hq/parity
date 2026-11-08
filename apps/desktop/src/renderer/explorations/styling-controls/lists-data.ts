/*
 * The list fields' models and stand-in tokens: Fill's paint stack, Effects' shadow list and the filter list, as PAR-652's
 * design-options-values.md specifies them, with Tailwind v4's shadow, inset shadow, drop shadow and text shadow scales,
 * two gradient tokens and the project's images.
 */
import { hexOf, type Length } from "./data.ts"

/** A color in a list entry: a color token's name or a plain color, with its alpha from 0 to 100. */
export interface ListColor {
  color: string
  alpha?: number
}

/** A color as the preview draws it. */
export function drawColor({ color, alpha }: ListColor): string {
  const hex = hexOf(color)
  if (hex === undefined) return "transparent"
  return alpha === undefined ? hex : `color-mix(in srgb, ${hex} ${alpha}%, transparent)`
}

/** A color in words for a summary: the token's name, or the hex without its #, with its alpha. */
export function colorWords({ color, alpha }: ListColor): string {
  const name = color.startsWith("#") ? color.slice(1, 7).toUpperCase() : color
  return alpha === undefined ? name : `${name} ${alpha}%`
}

/* Paint stack */

/** A gradient's stop: its place along the line in %, its color, and where the blend's midpoint sits before the next. */
export interface Stop extends ListColor {
  id: string
  position: number
  /** A color hint: the midpoint between this stop and the next, in %, where it isn't halfway. */
  hint?: number
}

export type GradientKind = "linear" | "radial" | "angular"
export type Interpolation = "oklab" | "oklch" | "srgb"

export interface GradientPaint {
  kind: GradientKind
  stops: Stop[]
  /** The line's angle for Linear, and the start angle for Angular, in degrees, as typed. */
  angle: number
  /** The center for Radial and Angular, in % of the box. */
  center?: [number, number]
  repeat?: boolean
  interpolation?: Interpolation
  /** A gradient token, which the stops come from until they're edited. */
  token?: string
}

export type ImageFit = "fill" | "fit" | "crop" | "tile"

export interface ImagePaint {
  kind: "image"
  src: string
  fit: ImageFit
  /** For Crop, how large the image is drawn, in % of the box. */
  scale?: number
  /** Where the image sits, in % of the box. */
  position: [number, number]
}

export interface SolidPaint extends ListColor {
  kind: "solid"
  /** Why a plain color is allowed here, kept with it. */
  allowed?: string
}

export type Paint = SolidPaint | GradientPaint | ImagePaint

/** One fill: its paint, and whether its eye is off, which keeps it in the file but neither draws nor writes it. */
export interface PaintEntry {
  id: string
  paint: Paint
  off?: boolean
}

export interface GradientToken {
  name: string
  paint: Omit<GradientPaint, "token">
}

export const gradientTokens: GradientToken[] = [
  {
    name: "gradient-brand",
    paint: {
      kind: "linear",
      angle: 90,
      stops: [
        { id: "brand-1", position: 0, color: "blue-500" },
        { id: "brand-2", position: 100, color: "teal-600" }
      ]
    }
  },
  {
    name: "gradient-sunset",
    paint: {
      kind: "linear",
      angle: 135,
      stops: [
        { id: "sunset-1", position: 0, color: "chart-4" },
        { id: "sunset-2", position: 50, color: "chart-5" },
        { id: "sunset-3", position: 100, color: "chart-1" }
      ]
    }
  }
]

const svg = (body: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">${body}</svg>`)}`

/** The project's images, in `public/images/`, drawn here as stand-ins. */
export const projectImages: { name: string; preview: string }[] = [
  {
    name: "hero.jpg",
    preview: svg(
      `<defs><linearGradient id="s" x2="0" y2="1"><stop offset="0" stop-color="#7dd3fc"/><stop offset="1" stop-color="#fef3c7"/></linearGradient></defs><rect width="160" height="100" fill="url(#s)"/><circle cx="118" cy="30" r="12" fill="#fbbf24"/><path d="M0 80 50 45l30 25 25-18 55 38v10H0z" fill="#0d9488"/><path d="M0 100V88l40-20 45 32z" fill="#115e59"/>`
    )
  },
  {
    name: "team.png",
    preview: svg(
      `<rect width="160" height="100" fill="#f5f5f4"/><circle cx="50" cy="40" r="14" fill="#f54900"/><circle cx="80" cy="36" r="16" fill="#2563eb"/><circle cx="110" cy="40" r="14" fill="#009689"/><rect x="30" y="58" width="100" height="30" rx="15" fill="#d6d3d1"/>`
    )
  },
  {
    name: "pattern.svg",
    preview: svg(
      `<rect width="160" height="100" fill="#eef2ff"/><g fill="#6366f1">${Array.from({ length: 40 }, (_, index) => `<circle cx="${(index % 8) * 20 + 10}" cy="${Math.floor(index / 8) * 20 + 10}" r="3"/>`).join("")}</g>`
    )
  }
]

export const imagePreview = (src: string): string | undefined =>
  projectImages.find((image) => `/images/${image.name}` === src)?.preview

/* Shadow list */

/** One shadow: offsets, blur and spread in px, and its color. */
export interface ShadowLayer extends ListColor {
  x: number
  y: number
  blur: number
  spread: number
  /** Drawn inside, for a token saved from inner shadows and inset rings. */
  inset?: boolean
}

export interface ShadowToken {
  name: string
  layers: ShadowLayer[]
}

/** Tailwind's shadow color: black at the token's alpha. */
const layer = (x: number, y: number, blur: number, spread: number, alpha: number): ShadowLayer => ({
  x,
  y,
  blur,
  spread,
  color: "black",
  alpha
})

export const shadowTokens: ShadowToken[] = [
  { name: "shadow-2xs", layers: [layer(0, 1, 0, 0, 5)] },
  { name: "shadow-xs", layers: [layer(0, 1, 2, 0, 5)] },
  { name: "shadow-sm", layers: [layer(0, 1, 3, 0, 10), layer(0, 1, 2, -1, 10)] },
  { name: "shadow-md", layers: [layer(0, 4, 6, -1, 10), layer(0, 2, 4, -2, 10)] },
  { name: "shadow-lg", layers: [layer(0, 10, 15, -3, 10), layer(0, 4, 6, -4, 10)] },
  { name: "shadow-xl", layers: [layer(0, 20, 25, -5, 10), layer(0, 8, 10, -6, 10)] },
  { name: "shadow-2xl", layers: [layer(0, 25, 50, -12, 25)] }
]

export const insetShadowTokens: ShadowToken[] = [
  { name: "inset-shadow-2xs", layers: [layer(0, 1, 0, 0, 5)] },
  { name: "inset-shadow-xs", layers: [layer(0, 1, 1, 0, 5)] },
  { name: "inset-shadow-sm", layers: [layer(0, 2, 4, 0, 5)] }
]

export const dropShadowTokens: ShadowToken[] = [
  { name: "drop-shadow-xs", layers: [layer(0, 1, 1, 0, 5)] },
  { name: "drop-shadow-sm", layers: [layer(0, 1, 2, 0, 15)] },
  { name: "drop-shadow-md", layers: [layer(0, 3, 3, 0, 12)] },
  { name: "drop-shadow-lg", layers: [layer(0, 4, 4, 0, 15)] },
  { name: "drop-shadow-xl", layers: [layer(0, 9, 7, 0, 10)] },
  { name: "drop-shadow-2xl", layers: [layer(0, 25, 25, 0, 15)] }
]

export const textShadowTokens: ShadowToken[] = [
  { name: "text-shadow-2xs", layers: [layer(0, 1, 0, 0, 15)] },
  { name: "text-shadow-xs", layers: [layer(0, 1, 1, 0, 20)] },
  { name: "text-shadow-sm", layers: [layer(0, 1, 0, 0, 7.5), layer(0, 1, 1, 0, 7.5), layer(0, 2, 2, 0, 7.5)] },
  { name: "text-shadow-md", layers: [layer(0, 1, 1, 0, 10), layer(0, 1, 2, 0, 10), layer(0, 2, 4, 0, 10)] },
  { name: "text-shadow-lg", layers: [layer(0, 1, 2, 0, 10), layer(0, 3, 2, 0, 10), layer(0, 4, 8, 0, 10)] }
]

export type ShadowKind = "drop" | "inner" | "ring"

/**
 * One entry of the shadow list. A token entry draws its token's layers, with only its color overridable, as Tailwind
 * can (`shadow-lg shadow-black/20`); a custom entry has its own numbers. A ring is a width and a color.
 */
export interface ShadowEntry {
  id: string
  kind: ShadowKind
  token?: string
  /** The color set over a token's, for all its layers. */
  colorOverride?: ListColor
  layer: ShadowLayer
  /** A ring's width in whole px, and whether it's drawn inside. */
  width?: number
  inset?: boolean
  /** A drop shadow drawn around what's drawn rather than the box: `filter: drop-shadow()`, with no spread. */
  follow?: boolean
  off?: boolean
}

/** The tokens a shadow entry offers, by its kind and where it's drawn. */
export function tokensFor(entry: Pick<ShadowEntry, "kind" | "follow">, onText = false): ShadowToken[] {
  if (entry.kind === "inner") return insetShadowTokens
  if (entry.kind === "ring") return []
  if (entry.follow) return dropShadowTokens
  return onText ? textShadowTokens : shadowTokens
}

export const allShadowTokens = [...shadowTokens, ...insetShadowTokens, ...dropShadowTokens, ...textShadowTokens]

/** The layers an entry draws: its token's, with the override's color, or its own. */
export function layersOf(entry: ShadowEntry, saved: ShadowToken[] = []): ShadowLayer[] {
  if (entry.token === undefined) return [entry.layer]
  const token = [...allShadowTokens, ...saved].find((other) => other.name === entry.token)
  const layers = token?.layers ?? [entry.layer]
  return entry.colorOverride ? layers.map((part) => ({ ...part, ...entry.colorOverride })) : layers
}

/** A layer's numbers in words: `0 4 12 −2`, with a real minus, as the panel writes negatives. */
export const layerNumbers = (part: ShadowLayer, spread = true): string =>
  [part.x, part.y, part.blur, ...(spread ? [part.spread] : [])]
    .map((value) => String(value).replace("-", "−"))
    .join(" ")

/* Filter list */

/** The adjustments, in the panel's order: brightness, contrast and saturation centered on 0, then hue, then 0 to 100. */
export const adjustments = [
  { key: "brightness", label: "Brightness", min: -100, max: 100, unit: "" },
  { key: "contrast", label: "Contrast", min: -100, max: 100, unit: "" },
  { key: "saturate", label: "Saturation", min: -100, max: 100, unit: "" },
  { key: "hue", label: "Hue", min: -180, max: 180, unit: "°" },
  { key: "grayscale", label: "Grayscale", min: 0, max: 100, unit: "" },
  { key: "sepia", label: "Sepia", min: 0, max: 100, unit: "" },
  { key: "invert", label: "Invert", min: 0, max: 100, unit: "" }
] as const

export type AdjustmentKey = (typeof adjustments)[number]["key"]
export type Adjustments = Partial<Record<AdjustmentKey, number>>

/**
 * One entry of the filter list: Layer blur, Background blur, Adjustments (on the layer or behind it), a Drop shadow that
 * follows the shape, or Custom, a filter read from code in an order Tailwind can't write, kept as text.
 */
export type FilterEntry = { id: string; off?: boolean } & (
  | { kind: "blur"; value: Length | undefined }
  | { kind: "backdropBlur"; value: Length | undefined }
  | { kind: "adjust"; behind?: boolean; values: Adjustments }
  | { kind: "dropShadow"; shadow: ShadowEntry }
  | { kind: "custom"; behind?: boolean; text: string }
)

let next = 0
/** An id for a new entry or stop, unique while the story is open. */
export const newId = (prefix: string): string => `${prefix}-${++next}`
