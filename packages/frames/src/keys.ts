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

/**
 * Where a file counts for a copy beside the ones its trace lists, so one added there makes it stale: any under one of
 * `prefixes`, and any directly in one of `folders`. A router that names routes by folder, as Next's, draws a route
 * from files there that no import reaches, such as a layout, template or loading file added around it.
 */
export interface TraceFolders {
  prefixes: readonly string[]
  folders: readonly string[]
}

/**
 * What a copy was made from: its files, relative to the project's root, or `"all"` when its builder couldn't say, and
 * the folders where a new file counts too.
 */
export interface CopyTrace {
  files: readonly string[] | "all"
  folders?: TraceFolders
}

/** A copy and its trace. */
export interface TracedCopy extends CopyTrace {
  key: CopyKey
}

/** Whether a changed file counts for a trace: it's listed, the trace is the whole project's, or it's in its folders. */
export function traceHolds(trace: CopyTrace, file: string): boolean {
  if (trace.files === "all" || trace.files.includes(file)) {
    return true
  }

  const { folders } = trace

  if (!folders) {
    return false
  }

  const slash = file.lastIndexOf("/")
  const folder = slash === -1 ? "" : file.slice(0, slash)

  return folders.folders.includes(folder) || folders.prefixes.some((prefix) => file.startsWith(prefix))
}

/** How near the view each copy's board is, by `copyId`, and the live board's route, whose copies come first. */
export interface ViewOrder {
  live?: string
  /** Distance from the middle of the view; a copy missing here comes after every one that has one. */
  distance: ReadonlyMap<string, number>
}

/** The copies and pictures whose traces hold a changed file (`traceHolds`), nearest the view first. */
export function staleCopies(changed: readonly string[], copies: readonly TracedCopy[], view: ViewOrder): CopyKey[] {
  if (changed.length === 0) {
    return []
  }

  const stale = copies.filter((copy) => changed.some((file) => traceHolds(copy, file)))
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

/**
 * The modes to snapshot first when a route is frozen again: one from each markup group, whose snapshot updates the rest
 * of its group (`sharedMarkup`), and each mode with no markup known yet, which is its own group. In `modes`' order.
 */
export function groupLeaders(route: string, modes: readonly string[], groups: MarkupGroups): string[] {
  const covered = new Set<string>()
  const leaders: string[] = []

  for (const mode of modes) {
    if (covered.has(mode)) {
      continue
    }

    leaders.push(mode)

    for (const shared of sharedMarkup(route, mode, groups)) {
      covered.add(shared)
    }
  }

  return leaders
}

/** The groups once a route's snapshot in `mode` drew `markup`, which moves the mode into that markup's group. */
export function withMarkup(groups: MarkupGroups, route: string, mode: string, markup: string): MarkupGroups {
  if (groups.get(route)?.get(mode) === markup) {
    return groups
  }

  return new Map(groups).set(route, new Map(groups.get(route)).set(mode, markup))
}
