// What Search actions (Ctrl+K) lists for what's typed (PAR-180): the actions, and the open project's designs, layers,
// components and tokens, with what was picked lately first. The app gathers the items and runs the one picked; this
// matches, ranks, caps and groups them.

/**
 * How Search actions matches what's typed (PAR-546): by the start of words, not letters scattered through a name, so
 * "new" finds New screen and New component and not Interact with previews. Each typed word must start a word of
 * `value`, in any order; a name that starts with everything typed ranks first. Returns the rank, 0 for no match.
 */
export function matchWords(value: string, search: string): number {
  const typed = search.trim().toLowerCase()

  if (!typed) {
    return 1
  }

  const text = value.toLowerCase()

  if (text.startsWith(typed)) {
    return 1
  }

  const words = text.split(/[\s/._-]+/)

  return typed.split(/\s+/).every((part) => words.some((word) => word.startsWith(part))) ? 0.5 : 0
}

/** One thing the search can find. */
export interface FindItem<G extends string = string> {
  /** Unique across every kind, and the same each time it's listed, so a recent pick is found again. */
  id: string
  /** The heading it's listed under. */
  group: G
  label: string
  /** Matched after the label: an action's group, a layer's design, a token's set. */
  keywords?: string
  /** Kept out of the list until something's typed, as layers and tokens are, being too many to list. */
  searchOnly?: boolean
}

export interface FoundGroup<T extends FindItem> {
  group: T["group"] | "Recent"
  items: T[]
}

export interface FindOptions<G extends string> {
  /** The ids of what was picked lately, latest first. */
  recent: readonly string[]
  /** The order of the headings after Recent. */
  groups: readonly G[]
  /** At most this many of a group while searching, best first; the rest of it is left out. */
  limits?: Partial<Record<G, number>>
}

/**
 * The groups to list for `search`. Recent picks still there lead, latest first, and aren't listed again below. With
 * nothing typed, every group but the search-only items is listed in the items' own order. Searching, each group lists
 * its matches best first, a name starting with what's typed before one with a word starting it, keeping the items'
 * order among equals, up to its limit; a group with no match is left out.
 */
export function findAnything<T extends FindItem>(
  items: readonly T[],
  search: string,
  { recent, groups, limits = {} }: FindOptions<T["group"]>
): FoundGroup<T>[] {
  const searching = search.trim() !== ""
  const byId = new Map(items.map((item) => [item.id, item]))
  const rank = (item: T) => (searching ? matchWords(`${item.label} ${item.keywords ?? ""}`, search) : 1)

  const recentItems = [...new Set(recent)]
    .map((id) => byId.get(id))
    .filter((item): item is T => !!item && rank(item) > 0)

  const shownRecently = new Set(recentItems.map((item) => item.id))
  const found: FoundGroup<T>[] = recentItems.length > 0 ? [{ group: "Recent", items: recentItems }] : []

  for (const group of groups) {
    const ranked = items
      .filter((item) => item.group === group && !shownRecently.has(item.id) && (searching || !item.searchOnly))
      .map((item, index) => ({ item, index, rank: rank(item) }))
      .filter((entry) => entry.rank > 0)

    if (searching) {
      ranked.sort((a, b) => b.rank - a.rank || a.index - b.index)
    }

    const limit = searching ? limits[group] : undefined
    const kept = ranked.slice(0, limit).map((entry) => entry.item)

    if (kept.length > 0) {
      found.push({ group, items: kept })
    }
  }

  return found
}

/** The recent picks after picking `id`: it first, without its earlier place, and at most `max` of them. */
export function rememberPick(recent: readonly string[], id: string, max = 6): string[] {
  return [id, ...recent.filter((other) => other !== id)].slice(0, max)
}
