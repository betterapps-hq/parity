import type { DescribedTokens } from "@parity-app/core"
import {
  defaultValues,
  matchDescribed,
  orderTokens,
  previewKind,
  substituteReferences,
  type Token
} from "@parity-app/tokens"
import { px } from "./lengths.ts"

/** Tokens by name, to look up what a reference comes to. */
export type TokenMap = ReadonlyMap<string, Token>

/**
 * What a token comes to in a theme, with every token it refers to filled in, as the browser would work it out: a step
 * of the spacing scale comes to pixels. Undefined when there's no token of that name.
 */
export function comesTo(tokens: TokenMap, name: string, theme = "default", depth = 0): string | undefined {
  const token = tokens.get(name)
  if (!token) return undefined
  const value = token.values[theme] ?? token.values.default ?? ""
  if (depth > 8) return value
  if (token.derived) {
    const base = px(comesTo(tokens, token.derived.from, theme, depth + 1) ?? "")
    if (Number.isFinite(base)) return `${Number((base * token.derived.factor).toFixed(2))}px`
  }
  return substituteReferences(value, (reference) => comesTo(tokens, reference, theme, depth + 1))
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
