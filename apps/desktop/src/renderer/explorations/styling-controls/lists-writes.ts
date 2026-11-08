/*
 * What the list fields store and write, for the readout beside each story: Fill's paint stack as `background-color` and
 * `background-image` layers, the shadow list in Tailwind's four box-shadow slots (or one arbitrary value when it
 * doesn't fit them), and the filter list in Tailwind's filter order.
 */
import { blurTokens, type Length } from "./data.ts"
import {
  type AdjustmentKey,
  type FilterEntry,
  type GradientPaint,
  type GradientToken,
  gradientTokens,
  type ImagePaint,
  layersOf,
  type ListColor,
  type Paint,
  type PaintEntry,
  type ShadowEntry,
  type ShadowLayer,
  type ShadowToken
} from "./lists-data.ts"
import type { Writes } from "./writes.ts"

const nothing: Writes = { stored: undefined, css: [], tailwind: [] }

const isPlain = (color: string) => color.startsWith("#") || color.startsWith("oklch")

const alphaHex = (alpha: number) =>
  Math.round((alpha / 100) * 255)
    .toString(16)
    .padStart(2, "0")

/** A color as CSS: a token's variable, mixed toward transparent for its alpha, or a plain color with its alpha. */
export function colorCss({ color, alpha }: ListColor): string {
  if (isPlain(color)) {
    if (alpha === undefined) return color
    return color.startsWith("#") ? `${color.slice(0, 7)}${alphaHex(alpha)}` : color.replace(/\)$/, ` / ${alpha}%)`)
  }
  const variable = `var(--color-${color})`
  return alpha === undefined ? variable : `color-mix(in oklab, ${variable} ${alpha}%, transparent)`
}

/** A color after a utility's prefix: `blue-500/50`, or `[#2563eb80]` for a plain color. */
export function colorClass(value: ListColor): string {
  if (isPlain(value.color)) return `[${colorCss(value).replaceAll(" ", "_")}]`
  return value.alpha === undefined ? value.color : `${value.color}/${value.alpha}`
}

/** A color as it's stored: `{ token, alpha }` or `{ value }` with its alpha in it. */
export function colorStored(value: ListColor, allowed?: string): unknown {
  if (isPlain(value.color)) return { value: colorCss(value), ...(allowed === undefined ? {} : { allow: allowed }) }
  return { token: value.color, ...(value.alpha === undefined ? {} : { alpha: { step: value.alpha } }) }
}

/** Underscores for spaces, as Tailwind's arbitrary values take them. */
const arbitrary = (css: string) => css.replaceAll(", ", ",").replaceAll(" ", "_")

/* Paint stack */

/** The stops as CSS, with a color hint between two stops where it's set: `red 0%, 30%, blue 100%`. */
function stopsCss(paint: GradientPaint, color: (value: ListColor) => string): string {
  const stops = [...paint.stops].sort((a, b) => a.position - b.position)
  return stops
    .flatMap((stop, index) => {
      const own = `${color(stop)} ${stop.position}%`
      return stop.hint !== undefined && index < stops.length - 1 ? [own, `${stop.hint}%`] : [own]
    })
    .join(", ")
}

/** Where a gradient starts: the angle, or the center, then how it blends. */
function gradientHead(paint: GradientPaint): string {
  const blend = `in ${paint.interpolation ?? "oklab"}`
  const [x, y] = paint.center ?? [50, 50]
  if (paint.kind === "linear") return `${paint.angle}deg ${blend}`
  if (paint.kind === "radial") return `at ${x}% ${y}% ${blend}`
  return `from ${paint.angle}deg at ${x}% ${y}% ${blend}`
}

const gradientFunction = { linear: "linear-gradient", radial: "radial-gradient", angular: "conic-gradient" } as const

/** A gradient as CSS, its colors as the given function writes them: variables for the readout, hex for drawing. */
export function gradientCss(paint: GradientPaint, color: (value: ListColor) => string = colorCss): string {
  const name = `${paint.repeat ? "repeating-" : ""}${gradientFunction[paint.kind]}`
  return `${name}(${gradientHead(paint)}, ${stopsCss(paint, color)})`
}

/** A gradient token's paint, or the paint as it is. */
export function resolveGradient(paint: GradientPaint, saved: GradientToken[] = []): GradientPaint {
  if (paint.token === undefined) return paint
  const token = [...gradientTokens, ...saved].find((other) => other.name === paint.token)
  return token ? { ...token.paint, token: paint.token } : paint
}

