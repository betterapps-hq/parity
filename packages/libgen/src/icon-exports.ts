import ts from "typescript"

/**
 * The names an icon set's types say to insert where an icon is exported under several: one not marked deprecated over
 * one that is (Phosphor's `GearIcon` over `Gear`), then the name its declaration has over the aliases it's also
 * exported as (Lucide's `TriangleAlert` over `AlertTriangle`), then the shortest. Only the names that differ from the
 * shortest, which is what's inserted otherwise, are returned. Each group is one icon's names; `usable` says which names
 * the set's pattern allows.
 */
export function preferredExports(
  typesFile: string,
  groups: readonly (readonly string[])[],
  usable: (name: string) => boolean
): string[] {
  const program = ts.createProgram([typesFile], { noEmit: true, skipLibCheck: true, types: [] })
  const checker = program.getTypeChecker()
  const source = program.getSourceFile(typesFile)
  const module = source && checker.getSymbolAtLocation(source)
  if (!module) return []
  const marks = new Map<string, { deprecated: boolean; declared: boolean }>()
  for (const symbol of checker.getExportsOfModule(module)) {
    const alias = (symbol.flags & ts.SymbolFlags.Alias) !== 0
    const target = alias ? checker.getAliasedSymbol(symbol) : symbol
    const tags = [...symbol.getJsDocTags(checker), ...(alias ? target.getJsDocTags(checker) : [])]
    marks.set(symbol.name, {
      deprecated: tags.some((tag) => tag.name === "deprecated"),
      declared: target.name === symbol.name
    })
  }
  const shortest = (a: string, b: string) => a.length - b.length || byCodeUnit(a, b)
  const preferred: string[] = []
  for (const group of groups) {
    const names = group.filter(usable)
    const fallback = [...names].sort(shortest)[0]
    const rank = (name: string) => {
      const mark = marks.get(name)
      return (mark?.deprecated ? 2 : 0) + (mark?.declared === false ? 1 : 0)
    }
    const best = [...names].sort((a, b) => rank(a) - rank(b) || shortest(a, b))[0]
    if (best && best !== fallback) preferred.push(best)
  }
  return preferred.sort()
}

/** The types file a specifier resolves to from a folder, as a bundler would resolve it. */
export function typesFor(specifier: string, from: string): string | undefined {
  const resolved = ts.resolveModuleName(
    specifier,
    `${from}/index.ts`,
    { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler },
    ts.sys
  ).resolvedModule?.resolvedFileName
  return resolved && /\.d\.[cm]?ts$/.test(resolved) ? resolved : undefined
}

/** Compares two strings by their UTF-16 code units, as `sort` does without a comparer. */
function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1
  return a > b ? 1 : 0
}
