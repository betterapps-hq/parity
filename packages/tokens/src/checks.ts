// What a token edit may write: the checks a value must pass to be a kind of token, and the changes an edit saves. The
// token detail and the agent's SetTokens both ask these, so a value one refuses the other refuses too. The browser's
// `CSS.supports` is passed in, as the package runs without a DOM.

import { type PreviewKind, substituteReferences, tokenReferences, unclosedInValue } from "./kinds.ts"
import type { Token } from "./tokens.ts"

/** Whether a CSS property takes a value: the browser's `CSS.supports(property, value)`. */
export type CssSupports = (property: string, value: string) => boolean

/** The property each kind's value is checked against, the noun for it, an example, and how to wrap it first. */
const valueChecks: Partial<
  Record<PreviewKind, [property: string, noun: string, example: string, wrap?: (value: string) => string]>
> = {
  color: ["color", "color", "oklch(0.6 0.2 250) or #2563eb"],
  gradient: ["background-image", "gradient", "linear-gradient(#fff, #000)"],
  "type-style": ["font", "font shorthand", "600 1rem/1.5 Inter, sans-serif"],
  // Padding takes one to four lengths, as a spacing token may (`4px 8px`), and no negative ones, as width doesn't.
  spacing: ["padding", "length", "1rem or 16px"],
  radius: ["border-radius", "radius", "0.5rem or 8px"],
  "border-width": ["border-width", "border width", "1px"],
  border: ["border", "border", "1px solid"],
  shadow: ["box-shadow", "shadow", "0 4px 6px rgb(0 0 0 / 0.1)"],
  "inset-shadow": ["box-shadow", "shadow", "inset 0 2px 4px rgb(0 0 0 / 0.05)"],
  "drop-shadow": ["filter", "drop shadow", "0 4px 4px rgb(0 0 0 / 0.15)", (value) => `drop-shadow(${value})`],
  "text-shadow": ["text-shadow", "text shadow", "0 1px 2px rgb(0 0 0 / 0.2)"],
  font: ["font-family", "list of fonts", "'Inter', sans-serif"],
  "font-size": ["font-size", "font size", "1rem or 16px"],
  "font-weight": ["font-weight", "font weight", "400 or 600"],
  leading: ["line-height", "line height", "1.5"],
  tracking: ["letter-spacing", "letter spacing", "-0.025em"],
  opacity: ["opacity", "opacity", "0.5"],
  blur: ["filter", "blur", "8px", (value) => `blur(${value})`],
  "backdrop-blur": ["filter", "blur", "8px", (value) => `blur(${value})`],
  perspective: ["perspective", "perspective", "500px"],
  aspect: ["aspect-ratio", "ratio", "16 / 9"],
  duration: ["transition-duration", "duration", "200ms"],
  easing: ["transition-timing-function", "easing", "cubic-bezier(0.4, 0, 0.2, 1)"],
  animation: ["animation", "animation", "fade-in 150ms ease-out"],
  "z-index": ["z-index", "whole number", "1400"],
  breakpoint: ["width", "length", "48rem"],
  container: ["width", "length", "28rem"],
  cursor: ["cursor", "cursor", "pointer"]
}

/**
 * Why a value can't be this kind of token, in words, or nothing when it can. `supports` alone isn't enough: the browser
 * closes whatever is left open at the end of a value, so it takes `calc(var(--radius) * 2.6` as complete, and any value
 * holding `var()` passes, since a variable can't be checked until it's known. So brackets and quotes are checked first,
 * each `var()` must name a token, and the value is checked with every reference replaced by what `lookup` says its
 * token comes to (undefined for a token there isn't). A kind with no property of its own (`number`) takes any value.
 */
export function valueProblem(
  kind: PreviewKind,
  value: string,
  lookup: (name: string) => string | undefined,
  supports: CssSupports
): string | undefined {
  const text = value.trim()

  if (!text) {
    return "Enter a value."
  }

  const open = unclosedInValue(text)

  if (open) {
    return open
  }

  const missing = tokenReferences(text).find((name) => lookup(name) === undefined)

  if (missing) {
    return `There's no token named ${missing}.`
  }

  const check = valueChecks[kind]

  if (!check) {
    return undefined
  }

  const [property, noun, example, wrap] = check
  const resolved = substituteReferences(text, lookup)

  return supports(property, wrap ? wrap(resolved) : resolved) ? undefined : `That isn't a ${noun}. Try ${example}.`
}

/**
 * Why a value would make the token `self` loop back to itself, directly or through the tokens it's built on, or
 * nothing. A loop comes to nothing in every frame, though checking it against the tokens' old values would pass.
 * `references` gives the tokens another token is built on.
 */
export function loopProblem(
  self: string,
  value: string,
  references: (name: string) => readonly string[]
): string | undefined {
  for (const start of new Set(tokenReferences(value))) {
    if (start === self) {
      return `${self} can't be built on itself.`
    }

    const seen = new Set<string>()
    const next = [start]

    while (next.length > 0) {
      const name = next.pop()!

      if (name === self) {
        return `${start} is built on ${self}, so this would loop.`
      }

      if (seen.has(name)) {
        continue
      }

      seen.add(name)
      next.push(...references(name))
    }
  }

  return undefined
}

/**
 * The tokens a token's value in a theme is built on, as written: the base a step of a scale follows, then each `var()`.
 * A theme the token sets no value in has the root's. Nothing for a token there isn't.
 */
export function builtOn(token: Pick<Token, "values" | "derived"> | undefined, theme: string): string[] {
  if (!token) {
    return []
  }

  const built = tokenReferences(token.values[theme] ?? token.values.default ?? "")

  return token.derived ? [token.derived.from, ...built] : built
}

/** A token edit to check: the values typed for each theme, and how to read the other tokens in a theme. */
export interface TokenEdit {
  name: string
  kind: PreviewKind
  /** The token's values now, by theme, as written. */
  values: Readonly<Record<string, string>>
  /** The values typed, by theme. A theme left out keeps its value. */
  drafts: Readonly<Record<string, string>>
  /** What another token comes to in a theme, or undefined when there's no token of that name. */
  lookup: (name: string, theme: string) => string | undefined
  /** The tokens another token's value in a theme is built on, as written (`builtOn`). */
  references: (name: string, theme: string) => readonly string[]
  supports: CssSupports
}

/** What an edit comes to: each typed theme's problem, if it has one, and the smallest set of changes to save. */
export interface CheckedEdit {
  problems: Record<string, string | undefined>
  /** Each theme whose value changes, to its new value, trimmed. Empty when nothing would change. */
  changes: Record<string, string>
  /** Whether every typed theme passes. */
  valid: boolean
}

/**
 * Checks a token edit theme by theme: a loop back to the token first, then whether the value is this kind of token
 * (`valueProblem`). The changes are the themes whose trimmed value differs from the one written now.
 */
export function checkTokenEdit(edit: TokenEdit): CheckedEdit {
  const { name, kind, values, drafts, lookup, references, supports } = edit
  const problems: Record<string, string | undefined> = {}
  const changes: Record<string, string> = {}

  for (const [theme, draft] of Object.entries(drafts)) {
    problems[theme] =
      loopProblem(name, draft, (other) => references(other, theme)) ??
      valueProblem(kind, draft, (other) => lookup(other, theme), supports)
    const value = draft.trim()

    if (value !== values[theme]) {
      changes[theme] = value
    }
  }

  return { problems, changes, valid: Object.values(problems).every((problem) => !problem) }
}