/** The four sides, which are the angles: a diagonal's `to top right` isn't 45° unless the box is square. */
const namedDirections: Record<number, string> = { 0: "t", 90: "r", 180: "b", 270: "l" }

/** Whether a gradient is written as utilities: two or three stops, no color hints, not repeating. */
export const simpleGradient = (paint: GradientPaint): boolean =>
  !paint.repeat &&
  paint.stops.length <= 3 &&
  paint.stops.every((stop) => stop.hint === undefined) &&
  Number.isInteger(paint.angle) &&
  (paint.kind !== "angular" || paint.center === undefined || (paint.center[0] === 50 && paint.center[1] === 50))

function gradientClasses(paint: GradientPaint): string[] {
  if (paint.token !== undefined) return [`bg-(image:--${paint.token})`]
  const modifier = paint.interpolation && paint.interpolation !== "oklab" ? `/${paint.interpolation}` : ""
  if (!simpleGradient(paint)) {
    if (paint.repeat) return [`bg-[${arbitrary(gradientCss(paint))}]`]
    const head = gradientHead(paint).replace(/ in oklab$/, "")
    const prefix = { linear: "bg-linear", radial: "bg-radial", angular: "bg-conic" }[paint.kind]
    return [`${prefix}-[${arbitrary(`${head}, ${stopsCss(paint, colorCss)}`)}]`]
  }
  let direction: string
  if (paint.kind === "linear") {
    const angle = ((paint.angle % 360) + 360) % 360
    const named = namedDirections[angle]
    if (named) direction = `bg-linear-to-${named}`
    else direction = paint.angle < 0 ? `-bg-linear-${-paint.angle}` : `bg-linear-${paint.angle}`
  } else if (paint.kind === "radial") {
    const [x, y] = paint.center ?? [50, 50]
    direction = x === 50 && y === 50 ? "bg-radial" : `bg-radial-[at_${x}%_${y}%]`
  } else {
    direction = paint.angle === 0 ? "bg-conic" : `bg-conic-${paint.angle}`
  }
  const stops = [...paint.stops].sort((a, b) => a.position - b.position)
  const first = stops[0]!
  const last = stops.at(-1)!
  const middle = stops.length === 3 ? stops[1] : undefined
  const classes = [`${direction}${modifier}`, `from-${colorClass(first)}`]
  if (first.position !== 0) classes.push(`from-${first.position}%`)
  if (middle) {
    classes.push(`via-${colorClass(middle)}`)
    if (middle.position !== 50) classes.push(`via-${middle.position}%`)
  }
  classes.push(`to-${colorClass(last)}`)
  if (last.position !== 100) classes.push(`to-${last.position}%`)
  return classes
}

const imageSize = { fill: "cover", fit: "contain", crop: "", tile: "auto" } as const

const spotNames: Record<string, string> = {
  "0 0": "top-left",
  "50 0": "top",
  "100 0": "top-right",
  "0 50": "left",
  "50 50": "center",
  "100 50": "right",
  "0 100": "bottom-left",
  "50 100": "bottom",
  "100 100": "bottom-right"
}

/** An image fill's size, as CSS. */
export const imageSizeCss = (paint: ImagePaint): string =>
  paint.fit === "crop" ? `${paint.scale ?? 150}%` : imageSize[paint.fit]

function imageClasses(paint: ImagePaint): string[] {
  const [x, y] = paint.position
  const spot = spotNames[`${x} ${y}`]
  return [
    `bg-[url(${paint.src})]`,
    paint.fit === "crop" ? `bg-size-[${paint.scale ?? 150}%]` : `bg-${imageSize[paint.fit]}`,
    spot ? `bg-${spot}` : `bg-position-[${x}%_${y}%]`,
    paint.fit === "tile" ? "bg-repeat" : "bg-no-repeat"
  ]
}

/** A fill as a `background-image` layer: a solid above the bottom one is `linear-gradient(c, c)`. */
export function layerCss(paint: Paint, color: (value: ListColor) => string = colorCss, src?: string): string {
  if (paint.kind === "solid") return `linear-gradient(${color(paint)}, ${color(paint)})`
  if (paint.kind === "image") return `url(${src ?? paint.src})`
  return gradientCss(paint, color)
}

