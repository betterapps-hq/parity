/*
 * What the list fields store and write, for the readout beside each story: Fill's paint stack as `background-color` and
 * `background-image` layers, the shadow list as box, text and drop shadows, and the filter list in Tailwind's filter
 * order. Colors, shadows and gradients are written by css-values.ts, as every writer's are.
 */
import { formatNumber } from "@parity-app/style-schema"
import { colorCss, gradientCss, isPlainColor, shadowCss } from "./css-values.ts"
import { isLengthToken, type Length } from "./data.ts"
import {
  type AdjustmentKey,
  adjustmentFunctions,
  boxLayersOf,
  type FilterEntry,
  filterOrder,
  type GradientPaint,
  type ImagePaint,
  isBehind,
  layersOf,
  type ListColor,
  type Paint,
  type PaintEntry,
  type ShadowEntry
} from "./lists-data.ts"
import { type GradientToken, type LengthToken, lengthPx, type ShadowToken } from "./tokens.ts"
import { noWrites, type StoredObject, withAllow, type Writes } from "./writes.ts"

/** A list entry's color as CSS writes it: a token's variable, mixed toward transparent for its alpha, or a plain color. */
const listColorCss = ({ color, alpha }: ListColor): string => colorCss(color, alpha)

/** A color as it's stored: `{ token, alpha }` or `{ value }` with its alpha in it. */
export function colorStored(value: ListColor, allowed?: string): StoredObject {
  if (isPlainColor(value.color)) {
    return withAllow({ value: listColorCss(value) }, allowed)
  }

  const stored: StoredObject = { token: value.color }

  if (value.alpha !== undefined) {
    stored.alpha = { step: value.alpha }
  }

  return stored
}

/* Paint stack */

/**
 * A gradient token's paint, among the project's `tokens`, or the paint as it is, which keeps the stops it had when the
 * token was taken.
 */
export function resolveGradient(paint: GradientPaint, tokens: readonly GradientToken[]): GradientPaint {
  if (paint.token === undefined) {
    return paint
  }

  const token = tokens.find((other) => other.name === paint.token)

  return token ? { ...token.paint, token: paint.token } : paint
}

/** Whether a gradient is written as utilities: two or three stops, no color hints, not repeating. */
export const simpleGradient = (paint: GradientPaint): boolean =>
  !paint.repeat &&
  paint.stops.length <= 3 &&
  paint.stops.every((stop) => stop.hint === undefined) &&
  Number.isInteger(paint.angle) &&
  (paint.kind !== "angular" || paint.center === undefined || (paint.center[0] === 50 && paint.center[1] === 50))

const imageSize = { fill: "cover", fit: "contain", crop: "", tile: "auto" } as const

/** An image fill's size, as CSS. */
export const imageSizeCss = (paint: ImagePaint): string =>
  paint.fit === "crop" ? `${paint.scale ?? 150}%` : imageSize[paint.fit]

/** A fill as a `background-image` layer: a solid above the bottom one is `linear-gradient(c, c)`. */
export function layerCss(paint: Paint, color: (value: ListColor) => string = listColorCss, src?: string): string {
  if (paint.kind === "solid") {
    return `linear-gradient(${color(paint)}, ${color(paint)})`
  }

  if (paint.kind === "image") {
    return `url(${src ?? paint.src})`
  }

  return gradientCss(paint, color)
}

function paintStored(entry: PaintEntry): StoredObject {
  const { paint } = entry
  const off = entry.off ? { off: true } : {}

  if (paint.kind === "solid") {
    return { solid: colorStored(paint, paint.allowed), ...off }
  }

  if (paint.kind === "image") {
    return {
      image: paint.src,
      fit: { keyword: paint.fit },
      position: paint.position.map((value) => `${value}%`),
      ...off
    }
  }

  if (paint.token !== undefined) {
    return { gradient: { token: paint.token }, ...off }
  }

  const stored: StoredObject = {
    gradient: paint.kind,
    angle: { value: `${paint.angle}deg` },
    stops: paint.stops.map((stop) => {
      const stopStored: StoredObject = { position: `${stop.position}%`, color: colorStored(stop) }

      if (stop.hint !== undefined) {
        stopStored.hint = `${stop.hint}%`
      }

      return stopStored
    })
  }

  if (paint.repeat) {
    stored.repeat = true
  }

  if (paint.interpolation && paint.interpolation !== "oklab") {
    stored.interpolation = paint.interpolation
  }

  return { ...stored, ...off }
}

