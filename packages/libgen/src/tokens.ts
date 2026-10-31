import type { LibraryBreakpoint, TokenCategory } from "@parity-app/core"
import { collectCustomProperties, lengthToPixels } from "@parity-app/core"
import { categorize, isTokenName, themedProperties } from "@parity-app/tokens"

/** A token found in a library, before it's written as DTCG. */
export interface CollectedToken {
  /** The custom property it compiles to, without `--`. */
  var: string
  category: TokenCategory
  /** Its value in each theme: `default`, else the theme, as in `dark`. Written as CSS. */
  values: Record<string, string>
  /** For a font size, the custom property of the line height it pairs with. */
  lineHeight?: string
  description?: string
}

/**
 * The tokens a library's CSS defines, read with the same rules the app reads a project's CSS with (`themedProperties`
 * and `categorize` in `@parity-app/tokens`): custom properties on the root, and on each theme a class or attribute
 * names (`.dark`, `[data-theme="dark"]`). Two differences are deliberate, because this reads source CSS whose themes
 * reach a frame as the class blocks `describedTokenCss` writes: Tailwind's `@theme` is the default, and a
 * `prefers-color-scheme` block is its theme. Properties scoped to one component's class aren't tokens.
 */
export function cssTokens(css: string): CollectedToken[] {
  const properties = themedProperties(collectCustomProperties(css), { colorScheme: true, tailwindTheme: true })
  const byName = new Map(properties.map((property) => [property.name, property]))
  const tokens: CollectedToken[] = []
  for (const { name, values, first } of properties) {
    if (!isTokenName(name)) continue
    const token: CollectedToken = { var: name, category: categorize(name, first), values }
    // Tailwind's per-token modifiers (`--text-sm--line-height`) pair with their token; they aren't tokens.
    const lineHeight = byName.get(`${name}--line-height`)?.values.default
    if (lineHeight) token.lineHeight = lineHeight.trim().replace(/^var\(--([\w-]+)\)$/, "$1")
    tokens.push(token)
  }
  return tokens
}

/**
 * Pairs each font size with the line height of the same step, as Parity's type controls do with Tailwind's
 * `--text-sm--line-height`: `--mantine-font-size-md` with `--mantine-line-height-md`, `fontSizeBase300` with
 * `lineHeightBase300`.
 */
export function pairLineHeights(tokens: Map<string, CollectedToken>): void {
  for (const token of tokens.values()) {
    if (token.category !== "font-size" || token.lineHeight) continue
    const candidates = [
      token.var.replace("font-size", "line-height"),
      token.var.replace("fontSize", "lineHeight"),
      token.var.replace(/^text-/, "leading-")
    ]
    const match = candidates.find((name) => name !== token.var && tokens.get(name)?.category === "leading")
    if (match) token.lineHeight = match
  }
}

/** Breakpoints from `--breakpoint-*` tokens, or any token in that category, in pixels at 16px to the rem. */
export function breakpointsOf(tokens: readonly CollectedToken[]): LibraryBreakpoint[] {
  const names: Record<string, string> = { xs: "Extra small", sm: "Small", md: "Medium", lg: "Large", xl: "XL" }
  const found: LibraryBreakpoint[] = []
  for (const token of tokens) {
    if (token.category !== "breakpoint" || !token.values.default) continue
    const width = lengthToPixels(token.values.default)
    if (width === undefined || width <= 0) continue
    const id = token.var.replace(/^.*breakpoints?-/, "")
    found.push({ id, name: names[id] ?? id.toUpperCase(), width })
  }
  return found.sort((a, b) => a.width - b.width)
}

/**
 * Tokens written as DTCG (2025.10): grouped by Parity's category, each naming its custom property in
 * `$extensions.parity`, so the Tokens panel puts `--mantine-spacing-md` under Spacing and frames can declare it. One
 * theme is a token file; several make a resolver whose `theme` modifier has a context for each.
 */