function paintStored(entry: PaintEntry): unknown {
  const { paint } = entry
  const off = entry.off ? { off: true } : {}
  if (paint.kind === "solid") return { solid: colorStored(paint, paint.allowed), ...off }
  if (paint.kind === "image") {
    return {
      image: paint.src,
      fit: { keyword: paint.fit },
      position: paint.position.map((value) => `${value}%`),
      ...off
    }
  }
  if (paint.token !== undefined) return { gradient: { token: paint.token }, ...off }
  return {
    gradient: paint.kind,
    angle: { value: `${paint.angle}deg` },
    stops: paint.stops.map((stop) => ({
      position: `${stop.position}%`,
      color: colorStored(stop),
      ...(stop.hint === undefined ? {} : { hint: `${stop.hint}%` })
    })),
    ...(paint.repeat ? { repeat: true } : {}),
    ...(paint.interpolation && paint.interpolation !== "oklab" ? { interpolation: paint.interpolation } : {}),
    ...off
  }
}

/** The fills drawn, top first: the bottom solid as the color, the rest as image layers. */
export function paintLayers(entries: PaintEntry[], saved: GradientToken[] = []) {
  // A solid whose color was taken off draws nothing until another is typed or picked.
  const shown = entries
    .filter((entry) => !entry.off && !(entry.paint.kind === "solid" && entry.paint.color === ""))
    .map((entry) =>
      entry.paint.kind === "linear" || entry.paint.kind === "radial" || entry.paint.kind === "angular"
        ? { ...entry, paint: resolveGradient(entry.paint, saved) }
        : entry
    )
  const bottom = shown.at(-1)
  const base = bottom?.paint.kind === "solid" ? bottom.paint : undefined
  return { base, images: base ? shown.slice(0, -1) : shown }
}

/** Whether the fills need one arbitrary value: more than one layer above the bottom fill, or a long gradient. */
export function paintIsArbitrary(entries: PaintEntry[], saved: GradientToken[] = []): boolean {
  const { images } = paintLayers(entries, saved)
  if (images.length > 1) return true
  const only = images[0]?.paint
  return (
    only !== undefined &&
    only.kind !== "solid" &&
    only.kind !== "image" &&
    only.token === undefined &&
    !simpleGradient(only)
  )
}

export function paintWrites(entries: PaintEntry[], saved: GradientToken[] = []): Writes {
  if (entries.length === 0) return nothing
  const { base, images } = paintLayers(entries, saved)
  const css: string[] = []
  const tailwind: string[] = []
  if (base) {
    css.push(`background-color: ${colorCss(base)}`)
    tailwind.push(`bg-${colorClass(base)}`)
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
    const only = images.length === 1 ? images[0]!.paint : undefined
    if (only?.kind === "image") tailwind.push(...imageClasses(only))
    else if (only && only.kind !== "solid") tailwind.push(...gradientClasses(only))
    else {
      tailwind.push(`bg-[${arbitrary(images.map((entry) => layerCss(entry.paint)).join(", "))}]`)
      // Each layer's size, position and repeat, in the same order, where an image is among them.
      if (withImage) {
        tailwind.push(
          ...css
            .filter((line) => /^background-(size|position|repeat):/.test(line))
            .map((line) => {
              const [property, value] = line.split(": ")
              return property === "background-repeat"
                ? `[background-repeat:${arbitrary(value!)}]`
                : `bg-${property!.replace("background-", "")}-[${arbitrary(value!)}]`
            })
        )
      }
    }
  }
  return { stored: { background: entries.map(paintStored) }, css, tailwind }
}

/* Shadow list */

const px = (value: number) => (value === 0 ? "0" : `${value}px`)

/** A box shadow's layer as CSS: `inset 0 4px 12px -2px color`. */
function layerShadowCss(part: ShadowLayer, inset: boolean, spread = true): string {
  const numbers = [part.x, part.y, part.blur, ...(spread ? [part.spread] : [])].map(px).join(" ")
  return `${inset || part.inset ? "inset " : ""}${numbers} ${colorCss(part)}`
}

/** Which of Tailwind's box-shadow slots an entry takes, in the order they paint, top first. */
const slotOf = (entry: ShadowEntry): number => {
  if (entry.kind === "inner") return 0
  if (entry.kind === "ring") return entry.inset ? 1 : 2
  return 3
}

