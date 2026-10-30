// Matching the tokens `.lib.par` files describe to the custom properties a project's stylesheet defines, so the Tokens
// panel can show a token's description and DTCG type beside its value.

import type { DescribedToken, DescribedTokens } from "@parity-app/core"
import type { Token } from "./tokens.ts"

/** A token a `.lib.par` describes, with the library that describes it. */
export type LibraryToken = DescribedToken & { library: string }

/**
 * The custom properties a described token is likely written as: its whole path, as in `color-primary`, or without its
 * first group, as in `primary`, which is how shadcn names them.
 */
function cssNames(path: string): string[] {
  const parts = path.split(".")
  return [parts.join("-"), parts.slice(1).join("-")].filter(Boolean)
}

/** Described tokens by the custom property each one matches, and the ones that match none. */
export function matchDescribed(
  sources: readonly DescribedTokens[] | undefined,
  tokens: readonly Token[]
): { byName: Map<string, LibraryToken>; unmatched: LibraryToken[] } {
  const names = new Set(tokens.map((token) => token.name))
  const byName = new Map<string, LibraryToken>()
  const unmatched: LibraryToken[] = []
  for (const source of sources ?? []) {
    for (const token of source.tokens) {
      const described = { ...token, library: source.name }
      // A token that names its custom property matches it exactly; otherwise its path is the best guess.
      const candidates = token.parity?.var ? [token.parity.var] : cssNames(token.path)
      const name = candidates.find((candidate) => names.has(candidate))
      if (name) byName.set(name, described)
      else unmatched.push(described)
    }
  }
  return { byName, unmatched }
}
