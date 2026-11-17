import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { isStylesheetFile } from "./code-changes.ts"

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

/**
 * The stylesheet at `path` and every one it imports by a relative path, recursively and each once, with their text: the
 * files `readStylesheet` reads, so a package's import can be changed in whichever of them holds it. Missing files are
 * left out.
 */
export async function stylesheetsFrom(
  path: string,
  seen = new Set<string>()
): Promise<{ path: string; source: string }[]> {
  if (seen.has(path)) {
    return []
  }

  seen.add(path)
  const source = await readText(path)

  if (source === undefined) {
    return []
  }

  const imported = [...source.matchAll(relativeImports)].flatMap((match) =>
    match[1] && isStylesheetFile(match[1]) ? [match[1]] : []
  )

  const nested: { path: string; source: string }[] = []

  for (const specifier of imported) {
    nested.push(...(await stylesheetsFrom(join(dirname(path), specifier), seen)))
  }

  return [{ path, source }, ...nested]
}

async function readText(path: string): Promise<string | undefined> {
  return readFile(path, "utf8").catch(() => undefined)
}
