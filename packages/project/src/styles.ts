import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { isStylesheetFile, stylesheetExtensions } from "./code-changes.ts"

/** An app's global stylesheets: the project's own, by path from its root, and packages', by their specifiers. */
export interface AppStyles {
  styles: string[]
  /** Stylesheets the entry imports from packages, as `@mantine/core/styles.css`, which the project doesn't own. */
  packageStyles: string[]
}

/**
 * Where an app keeps its global styles when its entry doesn't say: Vite's and Create React App's `src/index.css`, the
 * usual alternatives, and Next's `globals.css`, which its layout imports with no HTML entry.
 */
export const conventionalStylesheets = [
  "src/index.css",
  "src/styles.css",
  "src/app.css",
  "src/globals.css",
  "src/app/globals.css",
  "app/globals.css",
  "styles/globals.css"
]

/**
 * The app's global stylesheets, by one set of rules that detection and app libraries share: what the app entry imports
 * (index.html, its module script, that module's stylesheet imports, side-effect or default); else the conventional
 * places that exist. How they were found goes in `notes`.
 */
export async function findStyles(root: string, notes: string[] = []): Promise<AppStyles> {
  // Follow the app entry: index.html → module script → its stylesheet imports.
  const entry = await htmlEntry(root)

  if (entry) {
    const entryPath = join(root, entry.replace(/^\//, ""))
    const specifiers = stylesheetImports((await readText(entryPath)) ?? "")
    // A path is the project's own stylesheet; a bare specifier is a package's, as `@mantine/core/styles.css` is.
    const local = (specifier: string) => specifier.startsWith(".") || specifier.startsWith("/")

    const imports = specifiers
      .filter(local)
      .map((specifier) =>
        toPosix(specifier.startsWith("/") ? specifier.slice(1) : relative(root, join(dirname(entryPath), specifier)))
      )

    const packageStyles = specifiers.filter((specifier) => !local(specifier))

    if (specifiers.length > 0) {
      notes.push(`styles from ${toPosix(entry)}: ${[...packageStyles, ...imports].join(", ")}`)

      return { styles: imports, packageStyles }
    }
  }

  const conventional = conventionalStylesheets.filter((path) => existsSync(join(root, path)))

  if (conventional.length > 0) {
    notes.push(`styles from the conventional place: ${conventional.join(", ")}`)

    return { styles: conventional, packageStyles: [] }
  }

  notes.push("no global styles found")

  return { styles: [], packageStyles: [] }
}

/** The module script `index.html` loads, as it writes it (`/src/main.tsx`), when there is one. */
export async function htmlEntry(root: string): Promise<string | undefined> {
  const html = await readText(join(root, "index.html"))

  return (html && /<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/i.exec(html)?.[1]) || undefined
}

/** A module's imports by their specifiers, side-effect or default. */
const moduleImports = /\bimport\s+(?:[\w$*{}\s,]+?\s+from\s+)?["']([^"'?]+)["']/g

/** A CSS module, as `card.module.css` or `card.module.scss`, by core's one list of stylesheet extensions. */
const cssModule = new RegExp(String.raw`\.module\.(?:${stylesheetExtensions.join("|")})$`)

/**
 * The global stylesheets a module imports, in order: `import "./a.css"` and `import styles from "./a.css"`, plain CSS
 * or any stylesheet a build tool compiles (`isStylesheetFile`). CSS modules (`.module.css`) are scoped to the
 * component that imports them, so they aren't global styles.
 */
export function stylesheetImports(source: string): string[] {
  return source
    .matchAll(moduleImports)
    .map((match) => match[1]!)
    .filter((specifier) => isStylesheetFile(specifier) && !cssModule.test(specifier))
    .toArray()
}

/** A stylesheet's relative `@import`s, `@import "./theme.css";` or `@import url("../a.css") layer(base);`. */
const relativeImports = /@import\s+(?:url\()?["'](\.{1,2}\/[^"']+)["']\)?[^;]*;/g

/**
 * A stylesheet's text with its relative `@import`s inlined, recursively and each file once, so tokens a Tailwind entry
 * keeps in a theme file it imports are read with it. Imports of packages stay as they are. A missing file reads as
 * empty.
 */
export async function readStylesheet(path: string, seen = new Set<string>()): Promise<string> {
  if (seen.has(path)) {
    return ""
  }

  seen.add(path)
  const source = (await readText(path)) ?? ""
  const parts: string[] = []
  let last = 0

  for (const match of source.matchAll(relativeImports)) {
    if (!isStylesheetFile(match[1]!)) {
      continue
    }

    parts.push(source.slice(last, match.index), await readStylesheet(join(dirname(path), match[1]!), seen))
    last = match.index + match[0].length
  }

  parts.push(source.slice(last))

  return parts.join("")
}

async function readText(path: string): Promise<string | undefined> {
  return readFile(path, "utf8").catch(() => undefined)
}

function toPosix(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "")
}
