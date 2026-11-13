import type { DescribedTokens } from "@parity-app/core"
import {
  defaultValues,
  matchDescribed,
  orderTokens,
  previewKind,
  type Token,
  type TokenMap,
  tokenValue
} from "@parity-app/tokens"
import { px } from "./lengths.ts"

/**
 * What a token comes to in a theme, as `tokenValue` in `@parity-app/tokens` works it out, with the browser measuring a
 * step's base, so a step of a `calc()` base comes to pixels too. Undefined when there's no token of that name.
 */
export function comesTo(tokens: TokenMap, name: string, theme = "default"): string | undefined {
  return tokenValue(tokens, name, theme, px)
}

/**
 * The project's tokens in the order every list of them shares (`orderTokens` in `@parity-app/tokens`), each read the
 * way the Tokens panel draws it: its kind from the DTCG type a `.lib.par` gives it, or else from its name and value, and
 * its value as what its root value comes to, references and derived steps filled in. A value still holding a `var()`,
 * one naming no token, lists after the rest, as `scaleValue` can't measure it; the browser would lay it out as nothing
 * and put it first. `length` measures a length, the browser's `px` unless a test gives another.
 */
export function inTokenOrder(
  tokens: readonly Token[],
  described?: readonly DescribedTokens[],
  length: (value: string) => number = px
): Token[] {
  const byName = new Map(tokens.map((token) => [token.name, token]))
  const types = matchDescribed(described, tokens).byName
  const lookup = defaultValues(tokens)

  return orderTokens(
    tokens,
    (token) => ({
      name: token.name,
      kind: previewKind(token, types.get(token.name)?.type, lookup),
      value: comesTo(byName, token.name) ?? ""
    }),
    length
  )
}
