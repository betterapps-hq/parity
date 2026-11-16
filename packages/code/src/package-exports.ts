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
    const target = hasFlag(exported.flags, ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(exported) : exported

    // A re-export from a package that can't be resolved aliases TypeScript's unknown symbol, a value, so it's kept.
    if (hasFlag(target.flags, ts.SymbolFlags.Value)) {
      names.add(exported.name)
    }
  }

  return names
}
