import type { Token } from "@parity-app/core"
import { useSyncExternalStore } from "react"
import type { TokenChange } from "../shared/protocol.ts"
import type { DesignStore, TokenFailure } from "./design-store.ts"
import { previewToken } from "./guest.ts"
import {
  noTokenEdits,
  type TokenEdit,
  type TokenEdits,
  tokenDifferences,
  tokenKey,
  tokensWithEdits
} from "./token-edits.ts"

/**
 * A project's tokens, editable. An edit is a change like any other, in the design store's history: it shows in every
 * frame at once (the shared stylesheet is edited in place), undo and redo take it back and forth, and Save writes it
 * to the project's stylesheet, so the project's own build picks it up then. Closing without saving leaves the
 * stylesheet as it was.
 */
export class TokenStore {
  private readonly listeners = new Set<() => void>()
  private tokens: Token[]
  /** The edits the shared stylesheet shows now. */
  private shown: TokenEdits = noTokenEdits
  private previewed: readonly TokenChange[] = []
  private readonly unfollow: () => void

  constructor(
    /** The tokens as the project's stylesheet had them when its guest loaded. */
    private readonly loaded: Token[],
    private readonly sheet: CSSStyleSheet,
    write: (changes: TokenChange[]) => Promise<unknown>,
    private readonly history: DesignStore,
    /** The stylesheet the tokens are written to, as the project names it. */
    readonly stylesheet = "the stylesheet"
  ) {
    this.tokens = loaded
    history.writeTokensWith({ path: stylesheet, write })
    this.follow()
    this.unfollow = history.subscribe(() => this.follow())
  }

  /** Stops following the design store, once a new guest's token store has taken this one's place. */
  dispose(): void {
    this.unfollow()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get = () => this.tokens

  /**
   * What the shared stylesheet previews so far, the latest value of each token in each theme, for frames drawn
   * elsewhere to match it.
   */
  previews = () => this.previewed

  /** The keyframes the project's stylesheet declares by this name, which an animation token's preview runs. */
  keyframes = (name: string): Keyframe[] | undefined => keyframesNamed(this.sheet.cssRules, name)

  /** Why the last save couldn't write some token values, and which. It changes with saving, in the design store. */
  failure = (): TokenFailure | undefined => this.history.getTokenFailure()
  subscribeToSaves = (listener: () => void) => this.history.subscribe(listener)

  /** Changes token values as one undoable step, unsaved until the project is saved. */
  set(changes: TokenChange[], label = editLabel(changes)): void {
    if (changes.length === 0) return
    this.history.changeTokens(label, this.edits(changes))
  }

  /** Changes as edits, each with the value the stylesheet had when the guest loaded, to undo to. */
  edits(changes: readonly TokenChange[]): TokenEdit[] {
    return changes.map((change) => {
      const original = this.loaded.find((token) => token.name === change.name)?.values[change.theme]
      return original === undefined ? { ...change } : { ...change, original }
    })
  }

  /** Shows the store's token edits in the shared stylesheet and the token list, after an edit, undo or redo. */
  private follow(): void {
    const edits = this.history.getTokenEdits()
    if (edits === this.shown) return
    const differences = tokenDifferences(this.shown, edits)
    // A value set to nothing takes the declaration out again, which a value the sheet never had leaves alone.
    for (const { name, theme, value } of differences) previewToken(this.sheet, name, theme, value ?? "")
    this.shown = edits
    this.tokens = tokensWithEdits(this.loaded, edits)
    const latest = new Map(this.previewed.map((change) => [tokenKey(change.name, change.theme), change]))
    for (const { name, theme, value } of differences) {
      if (value === undefined) latest.delete(tokenKey(name, theme))
      else latest.set(tokenKey(name, theme), { name, theme, value })
    }
    this.previewed = [...latest.values()]
    for (const listener of this.listeners) listener()
  }
}

/**
 * The `@keyframes` of this name in a stylesheet's rules, also inside `@layer` and `@media`, as keyframes the Web
 * Animations API runs: each step's declarations, its timing function as its easing. The last of the name wins, as in
 * CSS. Undefined when there are none.
 */
export function keyframesNamed(rules: CSSRuleList, name: string): Keyframe[] | undefined {
  let found: Keyframe[] | undefined
  for (const rule of rules) {
    if (rule instanceof CSSKeyframesRule) {
      if (rule.name === name) found = keyframesOf(rule)
    } else if (rule instanceof CSSGroupingRule) {
      found = keyframesNamed(rule.cssRules, name) ?? found
    }
  }
  return found
}

function keyframesOf(rule: CSSKeyframesRule): Keyframe[] {
  const frames = [...rule.cssRules].flatMap((step) => {
    const { keyText, style } = step as CSSKeyframeRule
    const declared: Keyframe = {}
    for (let index = 0; index < style.length; index++) {
      const property = style.item(index)
      // A custom property means nothing to the element the preview animates.
      if (property.startsWith("--")) continue
      const value = style.getPropertyValue(property)
      if (property === "animation-timing-function") declared.easing = value
      else declared[property.replaceAll(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] = value
    }
    return keyText.split(",").map((key) => {
      const at = key.trim()
      let offset: number
      if (at === "from") offset = 0
      else if (at === "to") offset = 1
      else offset = Number.parseFloat(at) / 100
      return { ...declared, offset }
    })
  })
  return frames.toSorted((a, b) => (a.offset ?? 0) - (b.offset ?? 0))
}

function editLabel(changes: readonly TokenChange[]): string {
  const names = new Set(changes.map((change) => change.name))
  return names.size === 1 ? `Edit ${[...names][0]}` : `Edit ${names.size} tokens`
}

export function useTokenList(store: TokenStore): Token[] {
  return useSyncExternalStore(store.subscribe, store.get)
}

/** Why the last save couldn't write some of the project's token values, and which; undefined once one succeeds. */
export function useTokenFailure(store: TokenStore): TokenFailure | undefined {
  return useSyncExternalStore(store.subscribeToSaves, store.failure)
}

/** A token's value in a theme, following `var(--x)` references so swatches show the real color. */
export function resolveTokenValue(tokens: readonly Token[], name: string, theme = "default", depth = 0): string {
  const token = tokens.find((candidate) => candidate.name === name)
  const value = token?.values[theme] ?? token?.values.default ?? ""
  const reference = /^var\(--([\w-]+)\)$/.exec(value.trim())
  return reference && depth < 6 ? resolveTokenValue(tokens, reference[1]!, theme, depth + 1) || value : value
}

/** The pixel size of one spacing step (`--spacing`), assuming a 16px root. */
export function spacingUnit(tokens: readonly Token[]): number {
  const value = tokens.find((token) => token.name === "spacing")?.values.default ?? "0.25rem"
  const match = /^([\d.]+)(rem|px)$/.exec(value.trim())
  if (!match) return 4
  return Number(match[1]) * (match[2] === "rem" ? 16 : 1)
}