/** An entry's box-shadow layers as CSS, top first. */
function entryShadowCss(entry: ShadowEntry, saved: ShadowToken[]): string[] {
  if (entry.kind === "ring") {
    return [`${entry.inset ? "inset " : ""}0 0 0 ${entry.width ?? 1}px ${colorCss(entry.layer)}`]
  }
  return layersOf(entry, saved).map((part) => layerShadowCss(part, entry.kind === "inner"))
}

function entryShadowClasses(entry: ShadowEntry): string[] {
  if (entry.kind === "ring") {
    const prefix = entry.inset ? "inset-ring" : "ring"
    return [`${prefix}-${entry.width ?? 1}`, `${prefix}-${colorClass(entry.layer)}`]
  }
  const prefix = entry.kind === "inner" ? "inset-shadow" : "shadow"
  if (entry.token !== undefined) {
    return [entry.token, ...(entry.colorOverride ? [`${prefix}-${colorClass(entry.colorOverride)}`] : [])]
  }
  return [`${prefix}-[${arbitrary(layerShadowCss(entry.layer, false))}]`]
}

/** How an entry is written: in a box-shadow slot, as the text's shadow, or as a drop shadow that follows the shape. */
export function shadowTarget(entry: ShadowEntry, shadowOfText: boolean): "box" | "text" | "follow" {
  if (entry.kind !== "drop") return "box"
  if (entry.follow) return "follow"
  return shadowOfText ? "text" : "box"
}

/** Whether the box shadows fit Tailwind's four slots: one entry in each at most, in the order they paint. */
export function shadowsFitSlots(entries: ShadowEntry[], shadowOfText = false): boolean {
  const slots = entries.filter((entry) => !entry.off && shadowTarget(entry, shadowOfText) === "box").map(slotOf)
  return slots.every((slot, index) => index === 0 || slot > slots[index - 1]!)
}

