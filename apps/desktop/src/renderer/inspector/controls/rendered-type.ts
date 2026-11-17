import { findFont } from "./fonts.ts"
/*
 * What a layer's text draws in, read from the styles the canvas applies to its element: its own, its classes' and what
 * it inherits, so Typography's unset rows show the real font, size, weight, line height and letter spacing.
 */
import type { TypeValues } from "./preset-data.ts"
import { type FontFamily, stackFamilies } from "./text-data.ts"

/** The computed type properties of an element, as `getComputedStyle` gives them. */
export type TypeStyle = Pick<
  CSSStyleDeclaration,
  "fontFamily" | "fontSize" | "fontWeight" | "lineHeight" | "letterSpacing"
>

/** Pixels from a computed length (`16px`), rounded to hundredths. */
const pixels = (length: string) => Math.round(parseFloat(length) * 100) / 100

/**
 * Every type value an element draws with, from its computed style: the font stack, size and weight as they resolve, a
 * line height of `normal` as Auto, and letter spacing of `normal` as none.
 */
export function renderedType(style: TypeStyle): Required<TypeValues> {
  return {
    font: { stack: style.fontFamily },
    size: { px: pixels(style.fontSize) },
    weight: { value: Number(style.fontWeight) || 400 },
    lineHeight: style.lineHeight === "normal" ? { keyword: "normal" } : { px: pixels(style.lineHeight) },
    letterSpacing: style.letterSpacing === "normal" ? { em: 0 } : { px: pixels(style.letterSpacing) }
  }
}

/** The font a stack draws in, as Font's placeholder names it: a known font, or its first family with the usual faces. */
export function stackFont(stack: string): FontFamily {
  const name = stackFamilies(stack)[0] ?? stack

  return findFont(name) ?? { name, stack, weights: [400, 700], italic: true }
}

/** A computed type style, as a key that changes when any of its values does. */
export const typeStyleKey = (style: TypeStyle | undefined) =>
  style ? [style.fontFamily, style.fontSize, style.fontWeight, style.lineHeight, style.letterSpacing].join("|") : ""
