import { collectCustomProperties, type DescribedToken, type ThemeVariable, type TokenCategory } from "@parity-app/core"
import { categorize, isTokenName, themedProperties } from "./policy.ts"

export interface Token {
  /** Custom property name without `--`; what a design references. */
  name: string
  category: TokenCategory
  /**
   * `semantic` for the project's own variables (shadcn's `primary`, `background`…), which usually change per theme;
   * `theme` for the styling framework's scale (Tailwind's palette, type scale, radius steps…).
   */
  source: "semantic" | "theme"
  /** Value per theme: `default` for the root, otherwise the theme a class or attribute names (e.g. `dark`). */
  values: Record<string, string>
  /** A step of a scale built on another token, like `spacing-4` on `spacing`: read-only, it follows its base. */
  derived?: { from: string; factor: number }
}

/** The steps of the spacing scale, as Tailwind's utilities use them: `p-4` is four steps of `--spacing`. */
export const spacingScale = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64,
  72, 80, 96
]

/** The token name a spacing step goes by. */
export function spacingStepName(step: number): string {
  return `spacing-${step}`
}

/**
 * The project's design tokens: every custom property its compiled CSS defines on the root or for a theme, plus
 * the styling framework's full theme, which compiled CSS trims to what the code already uses. These are exactly the
 * values a design may reference.
 */
export function extractTokens(
  css: string,
  theme: readonly ThemeVariable[] = [],
  categories: Readonly<Record<string, TokenCategory>> = {}
): Token[] {
  const themeValues = new Map(theme.map((variable) => [variable.name, variable.value]))
  const tokens = new Map<string, Token>()
  const categoryOf = (name: string, value: string) => categories[name] ?? categorize(name, value)
  // Which rule is which theme's, and which category a name is in, are shared with libgen: see `policy.ts`.
  for (const { name, values, first } of themedProperties(collectCustomProperties(css))) {
    if (!isTokenName(name)) continue
    const source = themeValues.has(name) ? "theme" : "semantic"
    tokens.set(name, { name, category: categoryOf(name, first), source, values })
  }
  for (const [name, value] of themeValues) {
    if (tokens.has(name) || !isTokenName(name) || aliasOfSemantic(name, value, tokens)) continue
    tokens.set(name, { name, category: categoryOf(name, value), source: "theme", values: { default: value } })
  }
  // The scale itself is one variable; its steps are what designs use, so each is listed as a token of its own.
  if (tokens.get("spacing")?.category === "spacing") {
    for (const step of spacingScale) {
      const name = spacingStepName(step)
      if (tokens.has(name)) continue
      tokens.set(name, {
        name,
        category: "spacing",
        source: "theme",
        values: { default: step === 0 ? "0" : `calc(var(--spacing) * ${step})` },
        derived: { from: "spacing", factor: step }
      })
    }
  }
  return [...tokens.values()].sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }))
}

/**
 * Declares the theme variables compiled CSS left out, so a design can use any of them before the project's code does.
 * The compiled CSS's own declarations stay in charge of everything it defines.
 */
export function themeFallbackCss(css: string, theme: readonly ThemeVariable[]): string {
  const defined = new Set(collectCustomProperties(css).map((declaration) => declaration.name))
  const missing = theme.filter((variable) => !defined.has(variable.name))
  if (missing.length === 0) return ""
  return `:host {\n${missing.map(({ name, value }) => `  --${name}: ${value};`).join("\n")}\n}\n`
}

/** shadcn maps `--color-primary` to `var(--primary)` so Tailwind classes see it; the semantic name is the token. */
function aliasOfSemantic(name: string, value: string, tokens: Map<string, Token>): boolean {
  const target = /^var\(--([\w-]+)\)$/.exec(value.trim())?.[1]
  return target !== undefined && tokens.get(target)?.source === "semantic" && name.endsWith(target)
}

