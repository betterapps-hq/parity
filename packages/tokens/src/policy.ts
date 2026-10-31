import type { CustomPropertyDeclaration, EnclosingAtRule, TokenCategory } from "@parity-app/core"

/**
 * The rules for which theme a custom property's value belongs to and which category a token goes in. Libgen reads a
 * library's source CSS with them and the app reads a project's compiled CSS with them, so a token lands in the same
 * theme and category either way. See docs/decisions.md, "Token policies live in `@parity-app/tokens`".
 */

/** Where libgen, reading a library's source CSS, deliberately reads more than the app does. */
export interface ThemeOptions {
  /**
   * Read a `@media (prefers-color-scheme: dark)` block around the root as the `dark` theme, and a `light` one as the
   * default. Libgen does, because a library's themes reach a frame as the class blocks `describedTokenCss` writes; the
   * app doesn't, because a frame gets a theme from a class or attribute the Modes panel sets, never a media query.
   */
  colorScheme?: boolean
  /**
   * Read declarations directly in Tailwind's `@theme` as the default theme. Only source CSS has `@theme`; the app reads
   * the theme Tailwind itself resolves instead (`StylesAdapter.loadTheme`), which also knows the aliases it inlines.
   */
  tailwindTheme?: boolean
}

/**
 * At-rules that don't pick a theme: a cascade layer only orders rules, and a feature check holds whatever the theme.
 * Any other (`@media`, `@container`, `@scope`…) makes a value conditional, so it's no theme's value.
 */
const unconditionalAtRules = new Set(["layer", "supports"])

/** Whether values under these at-rules hold whatever the conditions, so they can belong to a theme. */
export function isUnconditional(atRules: readonly EnclosingAtRule[]): boolean {
  return atRules.every((atRule) => unconditionalAtRules.has(atRule.name))
}

/** The theme a `prefers-color-scheme` query picks, when it's the whole query. */
function colorSchemeOf(atRule: EnclosingAtRule): string | undefined {
  if (atRule.name !== "media") return undefined
  const scheme = /^\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)$/i.exec(atRule.prelude)?.[1]?.toLowerCase()
  if (scheme === "light") return "default"
  return scheme
}

/** Whether a value comes from a `prefers-color-scheme` block, which a theme's own selector overrides. */
function fromColorScheme(atRules: readonly EnclosingAtRule[]): boolean {
  return atRules.some((atRule) => colorSchemeOf(atRule) !== undefined)
}

/**
 * The theme a rule's values belong to: `default` for the root, otherwise the theme it names, or none.
 *
 * - The root is `:root`, `:host`, `html` or `:where(:root)` (and, with `tailwindTheme`, Tailwind's `@theme`).
 * - A theme is named by a class or an attribute's value, alone or on the root: `.dark`, `[data-theme="dark"]`,
 *   `:root.dark`, `html[data-theme=dark]` and `:host([data-theme='dark'])` are all `dark`. `light` names the default,
 *   as Parity's own Light mode is the frame without a theme.
 * - `:not(…)` doesn't change the theme, so `:root:not(.dark)` is the root.
 * - In a selector list, a part that's the root makes the rule the root's; otherwise every part must name one theme.
 *
 * Left unsupported, so naming no theme: a selector with a combinator (`.dark .card` styles a component), two names at
 * once (`.dark.contrast`), attribute operators other than `=`, other pseudo-classes, a `:where()` or `:is()` holding a
 * list, and any at-rule besides `@layer` and `@supports` (and the ones the options allow).
 */
export function themeOfSelector(
  selector: string,
  atRules: readonly EnclosingAtRule[],
  options: ThemeOptions = {}
): string | undefined {
  let scheme: string | undefined
  for (const atRule of atRules) {
    if (unconditionalAtRules.has(atRule.name) || (options.tailwindTheme && atRule.name === "theme")) continue
    const picked = options.colorScheme ? colorSchemeOf(atRule) : undefined
    if (picked === undefined || (scheme !== undefined && scheme !== picked)) return undefined
    scheme = picked
  }
  const inTailwindTheme = options.tailwindTheme === true && atRules.at(-1)?.name === "theme"
  let theme: string | undefined
  if (selector.trim() !== "") theme = listTheme(selector)
  else if (inTailwindTheme) theme = "default"
  if (theme === undefined || scheme === undefined) return theme
  // Inside a colour-scheme query, the root takes the query's theme; a theme's own selector must agree with it.
  return theme === "default" || theme === scheme ? scheme : undefined
}

function listTheme(selector: string): string | undefined {
  const themes = splitTopLevel(selector, ",").map((part) => compoundTheme(part.trim()))
  if (themes.some((theme) => theme?.root && theme.name === undefined)) return "default"
  const names = new Set(themes.map((theme) => (theme ? (theme.name ?? "default") : undefined)))
  const [only] = names
  return names.size === 1 ? only : undefined
}

interface CompoundTheme {
  root: boolean
  name?: string
}

