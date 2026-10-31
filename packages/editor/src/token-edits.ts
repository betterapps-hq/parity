import type { Token, TokenChange } from "@parity-app/tokens"

export type { TokenChange }

/**
 * A token's value as the canvas edited it, with the value the stylesheet held before this session first changed it,
 * so undoing past a save knows what to write back.
 */
export interface TokenEdit extends TokenChange {
  /** Undefined when the token had no value in this theme. */
  original?: string
}

/** The tokens edited so far, by `name theme`, each at its latest value. Saved with the project and undone with it. */
export type TokenEdits = ReadonlyMap<string, TokenEdit>

export const noTokenEdits: TokenEdits = new Map()

export function tokenKey(name: string, theme: string): string {
  return `${name} ${theme}`
}

/** Edits laid over earlier ones. A token keeps the original from its first edit. */
export function withTokenEdits(edits: TokenEdits, changes: readonly TokenEdit[]): TokenEdits {
  if (changes.length === 0) return edits
  const next = new Map(edits)
  for (const change of changes) {
    const key = tokenKey(change.name, change.theme)
    const earlier = next.get(key)
    const original = earlier ? earlier.original : change.original
    next.set(key, {
      name: change.name,
      theme: change.theme,
      value: change.value,
      ...(original === undefined ? {} : { original })
    })
  }
  return next
}

/** A token's value with these edits: its edit's, else what it was before any. Undefined when it has none. */
function valueOf(edits: TokenEdits, key: string, known: TokenEdit): string | undefined {
  return edits.get(key)?.value ?? known.original
}

/**
 * What going from `from` to `to` changes, token by token, with the value each now has: what the stylesheet is written
 * on Save, and what the frames preview after an undo. A token that now has no value in a theme comes with `value`
 * undefined.
 */
export function tokenDifferences(
  from: TokenEdits,
  to: TokenEdits
): { name: string; theme: string; value: string | undefined }[] {
  if (from === to) return []
  const differences: { name: string; theme: string; value: string | undefined }[] = []
  for (const key of new Set([...from.keys(), ...to.keys()])) {
    const known = (to.get(key) ?? from.get(key))!
    const value = valueOf(to, key, known)
    if (value !== valueOf(from, key, known)) differences.push({ name: known.name, theme: known.theme, value })
  }
  return differences
}

/**
 * The token values the canvas shows that differ from the stylesheet its guest loaded (`baseline`), after it shows these
 * differences (`tokenDifferences`): the complete set, one per token and theme, that a frame drawn elsewhere lays over
 * the same compiled stylesheet to match the canvas. A value back at the baseline's leaves the set; a value taken out
 * that the baseline has stays in it, empty, which takes the declaration out. Compared with the baseline rather than
 * the edits' originals, so it holds after a guest loads again with saved values, where the two differ. The same array
 * when nothing differs.
 */
export function withTokenOverrides(
  overrides: readonly TokenChange[],
  differences: readonly { name: string; theme: string; value: string | undefined }[],
  baseline: readonly Token[]
): readonly TokenChange[] {
  if (differences.length === 0) return overrides
  const next = new Map(overrides.map((override) => [tokenKey(override.name, override.theme), override]))
  for (const { name, theme, value } of differences) {
    const key = tokenKey(name, theme)
    if (value === baseline.find((token) => token.name === name)?.values[theme]) next.delete(key)
    else next.set(key, { name, theme, value: value ?? "" })
  }
  return [...next.values()]
}

/**
 * The values Save writes to go from what's saved to what's here. A token given a value in a theme that had none, saved
 * and then undone, has nothing to write: the stylesheet keeps the value (a gap; see docs/editor.md).
 */
export function tokenWrites(current: TokenEdits, saved: TokenEdits): TokenChange[] {
  return tokenDifferences(saved, current).flatMap(({ name, theme, value }) =>
    value === undefined ? [] : [{ name, theme, value }]
  )
}

/** Whether these edits leave every token at the value it has with the saved ones, so there's nothing to save. */
export function sameTokenValues(current: TokenEdits, saved: TokenEdits): boolean {
  return tokenWrites(current, saved).length === 0
}

/** The project's tokens with these edits applied, as the Tokens panel lists them. */
export function tokensWithEdits(tokens: readonly Token[], edits: TokenEdits): Token[] {
  if (edits.size === 0) return [...tokens]
  const byName = Map.groupBy(edits.values(), (edit) => edit.name)
  return tokens.map((token) => {
    const mine = byName.get(token.name)
    if (!mine) return token
    const values = { ...token.values }
    for (const edit of mine) values[edit.theme] = edit.value
    return { ...token, values }
  })
}
