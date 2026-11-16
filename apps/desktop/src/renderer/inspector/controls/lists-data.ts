/*
 * The list fields' models: Fill's paint stack, Effects' shadow list and the filter list, as PAR-652's
 * design-options-values.md specifies them, with the project's images. Their tokens are the project's, as `ProjectData` gives them.
 */
import { formatNumber } from "@parity-app/style-schema"
import { windowStore } from "../../store.ts"
import type { Length } from "./data.ts"
import { type ColorToken, drawnColor, type ShadowToken } from "./tokens.ts"

/** A color in a list entry: a color token's name or a plain color, with its alpha from 0 to 100. */
export interface ListColor {
  color: string
  alpha?: number
}

/** A list entry's color as a preview draws it, with the project's color tokens (tokens.ts's `drawnColor`). */
export const drawListColor = ({ color, alpha }: ListColor, tokens: readonly ColorToken[]): string =>
  drawnColor(color, alpha, tokens)

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

const svg = (body: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">${body}</svg>`)}`

/** An image in the project's `public/images/`: its file's name, and what it draws. */
export interface ProjectImage {
  name: string
  preview: string
}

/** The project's images, in `public/images/`, drawn here as stand-ins. */
const startingImages: ProjectImage[] = [
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

/*
 * The images the project has as the exploration runs: its own, then those added to it, dropped, pasted, uploaded or
 * picked from Unsplash, as each would be copied into `public/images/`. Kept here so every editor and preview sees them.
 */
const added = windowStore<readonly ProjectImage[]>(() => startingImages)

/** The project's images now; the same list until one's added, so React can watch it. */
export const projectImages = added.get

/** Calls `watch` each time an image is added, until the function it returns is called. */
export const watchProjectImages = added.subscribe

/**
 * Adds an image to the project under its file's name made fit for a class (`My Photo.PNG` is `my-photo.png`), numbered
 * when that's taken, and gives the path a fill uses for it. One already there with the same picture is used again.
 */
export function addProjectImage(fileName: string, preview: string): string {
  const images = added.get()
  const same = images.find((image) => image.preview === preview)

  if (same) {
    return `/images/${same.name}`
  }

  const clean =
    fileName
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^-+|-+$/g, "") || "image"

  const dot = clean.lastIndexOf(".")
  const [stem, extension] = dot > 0 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, ""]
  const taken = new Set(images.map((image) => image.name))
  let name = clean

  for (let count = 2; taken.has(name); count += 1) {
    name = `${stem}-${count}${extension}`
  }

  added.set([...images, { name, preview }])

  return `/images/${name}`
}

/** A photo a stock provider's search returns: its title and the words it's found by. */
export interface StockPhoto {
  id: string
  title: string
  tags: string[]
  preview: string
}

/**
 * Where a fill links an Unsplash photo from, as Unsplash's terms ask, rather than copying it into the project.
 * A stand-in address, as the photos are.
 */
export const stockSrc = (photo: StockPhoto) => `https://images.unsplash.com/${photo.id}`

export const imagePreview = (src: string): string | undefined =>
  added.get().find((image) => `/images/${image.name}` === src)?.preview ??
  stockPhotos.find((photo) => stockSrc(photo) === src)?.preview

/** An image as its row names it: the project's by its file's name, Unsplash's by its title. */
export const imageName = (src: string): string =>
  stockPhotos.find((photo) => stockSrc(photo) === src)?.title ?? src.replace("/images/", "")

/**
 * Stand-ins for what Unsplash's search returns once it's connected, drawn here, so the results can be laid out and
 * picked. Picking one links it from Unsplash, crediting its photographer, as the real one will.
 */
