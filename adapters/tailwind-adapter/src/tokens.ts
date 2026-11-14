import type { ThemeVariable } from "@parity-app/core"
import { type SetPropertyOptions, type TokenWrite, writeCustomProperty, writeTokenChanges } from "@parity-app/tokens"

/** Tailwind's theme: an `@theme` block, or the root where the stylesheet already declares the variable there. */
const themeBlocks: SetPropertyOptions = {
  blocks: ["@theme", "@theme inline", "@theme static"],
  theme: "default",
  create: "@theme"
}

/**
 * The namespaces Tailwind's theme makes utilities from, as its documentation lists them: a variable named
 * `--text-2xl` in `@theme` is what makes the class `text-2xl`.
 */
const namespaces = [
  "color",
  "font",
  "text",
  "font-weight",
  "tracking",
  "leading",
  "breakpoint",
  "container",
  "spacing",
  "radius",
  "shadow",
  "inset-shadow",
  "drop-shadow",
  "text-shadow",
  "blur",
  "perspective",
  "aspect",
  "ease",
  "animate"
]

/**
 * Writes token values into a Tailwind stylesheet's source. A default value for a variable of the theme goes in an
 * `@theme` block, so Tailwind makes its utility: a variable `theme` already has (what `loadTheme` read, Tailwind's own
 * defaults among it), or a new one in one of Tailwind's namespaces, such as `--text-2xl` or `--shadow-popup`. Every
 * other value is a custom property like any stylesheet's, in the root or its theme's block.
 */
export function writeTailwindTokens(
  source: string,
  writes: readonly TokenWrite[],
  theme: readonly ThemeVariable[]
): string {
  const themeNames = new Set(theme.map((variable) => variable.name))
  const inTheme = (name: string) => themeNames.has(name) || namespaces.some((space) => name.startsWith(`${space}-`))
  let content = source

  for (const write of writes) {
    content =
      write.theme === "default" && inTheme(write.name)
        ? writeCustomProperty(content, write, themeBlocks)
        : writeTokenChanges(content, [write])
  }

  return content
}
