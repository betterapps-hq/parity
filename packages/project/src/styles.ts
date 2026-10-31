import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { parseJsonc } from "./jsonc.ts"

/** An app's global stylesheets: the project's own, by path from its root, and packages', by their specifiers. */
export interface AppStyles {
  styles: string[]
  /** Stylesheets the entry imports from packages, as `@mantine/core/styles.css`, which the project doesn't own. */
  packageStyles: string[]
}

/**
 * Where an app keeps its global styles when neither `components.json` nor the entry says: Vite's and Create React App's
 * `src/index.css`, the usual alternatives, and Next's `globals.css`, which its layout imports with no HTML entry.
 */
const conventionalStylesheets = [
  "src/index.css",
  "src/styles.css",
  "src/app.css",
  "src/globals.css",
  "src/app/globals.css",
  "app/globals.css",
  "styles/globals.css"
]

/**
 * The app's global stylesheets, by one set of rules that detection and app libraries share: the one shadcn's
 * `components.json` names; else what the app entry imports (index.html, its module script, that module's stylesheet
 * imports, side-effect or default); else the conventional places that exist. How they were found goes in `notes`.
 */
export async function findStyles(root: string, notes: string[] = []): Promise<AppStyles> {
  return stylesWith(root, await shadcnConfig(root, notes), notes)
}

/** `findStyles`, with `components.json` already read. */
export async function stylesWith(root: string, shadcn: unknown, notes: string[]): Promise<AppStyles> {
  const fromShadcn = field(shadcn, "tailwind", "css")
  if (typeof fromShadcn === "string" && fromShadcn) {
    notes.push(`styles from components.json: ${fromShadcn}`)
    return { styles: [toPosix(fromShadcn)], packageStyles: [] }
  }

  // Otherwise follow the app entry: index.html → module script → its stylesheet imports.
  const html = await readText(join(root, "index.html"))
  const entry = html && /<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/i.exec(html)?.[1]
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

/**
 * The global stylesheets a module imports, in order: `import "./a.css"` and `import styles from "./a.css"`, plain CSS
 * or Sass. CSS modules (`.module.css`) are scoped to the component that imports them, so they aren't global styles.
 */
export function stylesheetImports(source: string): string[] {
  return [...source.matchAll(/\bimport\s+(?:[\w$*{}\s,]+?\s+from\s+)?["']([^"'?]+\.s?css)["']/g)]
    .map((match) => match[1]!)
    .filter((specifier) => !/\.module\.s?css$/.test(specifier))
}

/**
 * A stylesheet's text with its relative `@import`s inlined, recursively and each file once, so tokens a Tailwind entry
 * keeps in a theme file it imports are read with it. Imports of packages stay as they are. A missing file reads as
 * empty.
 */
export async function readStylesheet(path: string, seen = new Set<string>()): Promise<string> {
  if (seen.has(path)) return ""
  seen.add(path)
  const source = (await readText(path)) ?? ""
  const parts: string[] = []
  let last = 0
  for (const match of source.matchAll(/@import\s+(?:url\()?["'](\.{1,2}\/[^"']+\.s?css)["']\)?[^;]*;/g)) {
    parts.push(source.slice(last, match.index), await readStylesheet(join(dirname(path), match[1]!), seen))
    last = match.index + match[0].length
  }
  parts.push(source.slice(last))
  return parts.join("")
}

/** shadcn's `components.json`, which it reads from the project's own folder only and which may have comments. */
export async function shadcnConfig(root: string, notes: string[]): Promise<unknown> {
  // Read directly rather than through `loadConfig`, whose config loader the CLI's bundle (through libgen) doesn't carry.
  const text = await readText(join(root, "components.json"))
  if (text === undefined) return undefined
  try {
    return parseJsonc(text)
  } catch (error) {
    notes.push(`Couldn't load components: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

export function field(value: unknown, ...keys: string[]): unknown {
  let current = value
  for (const key of keys) {
    if (typeof current !== "object" || current === null) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

async function readText(path: string): Promise<string | undefined> {
  return readFile(path, "utf8").catch(() => undefined)
}

function toPosix(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "")
}
