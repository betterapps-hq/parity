import ts from "typescript"
import { componentOptions } from "./checker.ts"
import { hasFlag } from "./flags.ts"

/**
 * The value names a package's entry exports, as TypeScript resolves them: declarations however they're written,
 * `export *`, named, default and namespace re-exports, from the package's own files or another package's. Type-only
 * exports are left out. Unlike `findComponents`, it doesn't ask what each one is, so a component made with a factory,
 * as Mantine's are, still counts as exported.
 */
export function packageExports(entry: string): Set<string> {
  const program = ts.createProgram({ rootNames: [entry], options: componentOptions({ noResolve: false }) })
  const checker = program.getTypeChecker()
  const file = program.getSourceFile(entry)
  const moduleSymbol = file && checker.getSymbolAtLocation(file)

  if (!moduleSymbol) {
    return new Set()
  }

  const names = new Set<string>()

  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    if (exportsValue(checker, exported)) {
      names.add(exported.name)
    }
  }

  return names
}

/**
 * Whether an export is a value at run time: it ends at one, and no step on the way, `export type { Card } from` in a
 * file the entry re-exports say, keeps only the type. A re-export from a package that can't be resolved ends at
 * TypeScript's unknown symbol, a value, so it's kept.
 */
function exportsValue(checker: ts.TypeChecker, exported: ts.Symbol): boolean {
  const seen = new Set<ts.Symbol>()
  let symbol: ts.Symbol | undefined = exported

  while (symbol && hasFlag(symbol.flags, ts.SymbolFlags.Alias) && !seen.has(symbol)) {
    if (symbol.declarations?.some(typeOnly)) {
      return false
    }

    seen.add(symbol)
    symbol = checker.getImmediateAliasedSymbol(symbol)
  }

  const target = hasFlag(exported.flags, ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(exported) : exported

  return hasFlag(target.flags, ts.SymbolFlags.Value)
}

/**
 * An alias declared type-only: `export type { A }`, `export { type A }`, `export type * as A`, or an import declared so
 * that's exported again. A specifier's statement is two levels up, through its list.
 */
function typeOnly(declaration: ts.Node): boolean {
  if (ts.isExportSpecifier(declaration) || ts.isImportSpecifier(declaration)) {
    return declaration.isTypeOnly || typeOnly(declaration.parent.parent)
  }

  if (ts.isNamespaceExport(declaration) || ts.isNamespaceImport(declaration)) {
    return typeOnly(declaration.parent)
  }

  return (ts.isExportDeclaration(declaration) || ts.isImportClause(declaration)) && declaration.isTypeOnly
}
