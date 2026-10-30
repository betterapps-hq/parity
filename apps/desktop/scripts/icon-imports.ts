import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import ts from "typescript"
import type { Plugin } from "vite"

/** Where one of lucide-react's exports is defined: its file under the package, and the name it has there. */
export interface IconExport {
  file: string
  name: string
}

/** One `export { a as B, ... } from "./file.mjs"` line of lucide-react's index. */
const reexport = /export\s*\{([^}]*)\}\s*from\s*["']\.\/([^"']+)["']/g

/**
 * Every export of lucide-react's ES module index, by name: `Plus`, `PlusIcon` and `LucidePlus` all come from
 * `icons/plus.mjs`'s default export, and `Icon` from `Icon.mjs`'s.
 */
export function iconExports(index: string): Map<string, IconExport> {
  const exports = new Map<string, IconExport>()
  for (const [, list, file] of index.matchAll(reexport)) {
    for (const specifier of list!.split(",")) {
      const [name, as = name] = specifier.trim().split(/\s+as\s+/)
      if (name && as) exports.set(as, { file: file!, name })
    }
  }
  return exports
}

/**
 * Imports each of lucide-react's exports a module names from the file that defines it, rather than from the package's
 * index, which imports every icon. A name the index doesn't have stays imported from the package, so it fails as it
 * would have. Types are left out, since nothing imports them at run time. Only the module's import declarations are
 * read, as TypeScript parses them, so import-like text in a string or comment stays as it is. Returns undefined when
 * nothing changes.
 */
export function iconImports(
  code: string,
  exports: Map<string, IconExport>,
  dist: string,
  file = "module.tsx"
): string | undefined {
  if (!code.includes("lucide-react")) return undefined
  // A `.ts` file may cast with `<T>`, which TSX would read as JSX; anything else may hold JSX.
  const kind = /\.[cm]?ts$/.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.TSX
  const parsed = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, kind)
  let next = code
  // From the end, so each statement's position still holds once the ones after it have changed.
  for (const statement of [...parsed.statements].reverse()) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    if (statement.moduleSpecifier.text !== "lucide-react") continue
    const clause = statement.importClause
    if (clause?.isTypeOnly || !clause?.namedBindings || !ts.isNamedImports(clause.namedBindings) || clause.name)
      continue
    const unknown: string[] = []
    const lines: string[] = []
    for (const specifier of clause.namedBindings.elements) {
      if (specifier.isTypeOnly) continue
      const name = (specifier.propertyName ?? specifier.name).text
      const local = specifier.name.text
      const found = exports.get(name)
      if (!found) unknown.push(specifier.getText(parsed))
      else lines.push(`import { ${found.name} as ${local} } from "${dist}/${found.file}";`)
    }
    if (unknown.length > 0) lines.push(`import { ${unknown.join(", ")} } from "lucide-react";`)
    const from = statement.getStart(parsed)
    const original = code.slice(from, statement.end)
    // In as many lines as the import took, so the lines below keep their numbers and the module's source map holds.
    next =
      next.slice(0, from) + lines.join(" ") + "\n".repeat(original.split("\n").length - 1) + next.slice(statement.end)
  }
  return next === code ? undefined : next
}

/**
 * Serves each lucide icon Parity's UI uses on its own. Vite prebundles a dependency whole, and lucide-react's index
 * imports all of its icons, so importing one from `lucide-react` loaded every one into the window. The package stays
 * out of Vite's prebundling, so the window fetches the few files each icon needs. Only the app's own code is rewritten:
 * a project's icons come from its own builder.
 */
export function iconImportsPlugin(): Plugin {
  const require = createRequire(import.meta.url)
  const root = dirname(require.resolve("lucide-react/package.json"))
  const exports = iconExports(readFileSync(join(root, "dist/esm/lucide-react.mjs"), "utf8"))
  return {
    name: "parity:icon-imports",
    apply: "serve",
    // Before TypeScript's types are erased, so `type` names are dropped here rather than leaving an empty import.
    enforce: "pre",
    config: () => ({ optimizeDeps: { exclude: ["lucide-react"] } }),
    transform(code, id) {
      if (id.includes("/node_modules/") || !/\.[cm]?[jt]sx?(\?|$)/.test(id)) return undefined
      const next = iconImports(code, exports, "lucide-react/dist/esm", id.split("?")[0])
      return next === undefined ? undefined : { code: next, map: null }
    }
  }
}
