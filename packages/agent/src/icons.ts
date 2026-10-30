import { iconStyleModules } from "@parity-app/core"
import { iconEntries, iconIndex, iconStyles, searchIcons } from "@parity-app/icons"
import type { IconNames, IconSet } from "./types.ts"

/** An icon set as `Icons()` describes it to agents. */
export interface IconSetSummary {
  id: string
  name: string
  package: string
  version?: string
  /** How many icons it had when its `.lib.par` was made. */
  count?: number
  /** The styles it comes in, such as Regular and Filled, and the one used when none is asked for. */
  styles: string[]
  style?: string
  /** How a `component` node names one of its icons. */
  component: string
}

/** One icon, as a `component` node inserts it. */
export interface IconMatch {
  /** Its name without a style or size. */
  label: string
  component: string
  /** The props that pick its style, for sets that take the style as a prop. */
  props?: Record<string, string>
}

export interface IconOptions {
  /** Finds icons by name, alias and the tags the set publishes, best first. */
  search?: string
  /** One of the set's styles; the set's default otherwise. */
  style?: string
  /** At most this many icons; 50 unless set. */
  limit?: number
}

/** The project's icon sets, with how a design names their icons. */
export function describeIconSets(sets: readonly IconSet[]): IconSetSummary[] {
  return sets.map((set) => {
    const { styles, initial } = iconStyles(set.icons)
    return {
      id: set.id,
      name: set.name,
      package: set.package,
      ...(set.version ? { version: set.version } : {}),
      ...(set.icons?.count ? { count: set.icons.count } : {}),
      styles,
      ...(initial ? { style: initial } : {}),
      // A style kept in a module of its own adds the module, as `findIcons` returns it.
      component: `${set.id}/<Icon>`
    }
  })
}

/** The module key a style's icons are imported from, for sets that keep each style in a module of its own. */
export function styleModule(set: IconSet, style: string | undefined): string | undefined {
  return iconStyleModules(set.icons, set.package).find((module) => module.style === style)?.key
}

/** Checks a style against the set's, and settles on the set's default when none is given. */
export function iconStyle(set: IconSet, style: string | undefined): string | undefined {
  const { styles, initial } = iconStyles(set.icons)
  if (style === undefined) return initial
  if (!styles.includes(style)) {
    throw new Error(
      styles.length > 0
        ? `${set.name} comes in ${styles.join(", ")}, not "${style}"`
        : `${set.name} has one style; leave out style`
    )
  }
  return style
}

/** A set's icons in one style, found by a search or in the order the set exports them, as nodes insert them. */
export function findIcons(
  set: IconSet,
  { names, aliases = {}, tags }: IconNames,
  style: string | undefined,
  options: IconOptions = {}
): IconMatch[] {
  const entries = iconEntries(names, set.icons, style, aliases)
  const found = options.search?.trim() ? searchIcons(iconIndex(entries, aliases, tags), options.search) : entries
  const key = styleModule(set, style)
  const prefix = key ? `${set.id}/${key}/` : `${set.id}/`
  return found.slice(0, Math.max(0, options.limit ?? 50)).map((icon) => ({
    label: icon.label,
    component: `${prefix}${icon.insert ?? icon.name}`,
    ...(icon.props ? { props: icon.props } : {})
  }))
}
