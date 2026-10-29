import type { LibraryIcons } from "@parity/core"

/** One icon as a picker lists it: its name, the export it inserts, and the props that pick its style. */
export interface IconEntry {
  /** Its name without a style or size, as in `Add` for Fluent's `AddRegular`. */
  label: string
  /** The export it's drawn and inserted as. */
  name: string
  props?: Record<string, string>
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
  style: string | undefined
): IconEntry[] {
  const variants = icons?.variants
  const fallback = variants?.default?.style
  const pattern = variants?.pattern ? new RegExp(variants.pattern) : undefined
  const props = variants?.prop && style && style !== fallback ? { [variants.prop]: style } : undefined
  const entries: IconEntry[] = []
  for (const name of names) {
    let label = name
    if (pattern) {
      const groups = pattern.exec(name)?.groups
      if (!groups) continue
      if (groups.size) continue
      if ((groups.style ?? fallback) !== (style ?? fallback)) continue
      label = groups.name ?? name
    }
    entries.push({ label, name, ...(props ? { props } : {}) })
  }
  return entries
}
