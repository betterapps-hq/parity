// What a token's preview draws, and the ways to write a token in code. The Tokens panel, the inspector's pickers and
// the agent read these; the drawings themselves are the app's. docs/proposals/previews.md has the design.

import type { Token } from "./tokens.ts"

/**
 * What a token's preview draws, finer than its category: Shadows split into box, inset, drop and text shadows, Motion
 * into durations, easings and animations, and what Effects and Other hold today into kinds of their own. The panel's
 * sections follow the kinds.
 */
export type PreviewKind =
  | "color"
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

const duration = /^-?\d*\.?\d+m?s$/
const easing = /^(?:cubic-bezier|linear|steps)\(|^(?:ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end)$/
const ratio = /^\d*\.?\d+\s*\/\s*\d*\.?\d+$/
const borderStyle = /\b(?:solid|dashed|dotted|double|groove|ridge|inset|outset|none|hidden)\b/
const colorValue = /^(?:#[\da-f]{3,8}$|(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color|color-mix)\()/i

/**
 * A token's preview kind, from its category, its name, its value and, for a token a library describes, its DTCG type.
 * The name is read whatever its case or separators, so Fluent's `strokeWidthThin` and Chakra's `--chakra-z-index-modal`
 * land where Tailwind's names would.
 */
export function previewKind(token: Pick<Token, "name" | "category" | "values">, type?: string): PreviewKind {
  const name = token.name.toLowerCase().replaceAll(/[-_.]/g, "")
  const value = (token.values.default ?? Object.values(token.values)[0] ?? "").trim()
  switch (token.category) {
    case "color":
    case "spacing":
    case "radius":
    case "font-size":
    case "font":
    case "font-weight":
    case "tracking":
    case "leading":
    case "breakpoint":
    case "container":
      return token.category
    case "shadow":
      if (name.includes("insetshadow") || value.startsWith("inset")) return "inset-shadow"
      if (name.includes("dropshadow")) return "drop-shadow"
      if (name.includes("textshadow")) return "text-shadow"
      return "shadow"
    case "motion":
      if (name.includes("animat")) return "animation"
      if (type === "duration" || duration.test(value)) return "duration"
      if (type === "cubicBezier" || easing.test(value)) return "easing"
      return otherKind(name, value, type)
    default:
      return otherKind(name, value, type)
  }
}

/**
 * The kind of a token under Effects or Other, which hold whatever the category's names didn't place. A color value
 * wins over a name, so Mantine's `--rp-curve-root-color` is a color, not an easing.
 */
function otherKind(name: string, value: string, type: string | undefined): PreviewKind {
  // A named color, such as Chakra's `--chakra-colors-blue-contrast: white`, is known by its name.
  if (type === "color" || colorValue.test(value) || name.includes("color")) return "color"
  if (name.includes("animat")) return "animation"
  if (name.includes("backdropblur")) return "backdrop-blur"
  if (name.includes("blur")) return "blur"
  if (name.includes("perspective")) return "perspective"
  if (name.includes("aspect") || ratio.test(value)) return "aspect"
  if (name.includes("zindex")) return "z-index"
  if (name.includes("breakpoint")) return "breakpoint"
  if (name.includes("opacity")) return "opacity"
  if (name.includes("cursor")) return "cursor"
  if (/strokewidth|borderwidth|borders?(?:xs|sm|md|lg|xl|\d|thin|thick)/.test(name)) {
    return borderStyle.test(value) ? "border" : "border-width"
  }
  if (type === "duration" || name.includes("duration") || duration.test(value)) return "duration"
  if (type === "cubicBezier" || name.includes("ease") || name.includes("curve") || easing.test(value)) return "easing"
  if (type === "shadow") return "shadow"
  if (type === "fontFamily") return "font"
  if (type === "fontWeight") return "font-weight"
  return "number"
}

/** One way to write a token in code: in CSS or with Tailwind, saying what it sets, and the text itself. */
export interface CodeForm {
  group: "CSS" | "Tailwind"
  label: string
  text: string
}

/**
 * Each kind's Tailwind theme namespace and the utilities that read it, each with what it sets. A token named in the
 * namespace (`radius-md`) gets the utility Tailwind makes for it (`rounded-md`); any other gets the utility with the
 * variable (`z-(--chakra-z-index-modal)`).
 */
const utilities: Partial<Record<PreviewKind, [namespace: string, utilities: [utility: string, sets: string][]]>> = {
  color: [
    "color-",
    [
      ["bg", "Background"],
      ["text", "Text"],
      ["border", "Border"]
    ]
  ],
  spacing: [
    "spacing-",
    [
      ["p", "Padding"],
      ["gap", "Gap"],
      ["w", "Width"]
    ]
  ],
  radius: ["radius-", [["rounded", "Corner radius"]]],
  "border-width": ["", [["border", "Border width"]]],
  shadow: ["shadow-", [["shadow", "Shadow"]]],
  "inset-shadow": ["inset-shadow-", [["inset-shadow", "Inset shadow"]]],
  "drop-shadow": ["drop-shadow-", [["drop-shadow", "Drop shadow"]]],
  "text-shadow": ["text-shadow-", [["text-shadow", "Text shadow"]]],
  font: ["font-", [["font", "Font"]]],
  "font-size": ["text-", [["text", "Font size"]]],
  "font-weight": ["font-weight-", [["font", "Font weight"]]],
  leading: ["leading-", [["leading", "Line height"]]],
  tracking: ["tracking-", [["tracking", "Letter spacing"]]],
  opacity: ["", [["opacity", "Opacity"]]],
  blur: ["blur-", [["blur", "Blur"]]],
  "backdrop-blur": ["blur-", [["backdrop-blur", "Backdrop blur"]]],
  perspective: ["perspective-", [["perspective", "Perspective"]]],
  aspect: ["aspect-", [["aspect", "Aspect ratio"]]],
  duration: ["", [["duration", "Duration"]]],
  easing: ["ease-", [["ease", "Easing"]]],
  animation: ["animate-", [["animate", "Animation"]]],
  "z-index": ["", [["z", "Stacking"]]],
  container: ["container-", [["max-w", "Max width"]]],
  cursor: ["", [["cursor", "Cursor"]]]
}

/**
 * The ways to write a token in code, for the detail's Copy as menu: `var()`, which works anywhere CSS does, then the
 * Tailwind classes that use it. A breakpoint is a query instead (`@media (width >= 48rem)`, `md:`), as `var()` can't
 * go in one. `value` is what the token comes to, which a breakpoint's media query is written with.
 */
export function codeForms(name: string, kind: PreviewKind, value: string): CodeForm[] {
  const css: CodeForm = { group: "CSS", label: "Variable", text: `var(--${name})` }
  const step = (namespace: string) => (namespace && name.startsWith(namespace) ? name.slice(namespace.length) : "")
  if (kind === "breakpoint") {
    return [
      { group: "CSS", label: "Media query", text: `@media (width >= ${value})` },
      { group: "Tailwind", label: "Variant", text: `${step("breakpoint-") || name}:` }
    ]
  }
  if (kind === "border") return [css, { group: "Tailwind", label: "Border", text: `[border:${css.text}]` }]
  const [namespace, names] = utilities[kind] ?? ["", []]
  const named = step(namespace) || undefined
  // A project's own colors reach Tailwind through `@theme inline`, by their own names (`bg-primary`).
  const own = named ?? (kind === "color" ? name : undefined)
  const classes = names.map(([utility, label]): CodeForm => ({
    group: "Tailwind",
    label,
    text: own
      ? `${utility}-${own}`
      : kind === "border-width"
        ? `${utility}-(length:--${name})`
        : `${utility}-(--${name})`
  }))
  if (kind === "container" && named) classes.push({ group: "Tailwind", label: "Container query", text: `@${named}:` })
  // The spacing scale's base is what its steps are made of, not a length a class sets.
  return kind === "spacing" && !named ? [css] : [css, ...classes]
}

const reference = /var\(\s*--([\w-]+)\s*(?:,([^()]*))?\)/g

/** The tokens a value refers to with `var()`, in order. */
export function tokenReferences(value: string): string[] {
  return [...value.matchAll(reference)].map((match) => match[1]!)
}

/**
 * A value with each `var()` replaced by what `lookup` gives for its token: `calc(var(--radius) * 0.8)` becomes
 * `calc(0.625rem * 0.8)`. A reference `lookup` doesn't know takes its fallback, or stays as written.
 */
export function substituteReferences(value: string, lookup: (name: string) => string | undefined): string {
  return value.replace(reference, (whole, name: string, fallback?: string) => lookup(name) ?? fallback?.trim() ?? whole)
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
  for (const [index, char] of [...value].entries()) {
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