export const stockPhotos: StockPhoto[] = [
  {
    id: "mountain-lake",
    title: "Mountain lake at dusk",
    tags: ["mountain", "lake", "dusk", "nature", "water"],
    preview: svg(
      `<defs><linearGradient id="d" x2="0" y2="1"><stop offset="0" stop-color="#312e81"/><stop offset="1" stop-color="#fda4af"/></linearGradient></defs><rect width="160" height="100" fill="url(#d)"/><path d="M0 62 38 28l22 18 30-30 40 46H0z" fill="#3730a3"/><rect y="62" width="160" height="38" fill="#1e3a8a"/><path d="M0 62 38 90l22-14 30 24H0z" fill="#312e81" opacity=".6"/>`
    )
  },
  {
    id: "ocean-waves",
    title: "Ocean waves",
    tags: ["ocean", "sea", "waves", "water", "beach", "blue"],
    preview: svg(
      `<rect width="160" height="100" fill="#bae6fd"/><rect y="40" width="160" height="60" fill="#0369a1"/><path d="M0 52q20-8 40 0t40 0 40 0 40 0M0 70q20-8 40 0t40 0 40 0 40 0M0 88q20-8 40 0t40 0 40 0 40 0" fill="none" stroke="#e0f2fe" stroke-width="3"/>`
    )
  },
  {
    id: "forest-path",
    title: "Forest path",
    tags: ["forest", "trees", "green", "nature", "path"],
    preview: svg(
      `<rect width="160" height="100" fill="#14532d"/><path d="M20 80 34 20l14 60zM60 84 76 10l16 74zM108 82l14-58 14 58z" fill="#16a34a"/><path d="M70 100 80 60l10 40z" fill="#ca8a04"/>`
    )
  },
  {
    id: "city-night",
    title: "City at night",
    tags: ["city", "night", "skyline", "buildings", "dark"],
    preview: svg(
      `<rect width="160" height="100" fill="#0f172a"/><circle cx="128" cy="22" r="9" fill="#f8fafc"/><path d="M8 100V50h24v50zm30 0V30h22v70zm28 0V58h18v42zm24 0V40h26v60zm32 0V62h28v38z" fill="#1e293b"/><g fill="#fde047">${Array.from({ length: 18 }, (_, index) => `<rect x="${14 + (index % 6) * 22}" y="${66 + Math.floor(index / 6) * 10}" width="4" height="4"/>`).join("")}</g>`
    )
  },
  {
    id: "desert-dunes",
    title: "Desert dunes",
    tags: ["desert", "dunes", "sand", "sun", "warm"],
    preview: svg(
      `<rect width="160" height="100" fill="#fed7aa"/><circle cx="40" cy="30" r="12" fill="#fff7ed"/><path d="M0 70q40-30 80 0t80-6v36H0z" fill="#ea580c"/><path d="M0 86q50-24 100 0t60 0v14H0z" fill="#c2410c"/>`
    )
  },
  {
    id: "snowy-peaks",
    title: "Snowy peaks",
    tags: ["mountain", "snow", "winter", "peaks", "cold"],
    preview: svg(
      `<rect width="160" height="100" fill="#e0f2fe"/><path d="M0 100 50 30l30 40 30-50 50 80z" fill="#64748b"/><path d="M50 30 62 47l-8-2-10 6zM110 20l14 22-10-4-12 6z" fill="#f8fafc"/>`
    )
  },
  {
    id: "abstract-color",
    title: "Abstract color",
    tags: ["abstract", "gradient", "colorful", "background", "purple"],
    preview: svg(
      `<rect width="160" height="100" fill="#1e1b4b"/><circle cx="50" cy="40" r="34" fill="#8b5cf6" opacity=".85"/><circle cx="104" cy="58" r="30" fill="#ec4899" opacity=".8"/><circle cx="128" cy="24" r="18" fill="#f59e0b" opacity=".8"/>`
    )
  },
  {
    id: "flower-field",
    title: "Flower field",
    tags: ["flowers", "spring", "field", "nature", "pink"],
    preview: svg(
      `<rect width="160" height="100" fill="#bfdbfe"/><rect y="56" width="160" height="44" fill="#65a30d"/><g>${Array.from({ length: 16 }, (_, index) => `<circle cx="${8 + (index % 8) * 20}" cy="${66 + Math.floor(index / 8) * 18}" r="4" fill="${index % 3 === 0 ? "#facc15" : "#f472b6"}"/>`).join("")}</g>`
    )
  },
  {
    id: "desk-laptop",
    title: "Desk with a laptop",
    tags: ["work", "office", "desk", "laptop", "workspace"],
    preview: svg(
      `<rect width="160" height="100" fill="#e7e5e4"/><rect y="70" width="160" height="30" fill="#a8a29e"/><rect x="44" y="34" width="56" height="36" rx="3" fill="#334155"/><rect x="36" y="70" width="72" height="5" rx="2" fill="#475569"/><rect x="118" y="56" width="14" height="14" rx="2" fill="#f97316"/><path d="M20 70V52M20 56l-8-8M20 58l8-10" stroke="#16a34a" stroke-width="3"/>`
    )
  }
]

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

