import type { LibraryBreakpoint, TokenCategory } from "@parity-app/core"
import { lengthToPixels } from "@parity-app/core"

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
 * The category a custom property belongs in, from the words in its name, then its value: `--mantine-spacing-md` is
 * spacing, `--fontSizeBase300` a font size, and anything whose value is a colour a colour.
 */
export function categorizeVar(name: string, value: string): TokenCategory {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .split(/[-_]/)
  const has = (...sequence: string[]) =>
    words.some((_, index) => sequence.every((word, offset) => words[index + offset] === word))
  if (has("breakpoint") || has("breakpoints") || has("screen")) return "breakpoint"
  // Tailwind names sizes `--text-sm`; `--heading-text-wrap` and `--text-color` aren't sizes.
  const textSize = words[0] === "text" && !["wrap", "color", "decoration", "shadow"].includes(words[1] ?? "")
  if (has("font", "size") || has("font", "sizes") || textSize) return "font-size"
  if (has("line", "height") || has("leading") || has("line", "heights")) return "leading"
  if (has("font", "weight") || has("font", "weights")) return "font-weight"
  if (has("letter", "spacing") || has("tracking")) return "tracking"
  if (has("font", "family") || has("font") || has("fonts")) return "font"
  if (has("radius") || has("radii") || has("rounded")) return "radius"
  if (has("shadow") || has("shadows") || has("elevation")) return "shadow"
  if (has("spacing") || has("space") || has("gap")) return "spacing"
  const moving = ["duration", "easing", "curve", "ease", "transition", "animation", "animate", "delay"]
  if (moving.some((word) => has(word))) return "motion"
  if (has("container") && !has("color")) return "container"
  if (has("color") || has("colors") || has("palette") || isColor(value)) return "color"
  return "other"
}

const colorValue =
  /^(?:#[\da-f]{3,8}|(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color|color-mix|light-dark)\(|transparent$)/i

export function isColor(value: string): boolean {
  return colorValue.test(value.trim())
}

/** A theme a selector belongs to: the root's defaults, or a dark theme however it's written. Anything else, none. */
export function themeOfSelector(selector: string, media = ""): string | undefined {
  const parts = selector.split(",").map((part) => part.trim().replaceAll(/\s+/g, " "))
  const dark = /prefers-color-scheme:\s*dark/.test(media)
  const isRoot = (part: string) =>
    /^(?::where\()?(?::root|:host|html)(?:\)|\s|$|\[|\.|,)/.test(part) || part === ":host"
  const isDark = (part: string) => /(?:^|[.\s])dark(?:[\s.:[]|$)|\[[\w-]+=["']?dark["']?\]/.test(part)
  const isLight = (part: string) => /(?:^|[.\s])light(?:[\s.:[]|$)|\[[\w-]+=["']?light["']?\]/.test(part)
  if (parts.some(isDark)) return "dark"
  if (parts.some((part) => isRoot(part) || isLight(part))) return dark ? "dark" : "default"
  return undefined
}

interface Block {
  prelude: string
  /** The declarations written directly inside it. */
  declarations: string
  children: Block[]
}

/** Splits CSS into nested blocks, each with its prelude and its own declarations. */
function blocks(css: string): Block[] {
  let index = 0
  const level = (): Omit<Block, "prelude"> => {
    let text = ""
    let declarations = ""
    const children: Block[] = []
    while (index < css.length) {
      const char = css[index]!
      if (char === "/" && css[index + 1] === "*") {
        const end = css.indexOf("*/", index + 2)
        index = end === -1 ? css.length : end + 2
      } else if (char === '"' || char === "'") {
        const end = css.indexOf(char, index + 1)
        text += css.slice(index, end === -1 ? css.length : end + 1)
        index = end === -1 ? css.length : end + 1
      } else if (char === "{") {
        index++
        const split = text.lastIndexOf(";") + 1
        declarations += text.slice(0, split)
        const inner = level()
        children.push({ prelude: text.slice(split).trim(), ...inner })
        text = ""
      } else if (char === "}") {
        index++
        return { declarations: declarations + text, children }
      } else {
        text += char
        index++
      }
    }
    return { declarations: declarations + text, children }
  }
  return level().children
}

/**
 * The tokens a library's CSS defines: custom properties on the root, on a dark theme (a `.dark` class, a
 * `[data-…=dark]` attribute or a `prefers-color-scheme: dark` block), and in Tailwind's `@theme`. Properties scoped to
 * one component's class aren't tokens.
 */
export function cssTokens(css: string): CollectedToken[] {
  const tokens = new Map<string, CollectedToken>()
  const visit = (list: Block[], media: string) => {
    for (const block of list) {
      if (/^@theme\b/.test(block.prelude)) declarations(block.declarations, "default")
      else if (block.prelude.startsWith("@")) {
        visit(block.children, block.prelude.startsWith("@media") ? `${media} ${block.prelude}` : media)
        continue
      } else {
        const theme = themeOfSelector(block.prelude, media)
        if (theme) declarations(block.declarations, theme)
      }
      visit(block.children, media)
    }
  }
  const declarations = (text: string, theme: string) => {
    for (const match of text.matchAll(/--([\w-]+)\s*:\s*([^;]+)/g)) {
      const name = match[1]!
      const value = match[2]!.trim()
      // Tailwind's per-token modifiers (`--text-sm--line-height`) pair with their token; they aren't tokens.
      if (name.includes("--") || name.startsWith("tw-")) continue
      const token = tokens.get(name) ?? { var: name, category: categorizeVar(name, value), values: {} }
      token.values[theme] = value
      tokens.set(name, token)
    }
    for (const match of text.matchAll(/--([\w-]+)--line-height\s*:\s*([^;]+)/g)) {
      const token = tokens.get(match[1]!)
      if (token && !token.lineHeight) token.lineHeight = match[2]!.trim().replace(/^var\(--([\w-]+)\)$/, "$1")
    }
  }
  visit(blocks(css), "")
  return [...tokens.values()]
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
    const full = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join("") : hex
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
