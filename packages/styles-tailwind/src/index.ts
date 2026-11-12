import type { StylesAdapter, ThemeVariable } from "@parity-app/core"
import { loadDesignSystem } from "./design-system.ts"
import { tailwindPrinter } from "./printer.ts"

/**
 * Tailwind CSS v4. The theme comes from the project's own Tailwind (through `@tailwindcss/node`, which its Vite or
 * PostCSS plugin installs), so plugins, `@theme` blocks and imported presets all count, and classes are written and read
 * by what they compile to there.
 */
export const tailwindStyles: StylesAdapter = {
  id: "tailwind",
  name: "Tailwind CSS",
  detect: (source) => /@import\s+["']tailwindcss["']|@tailwind\s+(?:base|utilities)/.test(source),
  async loadTheme(root, stylesheet) {
    const system = await loadDesignSystem(root, stylesheet)
    const variables: ThemeVariable[] = []

    for (const [name, { value }] of system.theme.entries()) {
      if (name.startsWith("--")) {
        variables.push({ name: name.slice(2), value })
      }
    }

    return variables
  },
  async loadPrinter(root, stylesheet) {
    const [compiles, spells] = await Promise.all([
      loadDesignSystem(root, stylesheet),
      loadDesignSystem(root, stylesheet)
    ])

    return tailwindPrinter({ compiles, spells })
  }
}