/** The layers an entry draws: its token's, one of the project's shadow `tokens`, with the override's color, or its own. */
export function layersOf(entry: ShadowEntry, tokens: readonly ShadowToken[]): ShadowLayer[] {
  if (entry.token === undefined) {
    return [entry.layer]
  }

  const token = tokens.find((other) => other.name === entry.token)
  const layers = token?.layers ?? [entry.layer]

  return entry.colorOverride ? layers.map((part) => ({ ...part, ...entry.colorOverride })) : layers
}

/** A shadow's length as the panel writes it: in pixels, with a real minus, `−2px`. */
export const shadowLength = (value: number): string => `${formatNumber(value).replace("-", "−")}px`

/** A layer's X, Y, blur and spread in words: `0px 4px 12px −2px`, each with its unit so none is a bare number. */
export const layerNumbers = (part: ShadowLayer, spread = true): string =>
  [part.x, part.y, part.blur, ...(spread ? [part.spread] : [])].map(shadowLength).join(" ")

/**
 * The layers an entry adds to `box-shadow`, top first: a ring is one layer whose spread is its width, and an inner
 * shadow's layers are drawn inside.
 */
export function boxLayersOf(entry: ShadowEntry, tokens: readonly ShadowToken[]): ShadowLayer[] {
  if (entry.kind === "ring") {
    return [{ ...entry.layer, x: 0, y: 0, blur: 0, spread: entry.width ?? 1, inset: entry.inset }]
  }

  return layersOf(entry, tokens).map((part) => ({ ...part, inset: entry.kind === "inner" || part.inset }))
}

/* Filter list */

/**
 * The adjustments, in the panel's order: brightness, contrast and saturation centered on 0, then hue, then 0 to 100.
 * Each has its unit: hue turns in degrees, and the rest are percentages, a change from 100% for the centered ones
 * (Brightness +25% writes `brightness(125%)`).
 */
export const adjustments = [
  { key: "brightness", label: "Brightness", min: -100, max: 100, unit: "%" },
  { key: "contrast", label: "Contrast", min: -100, max: 100, unit: "%" },
  { key: "saturate", label: "Saturation", min: -100, max: 100, unit: "%" },
  { key: "hue", label: "Hue", min: -180, max: 180, unit: "°" },
  { key: "grayscale", label: "Grayscale", min: 0, max: 100, unit: "%" },
  { key: "sepia", label: "Sepia", min: 0, max: 100, unit: "%" },
  { key: "invert", label: "Invert", min: 0, max: 100, unit: "%" }
] as const

export type AdjustmentKey = (typeof adjustments)[number]["key"]

export type Adjustments = Partial<Record<AdjustmentKey, number>>

/** Tailwind's filter order, which `filter` is composed in whatever order the panel shows. */
export const filterOrder: readonly AdjustmentKey[] = [
  "brightness",
  "contrast",
  "grayscale",
  "hue",
  "invert",
  "saturate",
  "sepia"
]

/** Each adjustment's CSS filter function. */
export const adjustmentFunctions: Readonly<Record<AdjustmentKey, string>> = {
  brightness: "brightness",
  contrast: "contrast",
  saturate: "saturate",
  hue: "hue-rotate",
  grayscale: "grayscale",
  sepia: "sepia",
  invert: "invert"
}

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

/** Whether an entry is the backdrop filter's, behind the layer, rather than the layer's own. */
export const isBehind = (entry: FilterEntry): boolean =>
  entry.kind === "backdropBlur" || ((entry.kind === "adjust" || entry.kind === "custom") && entry.behind === true)

let next = 0

/** An id for a new entry or stop, unique while the story is open. */
export const newId = (prefix: string): string => `${prefix}-${++next}`