function shadowStored(entry: ShadowEntry): unknown {
  const off = entry.off ? { off: true } : {}
  if (entry.kind === "ring") {
    return {
      ring: { step: entry.width ?? 1 },
      color: colorStored(entry.layer),
      ...(entry.inset ? { inset: true } : {}),
      ...off
    }
  }
  if (entry.token !== undefined) {
    return {
      token: entry.token,
      ...(entry.colorOverride ? { color: colorStored(entry.colorOverride) } : {}),
      ...off
    }
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

export function shadowWrites(
  entries: ShadowEntry[],
  { shadowOfText = false, saved = [] }: { shadowOfText?: boolean; saved?: ShadowToken[] } = {}
): Writes {
  if (entries.length === 0) return nothing
  const shown = entries.filter((entry) => !entry.off)
  const box = shown.filter((entry) => shadowTarget(entry, shadowOfText) === "box")
  const text = shown.filter((entry) => shadowTarget(entry, shadowOfText) === "text")
  const follow = shown.filter((entry) => shadowTarget(entry, shadowOfText) === "follow")
  const css: string[] = []
  const tailwind: string[] = []
  if (box.length > 0) {
    css.push(`box-shadow: ${box.flatMap((entry) => entryShadowCss(entry, saved)).join(", ")}`)
    if (shadowsFitSlots(entries, shadowOfText)) tailwind.push(...box.flatMap(entryShadowClasses))
    else {
      const parts = box.flatMap((entry) =>
        entry.token !== undefined && !entry.colorOverride ? [`var(--${entry.token})`] : entryShadowCss(entry, saved)
      )
      tailwind.push(`shadow-[${arbitrary(parts.join(", "))}]`)
    }
  }
  for (const entry of text) {
    css.push(
      `text-shadow: ${layersOf(entry, saved)
        .map((part) => layerShadowCss(part, false, false))
        .join(", ")}`
    )
    tailwind.push(
      entry.token === undefined ? `text-shadow-[${arbitrary(layerShadowCss(entry.layer, false, false))}]` : entry.token,
      ...(entry.token !== undefined && entry.colorOverride ? [`text-shadow-${colorClass(entry.colorOverride)}`] : [])
    )
  }
  for (const entry of follow) {
    css.push(
      `filter: ${layersOf(entry, saved)
        .map((part) => `drop-shadow(${layerShadowCss(part, false, false)})`)
        .join(" ")}`
    )
    tailwind.push(...dropShadowClasses(entry))
  }
  const stored: Record<string, unknown> = {}
  const boxStored = entries.filter((entry) => shadowTarget(entry, shadowOfText) === "box")
  if (boxStored.length > 0) stored.boxShadow = boxStored.map(shadowStored)
  const textStored = entries.filter((entry) => shadowTarget(entry, shadowOfText) === "text")
  if (textStored.length > 0) stored.textShadow = textStored.map(shadowStored)
  const followStored = entries.filter((entry) => shadowTarget(entry, shadowOfText) === "follow")
  if (followStored.length > 0) stored.dropShadow = followStored.map(shadowStored)
  return { stored, css, tailwind }
}

/** A drop shadow that follows the shape, in the filter list's last place: `drop-shadow-md`, or its own values. */
export function dropShadowClasses(entry: ShadowEntry): string[] {
  if (entry.token !== undefined) {
    return [entry.token, ...(entry.colorOverride ? [`drop-shadow-${colorClass(entry.colorOverride)}`] : [])]
  }
  return [`drop-shadow-[${arbitrary(layerShadowCss(entry.layer, false, false))}]`]
}

/** The CSS a box-shadow list draws with, colors as hex, for a preview. */
export function shadowDrawing(entries: ShadowEntry[], draw: (value: ListColor) => string, saved: ShadowToken[] = []) {
  const shown = entries.filter((entry) => !entry.off)
  const layer = (part: ShadowLayer, inset: boolean, spread = true) =>
    `${inset || part.inset ? "inset " : ""}${[part.x, part.y, part.blur, ...(spread ? [part.spread] : [])].map(px).join(" ")} ${draw(part)}`
  return {
    boxShadow: shown
      .filter((entry) => entry.kind !== "drop" || !entry.follow)
      .flatMap((entry) =>
        entry.kind === "ring"
          ? [`${entry.inset ? "inset " : ""}0 0 0 ${entry.width ?? 1}px ${draw(entry.layer)}`]
          : layersOf(entry, saved).map((part) => layer(part, entry.kind === "inner"))
      )
      .join(", "),
    textShadow: shown
      .filter((entry) => entry.kind === "drop" && !entry.follow)
      .flatMap((entry) => layersOf(entry, saved).map((part) => layer(part, false, false)))
      .join(", "),
    dropShadow: shown
      .filter((entry) => entry.kind === "drop" && entry.follow)
      .flatMap((entry) => layersOf(entry, saved).map((part) => `drop-shadow(${layer(part, false, false)})`))
      .join(" ")
  }
}

/* Filter list */

/** Tailwind's filter order, which `filter` is composed in whatever order the panel shows. */
const filterOrder: AdjustmentKey[] = ["brightness", "contrast", "grayscale", "hue", "invert", "saturate", "sepia"]

/** An adjustment as a CSS function and a class: +25 brightness is `brightness(125%)` and `brightness-125`. */
export function adjustmentWrites(key: AdjustmentKey, value: number): { css: string; className: string } {
  if (key === "hue") {
    return { css: `hue-rotate(${value}deg)`, className: value < 0 ? `-hue-rotate-${-value}` : `hue-rotate-${value}` }
  }
  if (key === "brightness" || key === "contrast" || key === "saturate") {
    return { css: `${key}(${100 + value}%)`, className: `${key}-${100 + value}` }
  }
  return { css: `${key}(${value}%)`, className: value === 100 ? key : `${key}-${value}` }
}

/** An adjustment at its neutral value writes nothing. */
const neutral = (value: number | undefined) => value === undefined || value === 0

function blurWrite(value: Length, behind: boolean) {
  const prefix = behind ? "backdrop-blur" : "blur"
  if (typeof value === "string") {
    const known = blurTokens.some((token) => token.name === value)
    return {
      css: `blur(var(--${value}))`,
      className: known ? `${prefix}-${value.replace("blur-", "")}` : `${prefix}-(--${value})`
    }
  }
  return { css: `blur(${value.px}px)`, className: `${prefix}-[${value.px}px]` }
}

function filterStored(entry: FilterEntry): unknown {
  const off = entry.off ? { off: true } : {}
  if (entry.kind === "blur" || entry.kind === "backdropBlur") {
    if (entry.value === undefined) return { blur: undefined, ...off }
    if (typeof entry.value === "string") return { blur: { token: entry.value }, ...off }
    const allow = entry.value.allow === undefined ? {} : { allow: entry.value.allow }
    return { blur: { value: `${entry.value.px}px`, ...allow }, ...off }
  }
  if (entry.kind === "adjust") {
    const set = Object.entries(entry.values).filter(([, value]) => !neutral(value))
    return { adjustments: Object.fromEntries(set), ...off }
  }
  if (entry.kind === "custom") return { custom: entry.text, ...off }
  return { dropShadow: shadowStored(entry.shadow), ...off }
}

/** One property's functions and classes, in Tailwind's order, or the Custom text with the rest after it. */
function propertyWrites(entries: FilterEntry[], behind: boolean) {
  const functions: string[] = []
  const classes: string[] = []
  const prefix = behind ? "backdrop-" : ""
  const custom = entries.find((entry) => entry.kind === "custom")
  for (const entry of entries) {
    if ((entry.kind === "blur" || entry.kind === "backdropBlur") && entry.value !== undefined) {
      const write = blurWrite(entry.value, behind)
      functions.push(write.css)
      classes.push(write.className)
    }
  }
  for (const entry of entries) {
    if (entry.kind !== "adjust") continue
    for (const key of filterOrder) {
      const value = entry.values[key]
      if (neutral(value)) continue
      const write = adjustmentWrites(key, value!)
      functions.push(write.css)
      classes.push(`${prefix}${write.className}`)
    }
  }
  for (const entry of entries) {
    if (entry.kind !== "dropShadow") continue
    for (const part of layersOf(entry.shadow)) {
      functions.push(`drop-shadow(${layerShadowCss(part, false, false)})`)
    }
    classes.push(...dropShadowClasses(entry.shadow))
  }
  if (custom?.kind === "custom") {
    const all = [custom.text, ...functions].join(" ")
    return { functions: [all], classes: [`${behind ? "backdrop-filter" : "filter"}-[${arbitrary(all)}]`] }
  }
  return { functions, classes }
}

export function filterWrites(entries: FilterEntry[]): Writes {
  if (entries.length === 0) return nothing
  const shown = entries.filter((entry) => !entry.off)
  const behind = (entry: FilterEntry) =>
    entry.kind === "backdropBlur" || ((entry.kind === "adjust" || entry.kind === "custom") && entry.behind === true)
  const layer = propertyWrites(
    shown.filter((entry) => !behind(entry)),
    false
  )
  const back = propertyWrites(shown.filter(behind), true)
  const css: string[] = []
  if (layer.functions.length > 0) css.push(`filter: ${layer.functions.join(" ")}`)
  if (back.functions.length > 0) css.push(`backdrop-filter: ${back.functions.join(" ")}`)
  const stored: Record<string, unknown> = {}
  const layerEntries = entries.filter((entry) => !behind(entry))
  const backEntries = entries.filter(behind)
  if (layerEntries.length > 0) stored.filter = layerEntries.map(filterStored)
  if (backEntries.length > 0) stored.backdropFilter = backEntries.map(filterStored)
  return { stored, css, tailwind: [...layer.classes, ...back.classes] }
}

/** The CSS a filter list draws with, for a preview: hex colors in drop shadows. */
export function filterDrawing(entries: FilterEntry[], draw: (value: ListColor) => string) {
  const shown = entries.filter((entry) => !entry.off)
  const behind = (entry: FilterEntry) =>
    entry.kind === "backdropBlur" || ((entry.kind === "adjust" || entry.kind === "custom") && entry.behind === true)
  const functions = (list: FilterEntry[]) => {
    const out: string[] = []
    for (const entry of list) {
      if ((entry.kind === "blur" || entry.kind === "backdropBlur") && entry.value !== undefined) {
        const px =
          typeof entry.value === "string"
            ? (blurTokens.find((token) => token.name === entry.value)?.px ?? 0)
            : entry.value.px
        out.push(`blur(${px}px)`)
      }
    }
    for (const entry of list) {
      if (entry.kind === "custom") out.unshift(entry.text)
      if (entry.kind !== "adjust") continue
      for (const key of filterOrder) {
        const value = entry.values[key]
        if (!neutral(value)) out.push(adjustmentWrites(key, value!).css)
      }
    }
    for (const entry of list) {
      if (entry.kind !== "dropShadow") continue
      for (const part of layersOf(entry.shadow)) {
        out.push(`drop-shadow(${part.x}px ${part.y}px ${part.blur}px ${draw(part)})`)
      }
    }
    return out.join(" ") || undefined
  }
  return { filter: functions(shown.filter((entry) => !behind(entry))), backdropFilter: functions(shown.filter(behind)) }
}