/** The fills drawn, top first: the bottom solid as the color, the rest as image layers. */
export function paintLayers(entries: PaintEntry[], tokens: readonly GradientToken[]) {
  // A solid whose color was taken off draws nothing until another is typed or picked.
  const shown = entries.flatMap((entry) => {
    if (entry.off || (entry.paint.kind === "solid" && entry.paint.color === "")) {
      return []
    }

    return [
      entry.paint.kind === "linear" || entry.paint.kind === "radial" || entry.paint.kind === "angular"
        ? { ...entry, paint: resolveGradient(entry.paint, tokens) }
        : entry
    ]
  })

  const bottom = shown.at(-1)
  const base = bottom?.paint.kind === "solid" ? bottom.paint : undefined

  return { base, images: base ? shown.slice(0, -1) : shown }
}

export function paintWrites(entries: PaintEntry[], tokens: readonly GradientToken[]): Writes {
  if (entries.length === 0) {
    return noWrites
  }

  const { base, images } = paintLayers(entries, tokens)
  const css: string[] = []

  if (base) {
    css.push(`background-color: ${listColorCss(base)}`)
  }

  if (images.length > 0) {
    css.push(`background-image: ${images.map((entry) => layerCss(entry.paint)).join(", ")}`)
    const withImage = images.some((entry) => entry.paint.kind === "image")

    if (withImage) {
      const each = (pick: (paint: ImagePaint) => string, other: string) =>
        images.map((entry) => (entry.paint.kind === "image" ? pick(entry.paint) : other)).join(", ")

      css.push(
        `background-size: ${each(imageSizeCss, "auto")}`,
        `background-position: ${each((paint) => paint.position.map((value) => `${value}%`).join(" "), "0% 0%")}`,
        `background-repeat: ${each((paint) => (paint.fit === "tile" ? "repeat" : "no-repeat"), "repeat")}`
      )
    }
  }

  return { stored: { background: entries.map(paintStored) }, css }
}

/* Shadow list */

/** Which of Tailwind's box-shadow slots an entry takes, in the order they paint, top first. */
const slotOf = (entry: ShadowEntry): number => {
  if (entry.kind === "inner") {
    return 0
  }

  if (entry.kind === "ring") {
    return entry.inset ? 1 : 2
  }

  return 3
}

/** How an entry is written: in a box-shadow slot, as the text's shadow, or as a drop shadow that follows the shape. */
export function shadowTarget(entry: ShadowEntry, shadowOfText: boolean): "box" | "text" | "follow" {
  if (entry.kind !== "drop") {
    return "box"
  }

  if (entry.follow) {
    return "follow"
  }

  return shadowOfText ? "text" : "box"
}

/** Whether the box shadows fit Tailwind's four slots: one entry in each at most, in the order they paint. */
export function shadowsFitSlots(entries: ShadowEntry[], shadowOfText = false): boolean {
  const slots = entries.flatMap((entry) =>
    !entry.off && shadowTarget(entry, shadowOfText) === "box" ? [slotOf(entry)] : []
  )

  return slots.every((slot, index) => index === 0 || slot > slots[index - 1]!)
}

function shadowStored(entry: ShadowEntry): StoredObject {
  const off = entry.off ? { off: true } : {}

  if (entry.kind === "ring") {
    const stored: StoredObject = { ring: { step: entry.width ?? 1 }, color: colorStored(entry.layer) }

    if (entry.inset) {
      stored.inset = true
    }

    return { ...stored, ...off }
  }

  if (entry.token !== undefined) {
    const stored: StoredObject = { token: entry.token }

    if (entry.colorOverride) {
      stored.color = colorStored(entry.colorOverride)
    }

    return { ...stored, ...off }
  }

  const { x, y, blur, spread } = entry.layer

  return {
    [entry.kind === "inner" ? "inner" : "drop"]: [x, y, blur, ...(entry.follow ? [] : [spread])].map((value) => ({
      value: `${value}px`
    })),
    color: colorStored(entry.layer),
    ...off
  }
}

