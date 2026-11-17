import { defineExtension, type Parity, type ThemeVariable } from "@parity-app/extension"
import { type ClassPrinter, writeClasses } from "./classes.ts"
import { loadDesignSystem } from "./design-system.ts"
import { withStylesImport } from "./imports.ts"
import { tailwindPrinter } from "./printer.ts"
import { setsOwnSize } from "./sizing.ts"
import { withSpacingSteps } from "./spacing.ts"
import { writeTailwindTokens } from "./tokens.ts"

/*
 * Tailwind CSS v4 as an extension (PAR-1095), using only Parity's public API and its SDK's helpers for writing
 * stylesheets and finding the project's packages (PAR-1130). Its styles provider reads the theme from
 * the project's own Tailwind (through `@tailwindcss/node`, which its Vite or PostCSS plugin installs), so plugins,
 * `@theme` blocks and imported presets all count; writes a layer's declarations as the classes they compile to there;
 * writes token values into `@theme` where Tailwind makes a utility from them; imports a library's stylesheet after
 * Tailwind's own; and says which classes set an element's own size. The status bar names it, and opens the tokens.
 */

export { setsOwnSize } from "./sizing.ts"

/** Whether a stylesheet uses Tailwind: v4's import, or v3's directives. */
export function handles(source: string): boolean {
  return /@import\s+["']tailwindcss["']|@tailwind\s+(?:base|utilities)/.test(source)
}

/**
 * Every theme variable a stylesheet defines, without its `--`, resolved by the project's own Tailwind, and the steps of
 * its spacing scale.
 */
export async function readTheme(root: string, stylesheet: string): Promise<ThemeVariable[]> {
  const system = await loadDesignSystem(root, stylesheet)
  const variables: ThemeVariable[] = []

  for (const [name, { value }] of system.theme.entries()) {
    if (name.startsWith("--")) {
      variables.push({ name: name.slice(2), value })
    }
  }

  return withSpacingSteps(variables)
}

export default defineExtension({ activate })

function activate(parity: Parity): void {
  const { root } = parity.project
  const status = parity.status.item("tailwind.status")
  status.set({ value: "Tailwind CSS", tooltip: "Reads the theme and writes classes. Click to show the tokens" })
  parity.subscriptions.push(status)

  /** The printer for the stylesheet as it is at `version`, loaded once; an older version's goes. */
  let printer: { key: string; loading: Promise<ClassPrinter> } | undefined

  const printerFor = (stylesheet: string, version: number) => {
    const key = `${stylesheet}@${version}`

    if (printer?.key !== key) {
      const loading = Promise.all([loadDesignSystem(root, stylesheet), loadDesignSystem(root, stylesheet)]).then(
        ([compiles, spells]) => tailwindPrinter({ compiles, spells })
      )

      // One that fails is loaded again the next time it's asked for.
      loading.catch(() => {
        if (printer?.loading === loading) {
          printer = undefined
        }
      })
      printer = { key, loading }
    }

    return printer.loading
  }

  parity.subscriptions.push(
    parity.commands.register("tailwind.showTokens", () => parity.navigate.showTab("tokens")),
    parity.providers.register("styles", {
      handles: async ({ source }) => handles(source),
      theme: ({ stylesheet }) => readTheme(root, stylesheet),
      async classes({ stylesheet, version, written, declarations }) {
        return writeClasses(await printerFor(stylesheet, version), written, declarations)
      },
      writeTokens: async ({ source, writes, theme }) => writeTailwindTokens(source, writes, theme),
      importStyles: async ({ source, specifier }) => withStylesImport(source, specifier),
      setsOwnSize: async ({ classes }) => classes.map(setsOwnSize)
    })
  )
}
