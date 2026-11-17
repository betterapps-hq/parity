import type { DescribedTokens } from "@parity-app/core"
import {
  noTokenEdits,
  type TokenChange,
  type TokenEdit,
  type TokenEdits,
  type TokenFailure,
  type TokenWrite,
  tokenDifferences,
  tokensWithEdits,
  withTokenOverrides
} from "@parity-app/editor"
import type { ScaleStep } from "@parity-app/editor"
import { changeTokens } from "@parity-app/multiplayer"
import type { Token } from "@parity-app/tokens"
import { useSyncExternalStore } from "react"
import { previewToken } from "./guest.ts"
import type { DocSession } from "./project-doc.ts"
import { signal } from "./store.ts"
import { inTokenOrder } from "./token-values.ts"

/**
 * A project's tokens, editable. An edit is a change like any other, in the project document's undo: it shows in every
 * frame at once (the shared stylesheet is edited in place), undo and redo take it back and forth, and Save writes it
 * to the project's stylesheet, so the project's own build picks it up then. Closing without saving leaves the
 * stylesheet as it was.
 */
export class TokenStore {
  private readonly changes = signal()
  private tokens: Token[]
  /** The edits the shared stylesheet shows now. */
  private shown: TokenEdits = noTokenEdits
  /** The tokens and themes this store has previewed, which the stylesheet shows at their edits' values or originals. */
  private readonly previewed = new Set<string>()
  private overrides: readonly TokenChange[] = []
  private readonly unfollow: () => void

  constructor(
    /** The tokens as the project's stylesheet had them when its guest loaded. */
    private readonly loaded: Token[],
    private readonly sheet: CSSStyleSheet,
    write: (changes: TokenWrite[]) => Promise<void>,
    private readonly designs: DocSession,
    /** The stylesheet the tokens are written to, as the project names it. */
    readonly stylesheet = "the stylesheet",
    /** The tokens the project's `.lib.par` files describe, whose DTCG types say what kind a token is. */
    private readonly described?: readonly DescribedTokens[]
  ) {
    this.tokens = loaded
    designs.saver.writeTokensWith({ path: stylesheet, write })
    this.follow()
    this.unfollow = designs.doc.subscribe(() => this.follow())
  }

  /** Stops following the project document, once a new guest's token store has taken this one's place. */
  dispose(): void {
    this.unfollow()
  }

  subscribe = this.changes.subscribe

  get = () => this.tokens

  private orderedFrom: Token[] | undefined
  private ordered: Token[] = []

  /**
   * The tokens in the order every list of them shares (`orderTokens` in `@parity-app/tokens`): smallest first where a
   * kind has a size or a number, ties and the rest by name, each token read as the Tokens panel draws it
   * (`inTokenOrder`). Every panel and picker lists from this, the Tokens panel too, so none sorts on its own.
   */
  inOrder = () => {
    if (this.orderedFrom !== this.tokens) {
      this.ordered = inTokenOrder(this.tokens, this.described)
      this.orderedFrom = this.tokens
    }

    return this.ordered
  }

  /**
   * Every token value the edits leave different from the stylesheet as the guest loaded it, one per token and theme:
   * the complete set frames drawn elsewhere (bitmaps, agents' renders, exports) lay over the compiled stylesheet to
   * match the canvas. The same array until the edits change.
   */
  previews = () => this.overrides

  /** The keyframes the project's stylesheet declares by this name, which an animation token's preview runs. */
  keyframes = (name: string): Keyframe[] | undefined => keyframesNamed(this.sheet.cssRules, name)

  /** Why the last save couldn't write some token values, and which. It changes with saving, in the project's saver. */
  failure = (): TokenFailure | undefined => this.designs.saver.tokenFailure()
  subscribeToSaves = (listener: () => void) => this.designs.saver.subscribe(listener)

  /** Changes token values as one undoable step, unsaved until the project is saved. */
  set(changes: TokenChange[], label = editLabel(changes)): void {
    if (changes.length === 0) {
      return
    }

    changeTokens(this.designs.doc, label, this.edits(changes))
  }

  /** Changes as edits, each with the value the stylesheet had when the guest loaded, to undo to. */
  edits(changes: readonly TokenChange[]): TokenEdit[] {
    return changes.map((change) => {
      const original = this.loaded.find((token) => token.name === change.name)?.values[change.theme]

      return original === undefined ? { ...change } : { ...change, original }
    })
  }