/** A drop shadow's layers as `drop-shadow()` functions, which take no spread. */
function dropShadowFunctions(entry: ShadowEntry, color: (value: ListColor) => string, tokens: readonly ShadowToken[]) {
  return layersOf(entry, tokens).map((part) => `drop-shadow(${shadowCss([part], color, { spread: false })})`)
}

export function shadowWrites(
  entries: ShadowEntry[],
  {
    shadowOfText = false,
    tokens
  }: {
    shadowOfText?: boolean
    /** The project's shadow tokens of every kind. */
    tokens: readonly ShadowToken[]
  }
): Writes {
  if (entries.length === 0) {
    return noWrites
  }

  const shown = entries.filter((entry) => !entry.off)
  const box = shown.filter((entry) => shadowTarget(entry, shadowOfText) === "box")
  const text = shown.filter((entry) => shadowTarget(entry, shadowOfText) === "text")
  const follow = shown.filter((entry) => shadowTarget(entry, shadowOfText) === "follow")
  const css: string[] = []

  if (box.length > 0) {
    css.push(
      `box-shadow: ${shadowCss(
        box.flatMap((entry) => boxLayersOf(entry, tokens)),
        listColorCss
      )}`
    )
  }

  for (const entry of text) {
    css.push(`text-shadow: ${shadowCss(layersOf(entry, tokens), listColorCss, { spread: false })}`)
  }

  for (const entry of follow) {
    css.push(`filter: ${dropShadowFunctions(entry, listColorCss, tokens).join(" ")}`)
  }

  const stored: StoredObject = {}
  const boxStored = entries.filter((entry) => shadowTarget(entry, shadowOfText) === "box")

  if (boxStored.length > 0) {
    stored.boxShadow = boxStored.map(shadowStored)
  }

  const textStored = entries.filter((entry) => shadowTarget(entry, shadowOfText) === "text")

  if (textStored.length > 0) {
    stored.textShadow = textStored.map(shadowStored)
  }

  const followStored = entries.filter((entry) => shadowTarget(entry, shadowOfText) === "follow")

  if (followStored.length > 0) {
    stored.dropShadow = followStored.map(shadowStored)
  }

  return { stored, css }
}

/** The CSS a shadow list draws with, colors as `draw` gives them, for a preview or an entry's card. */
export function shadowDrawing(
  entries: ShadowEntry[],
  draw: (value: ListColor) => string,
  tokens: readonly ShadowToken[]
) {
  const shown = entries.filter((entry) => !entry.off)

  return {
    boxShadow: shadowCss(
      shown.filter((entry) => entry.kind !== "drop" || !entry.follow).flatMap((entry) => boxLayersOf(entry, tokens)),
      draw
    ),
    textShadow: shadowCss(
      shown.filter((entry) => entry.kind === "drop" && !entry.follow).flatMap((entry) => layersOf(entry, tokens)),
      draw,
      { spread: false }
    ),
    dropShadow: shown
      .filter((entry) => entry.kind === "drop" && entry.follow)
      .flatMap((entry) => dropShadowFunctions(entry, draw, tokens))
      .join(" ")
  }
}

/* Filter list */

/** An adjustment as a CSS function and a class: +25 brightness is `brightness(125%)` and `brightness-125`. */
export function adjustmentWrites(key: AdjustmentKey, value: number) {
  const name = adjustmentFunctions[key]

  if (key === "hue") {
    return { css: `${name}(${value}deg)`, className: value < 0 ? `-${name}-${-value}` : `${name}-${value}` }
  }

  if (key === "brightness" || key === "contrast" || key === "saturate") {
    return { css: `${name}(${100 + value}%)`, className: `${name}-${100 + value}` }
  }

  return { css: `${name}(${value}%)`, className: value === 100 ? name : `${name}-${value}` }
}

/** An adjustment at its neutral value writes nothing. */
const neutral = (value: number | undefined) => value === undefined || value === 0

