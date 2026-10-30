import { iconVariants, type LibraryIcons } from "@parity-app/core"

/** One icon as a picker lists it: its name, the export it inserts, and the props that pick its style. */
export interface IconEntry {
  /** Its name without a style or size, as in `Add` for Fluent's `AddRegular`. */
  label: string
  /** The export it's listed by: the shortest of its names. */
  name: string
  /** The export it's drawn and inserted as, when the set prefers another of its names (Phosphor's `GearIcon`). */
  insert?: string
  props?: Record<string, string>
}

/**
 * The export to insert for an icon exported under several names, and what to call it, when the set's types prefer a
 * name other than the one it's listed by: shown without an `Icon` at its start or end where that's one of its names
 * too, so Phosphor's `GearIcon` inserts as itself and shows as `Gear`.
 */
export function preferredExport(
  name: string,
  aliases: readonly string[],
  prefer: ReadonlySet<string>
): { insert: string; label: string } | undefined {
  const insert = [name, ...aliases].find((candidate) => prefer.has(candidate))
  if (!insert || insert === name) return undefined
  const names = new Set([name, ...aliases])
  const bare = [insert.replace(/Icon$/, ""), insert.replace(/^Icon/, "")].find(
    (candidate) => candidate !== insert && names.has(candidate)
  )
  return { insert, label: bare ?? insert }
}

/** The styles a set offers, such as Regular and Filled, with the one shown first. */
export function iconStyles(icons: LibraryIcons | undefined): { styles: string[]; initial?: string } {
  const variants = icons?.variants
  const styles = variants?.styles ?? []
  return { styles, ...(variants?.default?.style ? { initial: variants.default.style } : {}) }
}

/**
 * A set's icons in one style, from the names its package exports, as its manifest describes them. Sets that write the
 * style and size into names (Fluent's `Add24Regular`) list each icon once, unsized, in that style; sets that take the
 * style as a prop (Phosphor's `weight`) insert with it set.
 */
export function iconEntries(
  names: readonly string[],
  icons: LibraryIcons | undefined,
  style: string | undefined,
  aliases: Readonly<Record<string, readonly string[]>> = {}
): IconEntry[] {
  const variants = icons?.variants
  const fallback = variants?.default?.style
  const props = variants?.prop && style && style !== fallback ? { [variants.prop]: style } : undefined
  if (!variants?.pattern) {
    const prefer = new Set(icons?.prefer)
    return names.map((name) => {
      const preferred = preferredExport(name, aliases[name] ?? [], prefer)
      return {
        label: preferred?.label ?? name,
        name,
        ...(preferred ? { insert: preferred.insert } : {}),
        ...(props ? { props } : {})
      }
    })
  }
  const read = iconVariants(names, variants)
  const entries: IconEntry[] = []
  for (const name of names) {
    const variant = read.get(name)
    if (!variant?.listed || (variant.style ?? fallback) !== (style ?? fallback)) continue
    entries.push({ label: variant.label, name, ...(props ? { props } : {}) })
  }
  return entries
}