const simpleSelector =
  /^(?:(?<root>html|:root|:host)(?![\w(-])|\.(?<className>[\w-]+)|\[\s*[\w-]+\s*(?:=\s*(?:"(?<double>[^"]*)"|'(?<single>[^']*)'|(?<bare>[\w-]+))\s*(?:[is]\s*)?)?\]|(?<functional>:(?:not|where|is|host)\())/

/** The theme one compound selector (no combinators) names, or undefined when it isn't a theme's. */
function compoundTheme(part: string): CompoundTheme | undefined {
  let root = false
  const names: string[] = []
  let rest = part
  while (rest.length > 0) {
    const match = simpleSelector.exec(rest)
    if (!match?.groups) return undefined
    const { groups } = match
    if (groups.functional) {
      const open = groups.functional.length
      const close = matchingParen(rest, open - 1)
      if (close === -1) return undefined
      const inner = rest.slice(open, close).trim()
      rest = rest.slice(close + 1)
      if (groups.functional === ":not(") continue
      if (groups.functional === ":host(") root = true
      const nested = compoundTheme(inner)
      if (!nested) return undefined
      root ||= nested.root
      if (nested.name !== undefined) names.push(nested.name)
      continue
    }
    rest = rest.slice(match[0].length)
    if (groups.root) root = true
    const name = groups.className ?? groups.double ?? groups.single ?? groups.bare
    if (name !== undefined) names.push(name)
  }
  if (names.length > 1) return undefined
  const name = names[0] === "light" ? undefined : names[0]
  if (!root && names.length === 0) return undefined
  return { root: root || names[0] === "light", ...(name === undefined ? {} : { name }) }
}

function matchingParen(text: string, open: number): number {
  let depth = 0
  for (let index = open; index < text.length; index++) {
    if (text[index] === "(") depth++
    else if (text[index] === ")" && --depth === 0) return index
  }
  return -1
}

/** Splits on a separator outside parentheses, brackets and quotes. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | undefined
  let start = 0
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!
    if (quote) {
      if (char === "\\") index++
      else if (char === quote) quote = undefined
    } else if (char === '"' || char === "'") quote = char
    else if (char === "(" || char === "[") depth++
    else if (char === ")" || char === "]") depth--
    else if (char === separator && depth === 0) {
      parts.push(text.slice(start, index))
      start = index + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

/** A custom property's values by theme, from every declaration that belongs to one. */
export interface ThemedProperty {
  /** Without `--`. */
  name: string
  values: Record<string, string>
  /** The first value declared, whatever the theme, which its category is read from. */
  first: string
}

/**
 * Custom properties by theme, in the order they're first declared. A later declaration in the same theme wins, as in
 * the cascade, except that a `prefers-color-scheme` block never replaces a value a theme's own selector gives. A class
 * or attribute is a theme only if it overrides something the root defines; one that sets only its own variables, such
 * as a component's `.card` or a `.scroll-fade-b` utility, isn't.
 */
export function themedProperties(
  declarations: readonly CustomPropertyDeclaration[],
  options: ThemeOptions = {}
): ThemedProperty[] {
  const themed = declarations.flatMap((declaration) => {
    const theme = themeOfSelector(declaration.selector, declaration.atRules, options)
    return theme === undefined ? [] : [{ ...declaration, theme, scheme: fromColorScheme(declaration.atRules) }]
  })
  const rootNames = new Set(themed.flatMap(({ theme, name }) => (theme === "default" ? [name] : [])))
  const themes = new Set(themed.flatMap(({ theme, name }) => (rootNames.has(name) ? [theme] : [])))
  const properties = new Map<string, ThemedProperty>()
  const fromScheme = new Set<string>()
  for (const { name, value, theme, scheme } of themed) {
    if (!themes.has(theme)) continue
    const property = properties.get(name) ?? { name, values: {}, first: value }
    const key = `${theme}\n${name}`
    if (scheme && property.values[theme] !== undefined && !fromScheme.has(key)) continue
    property.values[theme] = value
    if (scheme) fromScheme.add(key)
    else fromScheme.delete(key)
    properties.set(name, property)
  }
  return [...properties.values()]
}

/** Framework internals and per-token modifiers (`text-sm--line-height`) aren't tokens a designer picks. */
export function isTokenName(name: string): boolean {
  return !name.startsWith("tw-") && !name.startsWith("default-") && !name.includes("--")
}

const colorValue =
  /^(?:#[\da-f]{3,8}|(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color|color-mix|light-dark)\(|transparent$|currentcolor$)/i

/** Whether a CSS value is a colour. */
export function isColor(value: string): boolean {
  return colorValue.test(value.trim())
}

/**
 * The category a custom property belongs in, from the words in its name, then its value: `--mantine-spacing-md` is
 * spacing, `--fontSizeBase300` a font size, Tailwind's `--text-sm` a font size but `--text-shadow-sm` a shadow, and
 * anything whose value is a colour a colour.
 */
export function categorize(name: string, value: string): TokenCategory {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .split(/[-_]/)
    .filter(Boolean)
  const has = (...sequence: string[]) =>
    words.some((_, index) => sequence.every((word, offset) => words[index + offset] === word))
  if (has("breakpoint") || has("breakpoints") || has("screen") || has("screens")) return "breakpoint"
  // Tailwind names sizes `--text-sm`; `--heading-text-wrap`, `--text-color`, `--text-shadow-sm` and a bare `--text`
  // (usually the text colour) aren't sizes.
  const textSize =
    words[0] === "text" && words.length > 1 && !["wrap", "color", "decoration", "shadow"].includes(words[1]!)
  if (has("font", "size") || has("font", "sizes") || textSize) return "font-size"
  if (has("line", "height") || has("leading") || has("line", "heights")) return "leading"
  if (has("font", "weight") || has("font", "weights")) return "font-weight"
  if (has("letter", "spacing") || has("tracking")) return "tracking"
  if (has("font", "family") || has("font") || has("fonts")) return "font"
  if (has("radius") || has("radii") || has("rounded")) return "radius"
  if (has("shadow") || has("shadows") || has("elevation")) return "shadow"
  if (has("spacing") || has("space") || has("gap")) return "spacing"
  if (has("blur") || has("perspective") || has("aspect")) return "effect"
  const moving = ["duration", "easing", "curve", "ease", "transition", "animation", "animate", "delay"]
  if (moving.some((word) => has(word))) return "motion"
  if (has("container") && !has("color")) return "container"
  if (has("color") || has("colors") || has("palette") || isColor(value)) return "color"
  return "other"
}