  /** Shows the document's token edits in the shared stylesheet and the token list, after an edit, undo or redo. */
  private follow(): void {
    const edits = this.designs.doc.tokens()

    if (edits === this.shown) {
      return
    }

    const differences = tokenDifferences(asLoaded(this.shown, edits, this.loaded, this.previewed), edits)

    // A value set to nothing takes the declaration out again, which a value the sheet never had leaves alone.
    for (const { name, theme, value } of differences) {
      previewToken(this.sheet, name, theme, value ?? "")
    }

    for (const key of edits.keys()) {
      this.previewed.add(key)
    }

    this.shown = edits
    this.tokens = tokensWithEdits(this.loaded, edits)
    this.overrides = withTokenOverrides(this.overrides, differences, this.loaded)
    this.changes.notify()
  }
}

/**
 * The edits the stylesheet shows, with each token edited now that it has never previewed at the value the stylesheet
 * had when its guest loaded, not the edit's original: a copy that joined a live room after the host saved loaded the
 * saved value, which can differ from the original the room's edits carry (PAR-1254). A token it has previewed and taken
 * out since shows its edit's original, so redoing it compares with that.
 */
function asLoaded(
  shown: TokenEdits,
  edits: TokenEdits,
  loaded: readonly Token[],
  previewed: ReadonlySet<string>
): TokenEdits {
  let from: Map<string, TokenEdit> | undefined

  for (const [key, edit] of edits) {
    const value = loaded.find((token) => token.name === edit.name)?.values[edit.theme]

    if (!shown.has(key) && !previewed.has(key) && value !== undefined && value !== edit.original) {
      from ??= new Map(shown)
      from.set(key, { ...edit, value })
    }
  }

  return from ?? shown
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
      if (rule.name === name) {
        found = keyframesOf(rule)
      }
    } else if (rule instanceof CSSGroupingRule) {
      found = keyframesNamed(rule.cssRules, name) ?? found
    }
  }

  return found
}

function keyframesOf(rule: CSSKeyframesRule): Keyframe[] {
  const frames = [...rule.cssRules].flatMap((step) => {
    if (!(step instanceof CSSKeyframeRule)) {
      return []
    }

    const { keyText, style } = step
    const declared: Keyframe = {}

    for (let index = 0; index < style.length; index++) {
      const property = style.item(index)

      // A custom property means nothing to the element the preview animates.
      if (property.startsWith("--")) {
        continue
      }

      const value = style.getPropertyValue(property)

      if (property === "animation-timing-function") {
        declared.easing = value
      } else {
        declared[property.replaceAll(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] = value
      }
    }

    return keyText.split(",").map((key) => {
      const at = key.trim()
      let offset: number

      if (at === "from") {
        offset = 0
      } else if (at === "to") {
        offset = 1
      } else {
        offset = Number.parseFloat(at) / 100
      }

      return { ...declared, offset }
    })
  })

  return frames.toSorted((a, b) => (a.offset ?? 0) - (b.offset ?? 0))
}

function editLabel(changes: readonly TokenChange[]): string {
  const names = new Set(changes.map((change) => change.name))

  return names.size === 1 ? `Edit ${[...names][0]}` : `Edit ${names.size} tokens`
}

/** The project's tokens, in the order every list of them shares. */
export function useTokenList(store: TokenStore): Token[] {
  return useSyncExternalStore(store.subscribe, store.inOrder)
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

/**
 * The token the spacing scale is built on: the base the styling framework derives its steps from, as Tailwind's
 * `spacing`, else a token named `spacing`.
 */
export function spacingBase(tokens: readonly Token[]): string {
  return tokens.find((token) => token.category === "spacing" && token.derived)?.derived?.from ?? "spacing"
}

/** The steps of the spacing scale, as the styling framework derives and names them from its base, smallest first. */
export function spacingSteps(tokens: readonly Token[]): ScaleStep[] {
  const base = spacingBase(tokens)

  return tokens
    .flatMap(({ name, derived }) => (derived?.from === base ? [{ name, factor: derived.factor }] : []))
    .sort((a, b) => a.factor - b.factor)
}

/** The pixel size of one spacing step (`--spacing`, or the base of the scale's steps), assuming a 16px root. */
export function spacingUnit(tokens: readonly Token[]): number {
  const base = spacingBase(tokens)
  const value = tokens.find((token) => token.name === base)?.values.default ?? "0.25rem"
  const match = /^([\d.]+)(rem|px)$/.exec(value.trim())

  if (!match) {
    return 4
  }

  return Number(match[1]) * (match[2] === "rem" ? 16 : 1)
}
