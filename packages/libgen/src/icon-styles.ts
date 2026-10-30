/** Draws an icon component with no props, as markup, or nothing where it can't be drawn. */
export type DrawIcon = (component: unknown) => string | undefined

/** How many of a set's icons are drawn from each module to tell its styles apart. */
const sampled = 5

/**
 * The styles of a set that keeps each in a module of its own, as Heroicons keeps `@heroicons/react/16/solid` beside
 * `24/outline`, by name, with the module each is imported from: the package's other entry points that export most of
 * the same icons, and draw them differently. One that draws them the same (Phosphor's `ssr`, Lucide's `icons`) is
 * another way in, not a style; one that doesn't load (Fluent's `fonts`) or exports few of them isn't one either.
 * Styles are named by their path in the package, so `16/solid` is `16 Solid`, and listed in the package's order. A set
 * with no such modules has none.
 */
export async function styleModules(
  packageName: string,
  /** The paths its `exports` field lists, as `./16/solid`. */
  entries: readonly string[],
  /** The module its icons are imported from by default. */
  main: string,
  load: (specifier: string) => Promise<Record<string, unknown>>,
  draw: DrawIcon
): Promise<Record<string, string> | undefined> {
  const icons = (module: Record<string, unknown>) =>
    Object.keys(module).filter((name) => /^[A-Z]/.test(name) && isComponent(module[name]))
  const base = await load(main).catch(() => undefined)
  if (!base) return undefined
  const names = icons(base).sort()
  const sample = names.slice(0, sampled)
  const drawn = new Map(sample.map((name) => [name, draw(base[name])]))
  const found: { specifier: string; module: Record<string, unknown> }[] = []
  for (const entry of entries) {
    if (entry === "." || entry.includes("*") || /\.[a-z]+$/i.test(entry)) continue
    const specifier = packageName + entry.slice(1)
    if (specifier === main) {
      found.push({ specifier, module: base })
      continue
    }
    const module = await load(specifier).catch(() => undefined)
    if (!module) continue
    const own = new Set(icons(module))
    const shared = sample.filter((name) => own.has(name))
    if (own.size === 0 || names.filter((name) => own.has(name)).length * 2 < names.length || shared.length === 0) {
      continue
    }
    // The same icons as a module already found, under another path, or drawn just as the default module draws them.
    if (found.some((other) => shared.every((name) => other.module[name] === module[name]))) continue
    if (shared.some((name) => draw(module[name]) === drawn.get(name))) continue
    found.push({ specifier, module })
  }
  // A default module that isn't one of the listed paths, such as the package itself, comes first.
  if (!found.some((style) => style.module === base)) found.unshift({ specifier: main, module: base })
  if (found.length < 2) return undefined
  return Object.fromEntries(
    found.map(({ specifier }) => [
      specifier.startsWith(`${packageName}/`) ? styleName(specifier.slice(packageName.length + 1)) : "Default",
      specifier
    ])
  )
}

/** A style's name from its module's path in the package: `24/outline` is `24 Outline`. */
export function styleName(path: string): string {
  return path
    .split(/[/_-]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ")
}

function isComponent(value: unknown): boolean {
  return typeof value === "function" || (typeof value === "object" && value !== null && "$$typeof" in value)
}
