import { substituteReferences } from "./kinds.ts"
import { parsedLength } from "./token-order.ts"
import type { Token } from "./tokens.ts"

/** Tokens by name, to look up what a reference comes to. */
export type TokenMap = ReadonlyMap<string, Pick<Token, "values" | "derived">>

/** How many tokens deep a value is followed before it's left as written, so a loop ends. */
const deepest = 8

/**
 * What a token comes to in a theme, with every token it refers to filled in, as the browser works it out: a theme the
 * token sets no value in has its root value, as every theme inherits it. A step of a scale comes to its base times its
 * factor, in pixels rounded to two places when `length` can measure the base (`spacing-10` on `0.25rem` is `40px`), or
 * else `calc(base * factor)`, which the browser can still work out. `length` reads px, rem and em unless a caller that
 * has a browser gives one that measures more. Undefined when there's no token of that name.
 *
 * Every caller reads this one value: the Tokens panel and the inspector to show it, and the token detail and the
 * agent's `SetTokens` to check an edit against it. Styles name a token with `var()`, never what it comes to.
 */
export function tokenValue(
  tokens: TokenMap,
  name: string,
  theme = "default",
  length: (value: string) => number = parsedLength
): string | undefined {
  const comesTo = (each: string, depth: number): string | undefined => {
    const token = tokens.get(each)

    if (!token) {
      return undefined
    }

    const value = token.values[theme] ?? token.values.default ?? ""

    if (depth > deepest) {
      return value
    }

    if (token.derived) {
      const base = comesTo(token.derived.from, depth + 1)

      if (base !== undefined) {
        const measured = length(base)

        return Number.isFinite(measured)
          ? `${Number((measured * token.derived.factor).toFixed(2))}px`
          : `calc(${base} * ${token.derived.factor})`
      }
    }

    return substituteReferences(value, (reference) => comesTo(reference, depth + 1))
  }

  return comesTo(name, 0)
}
