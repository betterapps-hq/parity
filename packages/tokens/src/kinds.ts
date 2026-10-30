// What a token's preview draws, and the ways to write a token in code. The Tokens panel, the inspector's pickers and
// the agent read these; the drawings themselves are the app's. docs/proposals/previews.md has the design.

import { type InferredKind, inferTokenKind } from "./inference.ts"
import type { Token } from "./tokens.ts"

/**
 * What a token's preview draws, finer than its category: Shadows split into box, inset, drop and text shadows, Motion
 * into durations, easings and animations, and what Effects and Other hold today into kinds of their own. The panel's
 * sections follow the kinds.
 */
export type PreviewKind =
  | "color"
  | "gradient"
  | "spacing"
  | "radius"
  | "border-width"
  | "border"
  | "shadow"
  | "inset-shadow"
  | "drop-shadow"
  | "text-shadow"
  | "font"
  | "font-size"
  | "font-weight"
  | "leading"
  | "tracking"
  | "type-style"
  | "opacity"
  | "blur"
  | "backdrop-blur"
  | "perspective"
  | "aspect"
  | "duration"
  | "easing"
  | "animation"
  | "z-index"
  | "breakpoint"
  | "container"
  | "cursor"
  | "number"

/**
 * The preview each inferred kind draws, where the names differ: a size is drawn as a container, a setting as itself.
 * Every other kind is a preview kind of the same name, which `previewKind`'s return type checks.
 */
const previewOf = {
  "font-family": "font",
  "line-height": "leading",
  "letter-spacing": "tracking",
  size: "container",
  setting: "number"
} as const satisfies Partial<Record<InferredKind, PreviewKind>>

const isMapped = (kind: InferredKind): kind is keyof typeof previewOf => kind in previewOf

/**
 * A token's preview kind, inferred from its value, then its name, else none (`inference.ts`): a DTCG type the
 * author gives decides first, and the group it's filed under (its category) is read after its own name. `lookup` gives
 * the tokens it refers to, so `calc(var(--radius) * 0.8)` is read as the length it comes to.
 */
export function previewKind(
  token: Pick<Token, "name" | "category" | "values">,
  type?: string,
  lookup?: (name: string) => string | undefined
): PreviewKind {
  const written = (token.values.default ?? Object.values(token.values)[0] ?? "").trim()
  const value = lookup ? resolveReferences(written, lookup) : written
  const kind = inferTokenKind(token.name, value, type, token.category)
  if (kind === "blur" && token.name.toLowerCase().replaceAll(/[-_.]/g, "").includes("backdropblur")) {
    return "backdrop-blur"
  }
  return isMapped(kind) ? previewOf[kind] : kind
}

/**
 * What each token comes to in its default theme, or the first it has (one only a dark theme sets), by name: the lookup
 * `previewKind` resolves references with.
 */
export function defaultValues(tokens: readonly Pick<Token, "name" | "values">[]): (name: string) => string | undefined {
  const values = new Map(tokens.map((token) => [token.name, token.values.default ?? Object.values(token.values)[0]]))
  return (name) => values.get(name)
}

/**
 * A value with the tokens it refers to replaced by what they come to, through tokens that refer to others in turn; a
 * reference `lookup` doesn't know takes its fallback, or stays as written.
 */
export function resolveReferences(value: string, lookup: (name: string) => string | undefined): string {
  let resolved = value
  for (let depth = 0; depth < 8 && resolved.includes("var("); depth++) {
    const next = substituteReferences(resolved, lookup)
    if (next === resolved) break
    resolved = next
  }
  return resolved
}

/**
 * One way to write a token, saying what it is, and the text itself: in CSS, as `var()`, since a token is a CSS variable
 * whichever framework defined it, or as the token's name (`radius-md`), which Parity's own fields take as a value.
 */
export interface CodeForm {
  group: "CSS" | "Token"
  label: string
  text: string
}

