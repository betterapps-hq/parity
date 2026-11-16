// The tokens nearest a value that isn't one, such as a color or a length a design hands over, so whoever writes the
// design can use a token instead: what an agent's `GetTokens({ nearest })` lists.

import { colorDistance, parseColor, type Rgba } from "./color.ts"
import { pixels, simplifyCalc } from "./inference.ts"
import { previewKind, resolveReferences } from "./kinds.ts"
import { compareNames, lengthKinds, scaleValue } from "./token-order.ts"
import type { Token } from "./tokens.ts"

/** A value to find the nearest tokens to: a color, or a length in pixels. */
export type NearValue = { color: Rgba } | { length: number }

/** Reads a color written as hex or `oklch()`, or a length in px, rem or em; undefined for anything else. */
export function readNearValue(text: string): NearValue | undefined {
  const color = parseColor(text)

  if (color) {
    return { color }
  }

  const length = pixels(text)

  return length === undefined ? undefined : { length }
}

/** A token and how far it is from the value asked about. */
export interface NearToken<T> {
  token: T
  /**
   * For a color, how far apart the two look in OKLab, with any difference in alpha added, to three decimals: under
   * 0.02 looks the same. For a length, the difference in pixels, to two decimals.
   */
  distance: number
}

/**
 * What a token needs to be compared: its name, the category it's filed under, its values and its source, which breaks
 * ties. The agent's list adds framework keywords, so the category and source are any string.
 */
type Comparable = Pick<Token, "name" | "values"> & { category: string; source?: string }

/**
 * The tokens `value` can be compared with, nearest first: the colors for a color, the lengths for a length. Each is
 * read in the default theme, or the one theme that sets it, with the tokens it refers to worked out through `lookup`
 * (as `defaultValues` gives). A token whose value can't be read here, such as `var()` to a token `lookup` doesn't know,
 * a color name or `clamp()`, is left out. Ties go to the project's own (semantic) tokens, then by name.
 */
export function nearestTokens<T extends Comparable>(
  value: NearValue,
  tokens: readonly T[],
  lookup: (name: string, theme?: string) => string | undefined
): NearToken<T>[] {
  const found: NearToken<T>[] = []

  for (const token of tokens) {
    const distance = distanceTo(value, token, lookup)

    if (distance !== undefined) {
      found.push({ token, distance })
    }
  }

  const semantic = (token: T) => (token.source === "semantic" ? 0 : 1)

  return found.toSorted(
    (a, b) =>
      a.distance - b.distance || semantic(a.token) - semantic(b.token) || compareNames(a.token.name, b.token.name)
  )
}

/** How far a token is from the value, rounded as `NearToken` says; undefined when they can't be compared. */
function distanceTo(
  value: NearValue,
  token: Comparable,
  lookup: (name: string, theme?: string) => string | undefined
): number | undefined {
  const kind = previewKind(token, undefined, lookup)
  const theme = "default" in token.values ? "default" : Object.keys(token.values)[0]
  const written = (theme && token.values[theme]) ?? ""
  const comesTo = simplifyCalc(resolveReferences(written, (name) => lookup(name, theme)))

  if ("color" in value) {
    const color = kind === "color" ? parseColor(comesTo) : undefined

    return color === undefined
      ? undefined
      : round(colorDistance(value.color, color) + Math.abs(value.color.a - color.a), 3)
  }

  const length = lengthKinds.has(kind) ? scaleValue(kind, comesTo) : undefined

  return length === undefined ? undefined : round(Math.abs(length - value.length), 2)
}

function round(value: number, places: number): number {
  return Number(value.toFixed(places))
}