export function toDtcg(tokens: readonly CollectedToken[], prefix = ""): Record<string, unknown> {
  const pathOf = new Map<string, string[]>()
  const taken = new Set<string>()
  for (const token of tokens) {
    let path = [token.category, ...nameParts(token.var, prefix, token.category)]
    if (path.length === 1 || taken.has(path.join("."))) path = [token.category, ...token.var.split("-").filter(Boolean)]
    while (taken.has(path.join("."))) path = [...path.slice(0, -1), `${path.at(-1)}_`]
    taken.add(path.join("."))
    pathOf.set(token.var, path)
  }
  const contexts = [...new Set(tokens.flatMap((token) => Object.keys(token.values)))].filter((c) => c !== "default")
  const groupsFor = (context: string): Record<string, unknown> => {
    const root: Record<string, unknown> = {}
    for (const token of tokens) {
      const value = token.values[context]
      if (value === undefined || (context !== "default" && value === token.values.default)) continue
      const path = pathOf.get(token.var)!
      let group = root
      for (const part of path.slice(0, -1)) group = (group[part] ??= {}) as Record<string, unknown>
      const extension: Record<string, string> = { var: token.var }
      if (token.lineHeight) extension.lineHeight = token.lineHeight
      group[path.at(-1)!] = {
        ...dtcgValue(value, token.category, pathOf),
        ...(token.description && context === "default" ? { $description: token.description } : {}),
        $extensions: { parity: extension }
      }
    }
    return root
  }
  if (contexts.length === 0) return groupsFor("default")
  return {
    version: "2025.10",
    sets: { tokens: { sources: [groupsFor("default")] } },
    modifiers: {
      theme: {
        default: "default",
        contexts: Object.fromEntries([["default", []], ...contexts.map((context) => [context, [groupsFor(context)]])])
      }
    },
    resolutionOrder: [{ $ref: "#/sets/tokens" }, { $ref: "#/modifiers/theme" }]
  }
}

/** A token's name below its category: `mantine-spacing-md` is `md`, `colorNeutralBackground1` is `neutralBackground1`. */
function nameParts(name: string, prefix: string, category: TokenCategory): string[] {
  let rest = prefix && name.startsWith(prefix) ? name.slice(prefix.length) : name
  rest = rest.replace(/^-/, "")
  const words: Record<TokenCategory, RegExp> = {
    color: /^(?:colou?rs?|palette)[-_]?/i,
    spacing: /^(?:spacing|space)[-_]?/i,
    radius: /^(?:border-?radius|radius|radii|rounded)[-_]?/i,
    "font-size": /^(?:font-?size|text)[-_]?/i,
    font: /^(?:font-?family|fonts?)[-_]?/i,
    "font-weight": /^font-?weight[-_]?/i,
    tracking: /^(?:letter-?spacing|tracking)[-_]?/i,
    leading: /^(?:line-?height|leading)[-_]?/i,
    shadow: /^(?:shadows?|elevation)[-_]?/i,
    breakpoint: /^(?:breakpoints?|screens?)[-_]?/i,
    container: /^containers?[-_]?/i,
    effect: /^$/,
    motion: /^$/,
    other: /^$/
  }
  const stripped = rest.replace(words[category], "")
  const base = stripped || rest
  return base
    .split("-")
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part[0]!.toLowerCase() + part.slice(1) : part))
}

/** A CSS value as DTCG writes it, where DTCG can; anything else stays CSS, which Parity reads as written. */
function dtcgValue(value: string, category: TokenCategory, paths: Map<string, string[]>): Record<string, unknown> {
  const reference = /^var\(--([\w-]+)\)$/.exec(value.trim())?.[1]
  if (reference && paths.has(reference)) return { $value: `{${paths.get(reference)!.join(".")}}` }
  const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(value.trim())?.[1]
  if (hex && category === "color") {
    const full =
      hex.length <= 4
        ? hex
            .split("")
            .map((digit) => digit + digit)
            .join("")
        : hex
    const channels = [0, 2, 4].map((at) => Math.round((parseInt(full.slice(at, at + 2), 16) / 255) * 1000) / 1000)
    const alpha = full.length === 8 ? Math.round((parseInt(full.slice(6, 8), 16) / 255) * 1000) / 1000 : undefined
    return {
      $type: "color",
      $value: {
        colorSpace: "srgb",
        components: channels,
        ...(alpha !== undefined && alpha < 1 ? { alpha } : {}),
        hex: `#${full.slice(0, 6).toLowerCase()}`
      }
    }
  }
  const dimension = /^(-?\d*\.?\d+)(px|rem|em)$/.exec(value.trim())
  if (
    dimension &&
    ["spacing", "radius", "font-size", "breakpoint", "tracking", "container", "leading"].includes(category)
  ) {
    return { $type: "dimension", $value: { value: Number(dimension[1]), unit: dimension[2] } }
  }
  const duration = /^(-?\d*\.?\d+)(ms|s)$/.exec(value.trim())
  if (duration && category === "motion") {
    return { $type: "duration", $value: { value: Number(duration[1]), unit: duration[2] } }
  }
  if (/^-?\d*\.?\d+$/.test(value.trim())) {
    const number = Number(value)
    if (category === "font-weight") return { $type: "fontWeight", $value: number }
    return { $type: "number", $value: number }
  }
  return { $value: value }
}