/**
 * The ways to write a token, for the detail's Copy as menu: `var()`, which works anywhere CSS does, and the token's
 * name. Nothing a framework adds, such as a class, since a variable doesn't say what else uses it. A breakpoint is a
 * media query instead, as `var()` can't go in one; `value` is what the token comes to, which the query is written with.
 */
export function codeForms(name: string, kind: PreviewKind, value: string): CodeForm[] {
  const css: CodeForm =
    kind === "breakpoint"
      ? { group: "CSS", label: "Media query", text: `@media (width >= ${value})` }
      : { group: "CSS", label: "Variable", text: `var(--${name})` }
  return [css, { group: "Token", label: "Name", text: name }]
}

/**
 * Each outermost `var()` in a value: where it starts and ends, its token, and its fallback as written. A fallback runs
 * to the bracket that closes its `var()`, so it can hold brackets and `var()`s of its own (`var(--a, var(--b))`).
 */
function outerReferences(value: string): { start: number; end: number; name: string; fallback?: string }[] {
  const found: { start: number; end: number; name: string; fallback?: string }[] = []
  const opening = /var\(\s*--([\w-]+)\s*([,)])/g
  for (let match = opening.exec(value); match; match = opening.exec(value)) {
    const [, name = "", after] = match
    if (after === ")") {
      found.push({ start: match.index, end: opening.lastIndex, name })
      continue
    }
    let depth = 1
    let at = opening.lastIndex
    for (; at < value.length; at++) {
      if (value[at] === "(") depth++
      else if (value[at] === ")" && --depth === 0) break
    }
    // A fallback left open has no end to substitute up to, though its token is still referred to.
    if (depth > 0) {
      found.push({ start: match.index, end: value.length, name, fallback: value.slice(opening.lastIndex) })
      break
    }
    found.push({ start: match.index, end: at + 1, name, fallback: value.slice(opening.lastIndex, at) })
    opening.lastIndex = at + 1
  }
  return found
}

/** The tokens a value refers to with `var()`, in order, including those in another's fallback. */
export function tokenReferences(value: string): string[] {
  return outerReferences(value).flatMap(({ name, fallback }) => [name, ...(fallback ? tokenReferences(fallback) : [])])
}

/**
 * A value with each `var()` replaced by what `lookup` gives for its token: `calc(var(--radius) * 0.8)` becomes
 * `calc(0.625rem * 0.8)`. A reference `lookup` doesn't know takes its fallback, itself substituted, or stays as written.
 */
export function substituteReferences(value: string, lookup: (name: string) => string | undefined): string {
  let substituted = ""
  let last = 0
  for (const { start, end, name, fallback } of outerReferences(value)) {
    const written = value.slice(start, end)
    const own = lookup(name) ?? (fallback === undefined ? written : substituteReferences(fallback.trim(), lookup))
    substituted += value.slice(last, start) + own
    last = end
  }
  return substituted + value.slice(last)
}

/**
 * What a value leaves open or closes twice, a bracket or a quote, in words; nothing when it's whole. Browsers close
 * whatever is left open at the end of a value, so `CSS.supports` takes `calc(var(--radius) * 2.6` as complete; this is
 * the check it skips.
 */
export function unclosedInValue(text: string): string | undefined {
  const closers: string[] = []
  let quote: string | undefined
  for (const char of text) {
    if (quote) {
      if (char === quote) quote = undefined
    } else if (char === '"' || char === "'") quote = char
    else if (char === "(" || char === "[") closers.push(char === "(" ? ")" : "]")
    else if ((char === ")" || char === "]") && closers.pop() !== char) return `There's a ${char} with nothing to close.`
  }
  if (quote) return "A quote isn't closed."
  if (closers.length > 0) return `A bracket isn't closed. Add ${closers.reverse().join("")} at the end.`
  return undefined
}

/** A value's top-level parts, split at the commas outside brackets: a shadow's layers, a font stack's fonts. */
export function valueParts(value: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (const [index, char] of value.split("").entries()) {
    if (char === "(") depth += 1
    else if (char === ")") depth -= 1
    else if (char === "," && depth === 0) {
      parts.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(value.slice(start).trim())
  return parts
}
