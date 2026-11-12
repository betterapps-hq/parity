import { alphaPercent, type Color, tokenColor } from "@parity-app/core"
import { isPlainColor } from "./controls/css-values.ts"
import type { ListColor } from "./controls/lists-data.ts"

/*
 * A stored color as the panel's fields hold one, and back. A field holds a color as text, a token's name or a color as
 * written, with its alpha from 0 to 100; the document's color says which form it is.
 */

/** A stored color as a field shows it: its token's name, or the color, keyword or expression as written. */
export function colorText(color: Color): string {
  if ("token" in color) {
    return color.token
  }

  if ("value" in color) {
    return color.value
  }

  return "keyword" in color ? color.keyword : color.expr
}

/** A stored color as a list's entry holds it. */
export function listColor(color: Color): ListColor {
  const alpha = alphaPercent(color)

  return alpha === undefined ? { color: colorText(color) } : { color: colorText(color), alpha }
}

const same = (one: ListColor, other: ListColor) => one.color === other.color && one.alpha === other.alpha

/**
 * Reads a list entry's color back into the document. A color the list was given and didn't change comes back as it
 * was stored (`known`), so a keyword, an expression or an alpha token isn't rewritten by an edit beside it. A new one
 * is a plain color when it's written as one, as the fields tell them apart, and a token's name otherwise.
 */
export function storedColors(known: readonly Color[]): (entry: ListColor) => Color {
  return (entry) => {
    const kept = known.find((color) => same(listColor(color), entry))

    if (kept) {
      return kept
    }

    if (!isPlainColor(entry.color)) {
      return tokenColor(entry.color, entry.alpha)
    }

    return entry.alpha === undefined ? { value: entry.color } : { value: entry.color, alpha: { step: entry.alpha } }
  }
}

/**
 * A color field's text as the document stores it, keeping the alpha the layer's color had: a plain color as written,
 * or a token by name. The color it was comes back as it was stored when the text didn't change. Cleared, it's unset.
 */
export function fieldColor(text: string | undefined, was: Color | undefined): Color | undefined {
  if (text === undefined) {
    return undefined
  }

  const alpha = alphaPercent(was)

  return storedColors(was === undefined ? [] : [was])(alpha === undefined ? { color: text } : { color: text, alpha })
}
