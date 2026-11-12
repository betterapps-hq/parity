import {
  type EffectColor,
  type Filter,
  type FilterAdjustment,
  filterAdjustments,
  isNamedLength,
  type Length,
  type Move,
  type NodeStyle,
  type Shadow,
  type Transform
} from "./model.ts"

// The CSS of a layer's effects (PAR-933): its shadow stack, its filters and those behind it, and its transform.
// declare.ts writes them as the layer's declarations.

/** A step of the spacing scale (a multiple of the project's spacing unit), or a length token. */
export function spacing(value: Length): string {
  if (isNamedLength(value)) {
    return token(value)
  }

  return value === 0 ? "0" : `calc(var(--spacing) * ${value})`
}

/** A reference to one of the project's custom properties. */
export function token(name: string): string {
  return `var(--${name})`
}

/**
 * A color token, or a plain color (`#2563eb`, `oklch(…)`) as written, which lint warns about, mixed toward transparent
 * when it has an alpha.
 */
function effectColorCss({ color, alpha }: EffectColor): string {
  const base = /^#|^oklch\(/i.test(color) ? color : token(color)

  return alpha === undefined ? base : `color-mix(in oklab, ${base} ${alpha}%, transparent)`
}

const px = (value: number) => (value === 0 ? "0" : `${value}px`)

/**
 * One shadow as `box-shadow` takes it. A token is drawn as the project defines it: its color can't be changed from its
 * variable, so a token's color is the panel's and the code's, not the frame's.
 */
function shadowLayerCss(entry: Shadow): string {
  if ("token" in entry) {
    return token(entry.token)
  }

  if (entry.kind === "ring") {
    return `${entry.inset ? "inset " : ""}0 0 0 ${px(entry.width)} ${effectColorCss(entry.color)}`
  }

  const numbers = [entry.x, entry.y, entry.blur, entry.spread].map(px).join(" ")

  return `${entry.kind === "inner" ? "inset " : ""}${numbers} ${effectColorCss(entry.color)}`
}

/** A layer's `box-shadow`: one token, or the stack's shadows that are on, top first, as CSS lists them. */
export function shadowCss(value: NodeStyle["shadow"]): string | undefined {
  if (value === undefined || value === "") {
    return undefined
  }

  if (!Array.isArray(value)) {
    return token(value)
  }

  const layers = value.filter((entry) => !entry.off).map(shadowLayerCss)

  return layers.length > 0 ? layers.join(", ") : undefined
}

/** Each adjustment's CSS function. */
const adjustmentFunctions: Readonly<Record<FilterAdjustment, string>> = {
  brightness: "brightness",
  contrast: "contrast",
  saturate: "saturate",
  hue: "hue-rotate",
  grayscale: "grayscale",
  sepia: "sepia",
  invert: "invert"
}

/** Brightness, contrast and saturation are a change from 100%, so +25 is 125%. */
const centered: ReadonlySet<FilterAdjustment> = new Set(["brightness", "contrast", "saturate"])

function adjustmentCss(key: FilterAdjustment, value: number): string {
  if (key === "hue") {
    return `hue-rotate(${value}deg)`
  }

  return `${adjustmentFunctions[key]}(${centered.has(key) ? 100 + value : value}%)`
}

/** A drop shadow as `drop-shadow()` takes it: no spread, and a token drawn as the project defines it. */
function dropShadowCss(entry: Shadow): string | undefined {
  if ("token" in entry) {
    return `drop-shadow(${token(entry.token)})`
  }

  if (entry.kind === "ring") {
    return undefined
  }

  return `drop-shadow(${[entry.x, entry.y, entry.blur].map(px).join(" ")} ${effectColorCss(entry.color)})`
}

function filterFunctions(entry: Filter): string[] {
  switch (entry.kind) {
    case "blur":
      return [`blur(${token(entry.value)})`]
    case "adjust":
      return filterAdjustments.flatMap((key) => {
        const value = entry.values[key]

        return value === undefined || value === 0 ? [] : [adjustmentCss(key, value)]
      })
    case "dropShadow": {
      const css = entry.shadow.off ? undefined : dropShadowCss(entry.shadow)

      return css ? [css] : []
    }
  }
}

/** A `filter` or `backdrop-filter`: the functions of the entries that are on, in the list's order. */
export function filterCss(entries: readonly Filter[] | undefined): string | undefined {
  const functions = (entries ?? []).filter((entry) => !entry.off).flatMap(filterFunctions)

  return functions.length > 0 ? functions.join(" ") : undefined
}

function moveCss(value: Move): string {
  return value instanceof Object ? `${value.percent}%` : spacing(value)
}

/** A transform's CSS, by property as CSS spells it. */
export interface TransformCss {
  translate?: string
  rotate?: string
  scale?: string
  transform?: string
  "transform-origin"?: string
}

/**
 * A transform as CSS's `translate`, `rotate` and `scale`, which apply in that order whatever the order they're set,
 * with skew in `transform`, which applies after them, and the origin.
 */
export function transformCss(value: Transform | undefined): TransformCss {
  const css: TransformCss = {}

  if (!value) {
    return css
  }

  if (value.x !== undefined || value.y !== undefined) {
    css.translate = `${moveCss(value.x ?? 0)} ${moveCss(value.y ?? 0)}`
  }

  if (value.rotate !== undefined) {
    css.rotate = `${value.rotate}deg`
  }

  if (value.scaleX !== undefined || value.scaleY !== undefined) {
    css.scale = `${(value.scaleX ?? 100) / 100} ${(value.scaleY ?? 100) / 100}`
  }

  const skew = [
    value.skewX === undefined ? undefined : `skewX(${value.skewX}deg)`,
    value.skewY === undefined ? undefined : `skewY(${value.skewY}deg)`
  ].filter(Boolean)

  if (skew.length > 0) {
    css.transform = skew.join(" ")
  }

  if (value.origin) {
    css["transform-origin"] = `${value.origin.x}% ${value.origin.y}%`
  }

  return css
}