/** The project's tokens a filter list names: its blurs and its drop shadows. */
export interface FilterTokens {
  blur: readonly LengthToken[]
  dropShadow: readonly ShadowToken[]
}

/** A blur as a CSS function: a token's variable, or its own pixels. */
const blurCss = (value: Length) =>
  isLengthToken(value) ? `blur(var(--${value}))` : `blur(${formatNumber(value.px)}px)`

function filterStored(entry: FilterEntry): StoredObject {
  const off = entry.off ? { off: true } : {}

  if (entry.kind === "blur" || entry.kind === "backdropBlur") {
    if (entry.value === undefined) {
      return { blur: undefined, ...off }
    }

    if (isLengthToken(entry.value)) {
      return { blur: { token: entry.value }, ...off }
    }

    return { blur: withAllow({ value: `${entry.value.px}px` }, entry.value.allow), ...off }
  }

  if (entry.kind === "adjust") {
    const set = Object.entries(entry.values).filter(([, value]) => !neutral(value))

    return { adjustments: Object.fromEntries(set), ...off }
  }

  if (entry.kind === "custom") {
    return { custom: entry.text, ...off }
  }

  return { dropShadow: shadowStored(entry.shadow), ...off }
}

/**
 * One property's filter functions in Tailwind's order: blur, the adjustments, then the drop shadow. A Custom entry's
 * text comes first, as it was read. Written, colors and blur tokens are variables; `drawn` gives a preview's colors and
 * draws a blur token at its size, since the story's page doesn't define its variable.
 */
function filterFunctions(entries: FilterEntry[], tokens: FilterTokens, drawn?: (value: ListColor) => string) {
  const functions: string[] = []

  for (const entry of entries) {
    if ((entry.kind === "blur" || entry.kind === "backdropBlur") && entry.value !== undefined) {
      functions.push(drawn ? `blur(${formatNumber(lengthPx(entry.value, tokens.blur))}px)` : blurCss(entry.value))
    }
  }

  for (const entry of entries) {
    if (entry.kind !== "adjust") {
      continue
    }

    for (const key of filterOrder) {
      const value = entry.values[key]

      if (neutral(value)) {
        continue
      }

      functions.push(adjustmentWrites(key, value!).css)
    }
  }

  for (const entry of entries) {
    if (entry.kind !== "dropShadow") {
      continue
    }

    functions.push(...dropShadowFunctions(entry.shadow, drawn ?? listColorCss, tokens.dropShadow))
  }

  const custom = entries.find((entry) => entry.kind === "custom")

  return custom?.kind === "custom" ? [custom.text, ...functions] : functions
}

export function filterWrites(entries: FilterEntry[], tokens: FilterTokens): Writes {
  if (entries.length === 0) {
    return noWrites
  }

  const shown = entries.filter((entry) => !entry.off)

  const layer = filterFunctions(
    shown.filter((entry) => !isBehind(entry)),
    tokens
  )

  const back = filterFunctions(shown.filter(isBehind), tokens)
  const css: string[] = []

  if (layer.length > 0) {
    css.push(`filter: ${layer.join(" ")}`)
  }

  if (back.length > 0) {
    css.push(`backdrop-filter: ${back.join(" ")}`)
  }

  const stored: StoredObject = {}
  const layerEntries = entries.filter((entry) => !isBehind(entry))
  const backEntries = entries.filter(isBehind)

  if (layerEntries.length > 0) {
    stored.filter = layerEntries.map(filterStored)
  }

  if (backEntries.length > 0) {
    stored.backdropFilter = backEntries.map(filterStored)
  }

  return { stored, css }
}

/** The CSS a filter list draws with, for a preview: blur tokens at their size, colors as `draw` gives them. */
export function filterDrawing(entries: FilterEntry[], draw: (value: ListColor) => string, tokens: FilterTokens) {
  const shown = entries.filter((entry) => !entry.off)

  const drawn = (list: FilterEntry[]) => filterFunctions(list, tokens, draw).join(" ") || undefined

  return {
    filter: drawn(shown.filter((entry) => !isBehind(entry))),
    backdropFilter: drawn(shown.filter(isBehind))
  }
}
