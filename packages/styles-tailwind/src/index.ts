import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import type { StylesAdapter, ThemeVariable } from "@parity/core"

interface TailwindNode {
  __unstable__loadDesignSystem(
    css: string,
    options: { base: string }
  ): Promise<{ theme: { entries(): Iterable<[string, { value: string }]> } }>
}

/**
 * Tailwind CSS v4. The theme comes from the project's own Tailwind (through `@tailwindcss/node`, which its Vite or
 * PostCSS plugin installs), so plugins, `@theme` blocks and imported presets all count.
 */
export const tailwindStyles: StylesAdapter = {
  id: "tailwind",
  name: "Tailwind CSS",
  detect: (source) => /@import\s+["']tailwindcss["']|@tailwind\s+(?:base|utilities)/.test(source),
  async loadTheme(root, stylesheet) {
    const path = join(root, stylesheet)
    const tailwind = await loadTailwindNode(root)
    const system = await tailwind.__unstable__loadDesignSystem(await readFile(path, "utf8"), { base: dirname(path) })
    const variables: ThemeVariable[] = []
    for (const [name, { value }] of system.theme.entries()) {
      if (name.startsWith("--")) variables.push({ name: name.slice(2), value })
    }
    return variables
  }
}

async function loadTailwindNode(root: string): Promise<TailwindNode> {
  const fromProject = createRequire(join(root, "package.json"))
  // `@tailwindcss/node` is usually a dependency of the project's Tailwind plugin rather than of the project itself.
  for (const via of [undefined, "@tailwindcss/vite", "@tailwindcss/postcss", "@tailwindcss/cli"]) {
    try {
      const require = via ? createRequire(fromProject.resolve(via)) : fromProject
      const resolved = require.resolve("@tailwindcss/node")
      return (await import(pathToFileURL(resolved).href)) as TailwindNode
    } catch {
      // Try the next way in.
    }
  }
  throw new Error(`Tailwind's @tailwindcss/node is not installed in ${root}`)
}
