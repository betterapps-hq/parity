import { type Filter, type FilterAdjustment, filterAdjustments, type NodeStyle, type Shadow } from "./model.ts"
import { colorCss } from "./paint.ts"
import { namedCss, spacing, token } from "./value.ts"

// The CSS of a layer's effects (PAR-933): its shadow stack, its filters and those behind it, and its transform.
// declare.ts writes them as the layer's declarations.

const px = (value: number) => (value === 0 ? "0" : `${value}px`)

/**
 * One shadow as `box-shadow` takes it. A token is drawn as the project defines it: its color can't be changed from its
 * variable, so a token's color is the panel's and the code's, not the frame's.
 */
function shadowLayerCss(entry: Shadow): string {
  if ("token" in entry) {
    return token(entry.token)
  }

  if (entry.type === "ring") {
    return `${entry.inset ? "inset " : ""}0 0 0 ${px(entry.width)} ${colorCss(entry.color)}`
  }

  const numbers = [entry.x, entry.y, entry.blur, entry.spread].map(px).join(" ")

  return `${entry.type === "inner" ? "inset " : ""}${numbers} ${colorCss(entry.color)}`
}

/** A layer's `box-shadow`: the stack's shadows that are on, top first, as CSS lists them. */
export function shadowCss(value: NodeStyle["boxShadow"]): string | undefined {
  const layers = (value ?? []).filter((entry) => !entry.off).map(shadowLayerCss)

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

  if (entry.type === "ring") {
    return undefined
  }

  return `drop-shadow(${[entry.x, entry.y, entry.blur].map(px).join(" ")} ${colorCss(entry.color)})`
}

function filterFunctions(entry: Filter): string[] {
  switch (entry.type) {
    case "blur":
      return [`blur(${namedCss(entry.value)})`]
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

/** A transform's CSS, by property as CSS spells it. */
export interface TransformCss {
  translate?: string
  rotate?: string
  scale?: string
  transform?: string
  "transform-origin"?: string
}

/** The keys that hold a layer's transform, each named after the CSS property it writes. */
export type TransformStyle = Pick<NodeStyle, "translate" | "rotate" | "scale" | "transform" | "transformOrigin">

/**
 * A layer's transform as CSS's `translate`, `rotate` and `scale`, which apply in that order whatever the order they're
 * set, with skew in `transform`, which applies after them, and the origin.
 */
export function transformCss(style: TransformStyle): TransformCss {
  const css: TransformCss = {}
  const { translate, rotate, scale, transform, transformOrigin } = style

  if (translate && (translate.x !== undefined || translate.y !== undefined)) {
    css.translate = `${spacing(translate.x ?? { step: 0 })} ${spacing(translate.y ?? { step: 0 })}`
  }

  if (rotate !== undefined) {
    css.rotate = `${rotate}deg`
  }

  if (scale && (scale.x !== undefined || scale.y !== undefined)) {
    css.scale = `${(scale.x ?? 100) / 100} ${(scale.y ?? 100) / 100}`
  }

  const functions = (transform ?? []).filter((entry) => !entry.off).map((entry) => `${entry.type}(${entry.value}deg)`)

  if (functions.length > 0) {
    css.transform = functions.join(" ")
  }

  if (transformOrigin) {
    css["transform-origin"] = `${transformOrigin.x}% ${transformOrigin.y}%`
  }

  return css
}
