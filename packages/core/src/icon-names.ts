import type { LibraryIcons } from "./library.ts"

/** One export of a set that writes styles and sizes into names, as the icon it draws. */
export interface IconVariant {
  /** The icon's name without a style or size: `Add` for `Add24Regular`, `Battery10` for `Battery10Regular`. */
  label: string
  /** The size the export is fixed at, when it is. */
  size?: number
  style?: string
  /**
   * Whether a picker lists it: an icon's unsized export, or for an icon the set only ships at fixed sizes, the one
   * nearest the set's default size.
   */
  listed: boolean
}

interface Reading {
  label: string
  size?: number
  style?: string
  /** An icon the set ships only at fixed sizes. */
  fixed?: boolean
}

/** An export's name in the parts its set's pattern reads: the name, any digits before the style, and the style. */
interface Parsed {
  name: string
  base: string
  digits: string
  style?: string
}

/** A style an icon set keeps in a module of its own, as Heroicons keeps its solid icons. */
export interface IconStyleModule {
  style: string
  /** The module, as the set's manifest names it: `@heroicons/react/16/solid`. */
  import: string
  /** What its icons' ids call it, between the set and the icon: its path in the package, `16/solid`. */
  key: string
}

/**
 * The styles a set keeps in modules of their own, besides its default style: that one is drawn from the set's own
 * module, and its icons' ids name no module, as in `heroicons/CogIcon` beside `heroicons/16/solid/CogIcon`.
 */
export function iconStyleModules(icons: LibraryIcons | undefined, packageName: string): IconStyleModule[] {
  const variants = icons?.variants
  return Object.entries(variants?.modules ?? {}).flatMap(([style, specifier]) =>
    style === variants?.default?.style || specifier === (icons?.import ?? packageName)
      ? []
      : [
          {
            style,
            import: specifier,
            key: specifier.startsWith(`${packageName}/`) ? specifier.slice(packageName.length + 1) : specifier
          }
        ]
  )
}

/**
 * Each export's icon, size and style, for a set whose names carry them (Fluent's `Add24Regular`). Digits before the
 * style are a size only when they're one of the set's sizes and the name before them is an icon the set exports
 * without a size (`CalendarDay` for `CalendarDay32Color`); otherwise they're part of the name, as in `Battery10` and
 * `TextHeader1`. An icon the set ships only at fixed sizes (`CodeCs16Regular`), whose name no other export has at a
 * size, reads as that icon at that size. Exports the pattern doesn't match are left out.
 */
export function iconVariants(
  names: readonly string[],
  variants: NonNullable<LibraryIcons["variants"]>
): Map<string, IconVariant> {
  const pattern = variants.pattern ? new RegExp(variants.pattern) : undefined
  const sizes = new Set(variants.sizes ?? [])
  const parsed = names.flatMap((name): Parsed[] => {
    if (!pattern) return [{ name, base: name, digits: "" }]
    const groups = pattern.exec(name)?.groups
    if (!groups) return []
    return [
      { name, base: groups.name ?? name, digits: groups.size ?? "", ...(groups.style ? { style: groups.style } : {}) }
    ]
  })
  // Every name as written without a size, digits and all.
  const bare = new Set(parsed.map(({ base, digits }) => base + digits))
  // The ways digits split into the rest of a name and a size the set has, longest size first; `020` isn't a size. A
  // set that doesn't list its sizes takes any number.
  const splits = ({ base, digits }: Parsed) =>
    digits.split("").flatMap((_, at) => {
      const size = digits.slice(at)
      return String(Number(size)) === size && (sizes.size === 0 || sizes.has(Number(size)))
        ? [{ label: base + digits.slice(0, at), size: Number(size) }]
        : []
    })
  const read = new Map<string, Reading>()
  for (const entry of parsed) {
    const copy = entry.digits ? splits(entry).find((split) => bare.has(split.label)) : undefined
    read.set(entry.name, { ...(copy ?? { label: entry.base + entry.digits }), style: entry.style })
  }
  // A name with digits that no export has at a size, and that ends in a size, is an icon shipped only at fixed sizes.
  const sized = new Set([...read.values()].flatMap((reading) => (reading.size === undefined ? [] : [reading.label])))
  for (const entry of parsed) {
    const reading = read.get(entry.name)!
    if (!entry.digits || reading.size !== undefined || sized.has(reading.label)) continue
    const fixed = splits(entry)[0]
    if (fixed) read.set(entry.name, { ...fixed, style: entry.style, fixed: true })
  }
  // Each of those is listed once per style, at the size nearest the set's default, the larger of two as near.
  const preferred = variants.default?.size ?? 20
  const distance = (size: number) => Math.abs(size - preferred) - (size > preferred ? 0.5 : 0)
  const nearest = new Map<string, string>()
  for (const [name, reading] of read) {
    if (!reading.fixed) continue
    const key = `${reading.label}\u0000${reading.style ?? ""}`
    const current = nearest.get(key)
    if (!current || distance(reading.size!) < distance(read.get(current)!.size!)) nearest.set(key, name)
  }
  const listed = new Set(nearest.values())
  const result = new Map<string, IconVariant>()
  for (const [name, { label, size, style }] of read) {
    result.set(name, {
      label,
      ...(size === undefined ? {} : { size }),
      ...(style === undefined ? {} : { style }),
      listed: size === undefined || listed.has(name)
    })
  }
  return result
}
