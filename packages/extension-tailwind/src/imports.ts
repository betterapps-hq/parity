/**
 * A stylesheet with a library's stylesheet imported right after Tailwind, so the library's own token defaults come first
 * and the project's tokens, declared later in the file, still win. First, when the stylesheet doesn't import Tailwind.
 */
export function withStylesImport(source: string, specifier: string): string {
  const lines = source.split("\n")
  const tailwind = lines.findIndex((text) => /^@import\s+["']tailwindcss["']/.test(text.trim()))
  lines.splice(tailwind + 1, 0, `@import "${specifier}";`)

  return lines.join("\n")
}
