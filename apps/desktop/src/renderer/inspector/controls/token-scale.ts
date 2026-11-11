import { numberValue } from "../../chrome/prop-values.ts"
import { stepThrough } from "./css-values.ts"
import type { FieldToken } from "./tokens.ts"

/* A token scale: tokens in the order a scale reads, stepped through and looked up by name. Data in, data out. */

/** What a token comes to as a number, where its kind has one (a length, a duration, a percentage, a weight). */
function measureOf(token: FieldToken): number | undefined {
  const fields = new Map(Object.entries(token))

  for (const key of ["px", "ms", "percent", "number", "em", "multiple"]) {
    const value = numberValue.safeParse(fields.get(key)).data

    if (value !== undefined) {
      return value
    }
  }

  return undefined
}

/** Tokens that come to numbers, smallest first, as a scale reads; others, as colors, in the project's order. */
export function inScaleOrder<T extends FieldToken>(tokens: readonly T[]): readonly T[] {
  if (!tokens.every((token) => measureOf(token) !== undefined)) {
    return tokens
  }

  return tokens.toSorted((a, b) => measureOf(a)! - measureOf(b)!)
}

/**
 * The token Up or Down steps to from the one a field holds: the next in the scale its list shows (smallest first,
 * without the ones the project has replaced), or with Shift the last or first. A replaced token steps onto the scale
 * from where it would sit.
 */
export function stepToken<T extends FieldToken>(tokens: readonly T[], current: T, up: boolean, shift: boolean): T {
  const scale = inScaleOrder(tokens.filter((token) => token.deprecated === undefined || token === current))

  return stepThrough(scale, current, up, shift)
}

/**
 * The token a typed name names, with the field's namespace or without it, whichever way the tokens are named:
 * `lg` and `radius-lg` both find `radius-lg` in Radius, and `xl` and `text-xl` both find `xl` in Size. Case doesn't
 * matter, and spaces around it don't either.
 */
export function tokenNamed<T extends { name: string }>(
  tokens: readonly T[] | undefined,
  typed: string,
  namespace = ""
): T | undefined {
  const words = typed.trim().toLowerCase()

  if (words === "" || !tokens) {
    return undefined
  }

  return tokens.find((token) => {
    const name = token.name.toLowerCase()

    return name === words || name === `${namespace}${words}` || `${namespace}${name}` === words
  })
}
