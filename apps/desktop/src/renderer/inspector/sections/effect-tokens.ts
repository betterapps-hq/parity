import { defaultValues, previewKind, type Token } from "@parity-app/tokens"
import { px } from "../../lengths.ts"
import { comesTo } from "../../token-values.ts"
import { isPlainColor } from "../controls/css-values.ts"
import type { ShadowLayer } from "../controls/lists-data.ts"
import {
  colorToken,
  type ColorToken,
  type LengthToken,
  lengthToken,
  type ShadowToken,
  shadowToken,
  type TokenSets
} from "../controls/tokens.ts"

/** The sets of the project's tokens Effects offers: colors, shadows of each kind, and blurs. */
export type EffectTokenSets = Pick<TokenSets, "color" | "shadow" | "insetShadow" | "dropShadow" | "blur">

/**
 * The project's own tokens as Effects' controls offer them (`ProjectTokens`' `tokens`), in place of the stand-ins in
 * controls/tokens.ts. Each keeps the name `NodeStyle` holds, and what it comes to, with a shadow's layers read from its
 * value so its card draws it.
 */
export function effectTokenSets(
  tokens: readonly Token[],
  length: (value: string) => number = px,
  toPlain: (value: string) => string = plainColor
): EffectTokenSets {
  const byName = new Map(tokens.map((token) => [token.name, token]))
  const lookup = defaultValues(tokens)

  const read = tokens.map((token) => ({
    name: token.name,
    category: token.category,
    kind: previewKind(token, undefined, lookup),
    value: comesTo(byName, token.name) ?? ""
  }))

  const color: ColorToken[] = read.flatMap((each) =>
    each.category === "color" ? [colorToken(each.name, each.value)] : []
  )

  const shadows = (kind: "shadow" | "inset-shadow" | "drop-shadow"): ShadowToken[] =>
    read.flatMap((each) =>
      each.category === "shadow" && each.kind === kind
        ? [shadowToken(kind, each.name, shadowLayers(each.value, length, toPlain))]
        : []
    )

  const blur: LengthToken[] = read.flatMap((each) => {
    const pixels = each.kind === "blur" ? length(each.value) : Number.NaN

    return Number.isFinite(pixels) ? [lengthToken("blur", each.name, pixels)] : []
  })

  return {
    color,
    shadow: shadows("shadow"),
    insetShadow: shadows("inset-shadow"),
    dropShadow: shadows("drop-shadow"),
    blur
  }
}

/** Splits at the commas and spaces that aren't inside parentheses. */
function topLevel(text: string, separator: "," | " "): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ""

  for (const character of text) {
    if (character === "(") {
      depth += 1
    } else if (character === ")") {
      depth -= 1
    }

    const splits = depth === 0 && (separator === " " ? /\s/.test(character) : character === separator)

    if (splits) {
      parts.push(current)
      current = ""
    } else {
      current += character
    }
  }

  parts.push(current)

  return parts.flatMap((part) => (part.trim() ? [part.trim()] : []))
}

let paint: CanvasRenderingContext2D | null | undefined

/**
 * A color as a plain color the controls draw as written: `#rrggbb`, with its alpha as two more digits, as the browser
 * reads it (`rgb(0 0 0 / 0.1)` is `#0000001a`). One it can't read stays as it is.
 */
export function plainColor(color: string): string {
  if (isPlainColor(color)) {
    return color
  }

  paint ??= document.createElement("canvas").getContext("2d")

  if (!paint) {
    return color
  }

  paint.fillStyle = "#000000"
  paint.fillStyle = color
  const read = paint.fillStyle
  const rgba = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(read)

  if (!rgba) {
    return read
  }

  const hex = (number: number) => Math.round(number).toString(16).padStart(2, "0")
  const channels = [rgba[1], rgba[2], rgba[3]].map((channel) => hex(Number(channel))).join("")

  return `#${channels}${hex(Number(rgba[4]) * 255)}`
}

/** A shadow value's layers, top first: `0 1px 3px 0 rgb(0 0 0 / 0.1), …`, each color plain, as `color` makes it. */
export function shadowLayers(
  value: string,
  length: (value: string) => number = px,
  color: (value: string) => string = plainColor
): ShadowLayer[] {
  return topLevel(value, ",").flatMap((layer) => {
    const words = topLevel(layer, " ")
    const inset = words.includes("inset")
    const numbers: number[] = []
    let drawn = "#000000"

    for (const word of words) {
      if (word === "inset") {
        continue
      }

      const pixels = word === "0" ? 0 : length(word)

      if (Number.isFinite(pixels) && numbers.length < 4) {
        numbers.push(pixels)
      } else {
        drawn = color(word)
      }
    }

    if (numbers.length < 2) {
      return []
    }

    const [x = 0, y = 0, blur = 0, spread = 0] = numbers
    const parsed: ShadowLayer = { x, y, blur, spread, color: drawn }

    if (inset) {
      parsed.inset = true
    }

    return [parsed]
  })
}
