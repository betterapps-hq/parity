/** What a copy or a picture is of. With its trace, it says whether a kept one is current. */
export interface CopyKey {
  /** The path with sample params, from `routePageUrl`. */
  route: string
  /** The resolved mode's id. */
  mode: string
  /** The board's state id. */
  state: string
}

/** A copy key as one string, for maps and sets: its route, mode and state, which none of them can hold a newline of. */
export function copyId({ route, mode, state }: CopyKey): string {
  return `${route}\n${mode}\n${state}`
}

/** A copy and the files its trace holds, relative to the project's root, or `"all"` when its builder couldn't say. */
export interface TracedCopy {
  key: CopyKey
  files: readonly string[] | "all"
}

/** How near the view each copy's board is, by `copyId`, and the live board's route, whose copies come first. */
export interface ViewOrder {
  live?: string
  /** Distance from the middle of the view; a copy missing here comes after every one that has one. */
  distance: ReadonlyMap<string, number>
}

/** The copies and pictures whose traces hold a changed file, nearest the view first. */
export function staleCopies(changed: readonly string[], copies: readonly TracedCopy[], view: ViewOrder): CopyKey[] {
  if (changed.length === 0) {
    return []
  }

  const files = new Set(changed)
  const stale = copies.filter((copy) => copy.files === "all" || copy.files.some((file) => files.has(file)))
  const rank = (key: CopyKey) => [key.route === view.live ? 0 : 1, view.distance.get(copyId(key)) ?? Infinity] as const

  return stale
    .map(({ key }) => key)
    .toSorted((a, b) => {
      const [liveA, nearA] = rank(a)
      const [liveB, nearB] = rank(b)

      if (liveA !== liveB) {
        return liveA - liveB
      }

      return nearA === nearB ? 0 : Math.sign(nearA - nearB)
    })
}

/** A route's modes, each with the hash of the markup it drew at the last freeze, by route. */
export type MarkupGroups = ReadonlyMap<string, ReadonlyMap<string, string>>

/**
 * The modes a new snapshot of a route updates: its own, and the ones in its markup group, which drew the same markup at
 * the last freeze. Its own comes first.
 */
export function sharedMarkup(route: string, mode: string, groups: MarkupGroups): string[] {
  const modes = groups.get(route)
  const markup = modes?.get(mode)

  if (!modes || markup === undefined) {
    return [mode]
  }

  return [mode, ...[...modes].flatMap(([other, hash]) => (other !== mode && hash === markup ? [other] : []))]
}
