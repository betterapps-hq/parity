import { readFile } from "node:fs/promises"
import { importSpecifiers } from "@parity-app/code"
import type { AppStyles } from "@parity-app/core"
import { isStylesheetFile } from "./code-changes.ts"
import { readStylesheet } from "./styles.ts"

/*
 * Which of the stylesheets an app's modules import are its global ones (`BuilderAdapter.styles`), whatever builder
 * walked the app to find them. Each builder walks its own module graph from the app's entries; the choice is the same.
 * Paths are absolute, with forward slashes.
 */

/** A stylesheet one of the app's modules imports, and how many of the project's own modules deep that module is. */
export interface Imported {
  file: string
  importer: string
  depth: number
}

/** What the walk found: the stylesheets, and the app's own files it read on the way, from the entries in. */
export interface Walked {
  found: Imported[]
  read: string[]
}

/**
 * What the app loads, from the stylesheets the shallowest modules import: one module's, or, when several import some,
 * those of the ones whose stylesheets hold the theme (all of them when none do), and the page's `<link>`s. The
 * project's own stylesheets are named by their path, and packages' by the specifier the app imports them by. `from`
 * lists every file whose contents could change the answer: each app file the walk read, compiled or not, and each
 * stylesheet read for the theme, with the files it `@import`s, whichever way it came out.
 */
export async function chooseAppStyles(
  { found, read }: Walked,
  root: string,
  resolve: (specifier: string, importer: string) => Promise<string | undefined>
): Promise<AppStyles> {
  const byImporter = new Map<string, string[]>()

  for (const { file, importer } of found) {
    byImporter.set(importer, [...new Set([...(byImporter.get(importer) ?? []), file])])
  }

  // In the order the walk met them, the order the app loads them in, so the cascade stays as it is. A page's `<link>`s
  // are global whatever they hold.
  const all = [...byImporter.keys()]
  const pages = all.filter((importer) => importer.endsWith(".html"))
  let importers = all.filter((importer) => !importer.endsWith(".html"))
  const themeRead = new Set<string>()

  if (importers.length > 1) {
    const themed = await Promise.all(
      importers.map(async (importer) => {
        const holds = await Promise.all(byImporter.get(importer)!.map((file) => holdsTheme(file, themeRead)))

        return holds.some(Boolean)
      })
    )

    const withTheme = importers.filter((_, index) => themed[index])

    if (withTheme.length > 0) {
      importers = withTheme
    }
  }

  importers = [...pages, ...importers]

  const styles: string[] = []
  const packageStyles: string[] = []

  const own = (file: string) => file.startsWith(`${root}/`) && !file.includes("/node_modules/")
  const seen = new Set<string>()

  for (const importer of importers) {
    for (const file of byImporter.get(importer)!) {
      if (seen.has(file)) {
        continue
      }

      seen.add(file)

      if (own(file)) {
        styles.push(file.slice(root.length + 1))
        continue
      }

      const specifier = await importedAs(resolve, importer, file)

      if (specifier) {
        packageStyles.push(specifier)
      }
    }
  }

  const relative = (file: string) => file.slice(root.length + 1)
  const sources = importers.flatMap((file) => (own(file) ? [relative(file)] : []))
  const others = [...read, ...themeRead].flatMap((file) => (own(file) ? [relative(file)] : [])).sort()
  const from = [...new Set([...sources, ...others])]

  return { styles, packageStyles, from }
}

/** Custom properties on the document's root (`:root`, `html`, `:host`) or in Tailwind's `@theme`: a theme's tokens. */
const themeTokens = /@theme\b|(?:^|[\s,}])(?::root|html|:host)\b[^{}]*\{[^}]*--[\w-]+\s*:/

/**
 * Whether a stylesheet, with the files it `@import`s by a relative path, defines the theme's tokens. Every file it read
 * goes in `read`, a missing one too.
 */
async function holdsTheme(file: string, read: Set<string>): Promise<boolean> {
  const seen = new Set<string>()
  const holds = themeTokens.test(await readStylesheet(file, seen))

  for (const path of seen) {
    read.add(path.replaceAll("\\", "/"))
  }

  return holds
}

/**
 * The specifier `importer` imports a package's stylesheet by, as it's written there (`fake-ui/styles.css`), which the
 * package's `exports` allow, where the file's own path may not be. Nothing when no bare import of a stylesheet in the
 * importer's source resolves to it, as when a plugin added the import.
 */
async function importedAs(
  resolve: (specifier: string, importer: string) => Promise<string | undefined>,
  importer: string,
  file: string
): Promise<string | undefined> {
  const source = await readFile(importer, "utf8").catch(() => "")
  const bare = importSpecifiers(source).filter((specifier) => isStylesheetFile(specifier) && !/^[./]/.test(specifier))

  for (const specifier of bare) {
    const resolved = await resolve(specifier, importer).catch(() => undefined)

    if (resolved?.split("?")[0] === file) {
      return specifier.split("?")[0]
    }
  }

  return undefined
}
