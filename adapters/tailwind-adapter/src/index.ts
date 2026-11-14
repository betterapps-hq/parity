import { declares, type StylesAdapter, type ThemeVariable } from "@parity-app/core"
import { loadDesignSystem } from "./design-system.ts"
import { tailwindLogo } from "./logo.ts"
import { tailwindPrinter } from "./printer.ts"
import { writeTailwindTokens } from "./tokens.ts"

/**
 * Tailwind CSS v4. The theme comes from the project's own Tailwind (through `@tailwindcss/node`, which its Vite or
 * PostCSS plugin installs), so plugins, `@theme` blocks and imported presets all count, and classes are written and read
 * by what they compile to there. Token values are written into `@theme` where Tailwind makes a utility from them.
 */
export const tailwindStyles: StylesAdapter = {
  id: "tailwind",
  name: "Tailwind CSS",
  icon: tailwindLogo,
  status: ({ version }) => [
    {
      value: "Tailwind CSS",
      hint: version ? `Tailwind CSS ${version}` : "Tailwind CSS",
      detail: "Reads the theme and writes classes. Click to show the tokens",
      opens: { tab: "tokens" }
    }
  ],
  async detect({ pkg }) {
    const found = declares(pkg, ["tailwindcss"]) !== undefined

    return { found, summary: found ? "tailwindcss in package.json" : "No tailwindcss in package.json" }
  },
  versions: {
    packages: ["tailwindcss"],
    prefix: "v",
    majors: [
      [1, "2019-05-13"],
      [2, "2020-11-18"],
      [3, "2021-12-09"],
      [4, "2025-01-21"]
    ]
  },
  handles: (source) => /@import\s+["']tailwindcss["']|@tailwind\s+(?:base|utilities)/.test(source),
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
  },
  writeTokens: writeTailwindTokens
}
