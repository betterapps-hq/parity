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

async function readText(path: string): Promise<string | undefined> {
  return readFile(path, "utf8").catch(() => undefined)
}