export const tokenCategories: readonly TokenCategory[] = [
  "color",
  "spacing",
  "radius",
  "font-size",
  "font",
  "font-weight",
  "tracking",
  "leading",
  "shadow",
  "breakpoint",
  "container",
  "effect",
  "motion",
  "other"
]

/** DTCG group names libraries use, by the category Parity shows them in. */
const groupCategories: Record<string, TokenCategory> = {
  color: "color",
  colors: "color",
  palette: "color",
  spacing: "spacing",
  space: "spacing",
  radius: "radius",
  radii: "radius",
  "border-radius": "radius",
  borderradius: "radius",
  "font-size": "font-size",
  fontsize: "font-size",
  fontsizes: "font-size",
  font: "font",
  fonts: "font",
  fontfamily: "font",
  "font-weight": "font-weight",
  fontweight: "font-weight",
  fontweights: "font-weight",
  tracking: "tracking",
  letterspacing: "tracking",
  leading: "leading",
  lineheight: "leading",
  lineheights: "leading",
  shadow: "shadow",
  shadows: "shadow",
  breakpoint: "breakpoint",
  breakpoints: "breakpoint",
  container: "container",
  motion: "motion",
  duration: "motion",
  durations: "motion",
  easing: "motion",
  easings: "motion"
}

const typeCategories: Record<string, TokenCategory> = {
  color: "color",
  shadow: "shadow",
  fontFamily: "font",
  fontWeight: "font-weight",
  duration: "motion",
  cubicBezier: "motion",
  transition: "motion"
}

/** The custom property a described token compiles to: the one its extension names, else its whole path. */
export function describedTokenVar(token: DescribedToken): string {
  return token.parity?.var ?? token.path.split(".").join("-")
}

/**
 * The category a described token belongs in: what its extension says, else its first group (`spacing.md` is spacing),
 * else its type. This is how a library's `--mantine-spacing-md` lands with Parity's spacing, not under Other.
 */
export function describedTokenCategory(token: DescribedToken): TokenCategory | undefined {
  const explicit = token.parity?.category
  if (explicit && (tokenCategories as readonly string[]).includes(explicit)) return explicit as TokenCategory
  const group = token.path.split(".")[0]!.toLowerCase()
  return groupCategories[group] ?? (token.type ? typeCategories[token.type] : undefined)
}

/** Categories by custom property, for the tokens libraries describe. */
export function describedCategories(tokens: readonly DescribedToken[]): Record<string, TokenCategory> {
  const categories: Record<string, TokenCategory> = {}
  for (const token of tokens) {
    const category = describedTokenCategory(token)
    if (category) categories[describedTokenVar(token)] = category
  }
  return categories
}

/**
 * Custom properties for the tokens a library describes but only creates at run time, as CSS-in-JS libraries do: each
 * context's values, `default` on the frame and any other on its class (`.dark`). A font size with a line height also
 * gets the `--size--line-height` Parity's type controls pair with it. Put it before the project's styles, so whatever
 * the project or the library declares itself still wins.
 */
export function describedTokenCss(tokens: readonly DescribedToken[]): string {
  const byContext = new Map<string, string[]>()
  const declare = (context: string, line: string) => {
    const lines = byContext.get(context) ?? []
    lines.push(line)
    byContext.set(context, lines)
  }
  const names = new Set(tokens.map(describedTokenVar))
  for (const token of tokens) {
    if (!token.parity?.var) continue
    for (const [context, value] of Object.entries(token.values)) declare(context, `  --${token.parity.var}: ${value};`)
    const lineHeight = token.parity.lineHeight
    if (lineHeight) {
      const value = names.has(lineHeight) ? `var(--${lineHeight})` : lineHeight
      declare("default", `  --${token.parity.var}--line-height: ${value};`)
    }
  }
  return [...byContext]
    .map(([context, lines]) => `${context === "default" ? ":host" : `.${context}`} {\n${lines.join("\n")}\n}\n`)
    .join("")
}
