import {
  applies,
  type ConnectorInfo,
  type Filter,
  type FilterValue,
  type FindKind,
  findKind,
  type Found,
  placeableKinds,
  type SearchRequest
} from "./connector.ts"

/*
 * The library browser's rules (PAR-839), for the window: which filters it draws for what's chosen, the request for a
 * search and for more of it, what a search finds and what to call it, and how a result is named. What differs between
 * libraries is keyed by what they find, never by which library it is, so a new connector of a known kind needs no
 * change in the window.
 */

/** A filter's values by the filter's id, as a search chooses them. */
export type Chosen = Readonly<Record<string, string>>

/** A search as the browser runs it. */
export interface Searched {
  query: string
  /** The value chosen for each filter shown, by its id. One left out is at its default, or any. */
  filters: Chosen
  /** In the connector's deep mode, for one that has one. */
  deep?: boolean
}

/** How many filters sit beside the search field. The rest go behind Filters, in the connector's order. */
export const filtersInView = 3

/** The id of the filter that makes a search slower and closer, which the browser offers as Search deeper. */
const depthFilter = "depth"

/** A connector's deep mode, as its depth filter's values say it: Mobbin's standard and deep. */
export function depthOf(info: ConnectorInfo): { quick: string; deep: string } | undefined {
  const filter = info.filters.find(({ id }) => id === depthFilter)
  const deep = filter?.values.find(({ id }) => id !== filter.default)

  return filter?.default && deep ? { quick: filter.default, deep: deep.id } : undefined
}

/** Each filter at what it's set to: what was chosen, or its default. */
function settled(info: ConnectorInfo, chosen: Chosen): Record<string, string> {
  return Object.fromEntries(
    info.filters.flatMap(({ id, default: usual }) => {
      const value = chosen[id] ?? usual

      return value === undefined ? [] : [[id, value]]
    })
  )
}

/**
 * The filters the browser draws as controls, for what's chosen so far: every one but depth, leaving out any that
 * doesn't apply to another's choice, as Pixabay's orientation doesn't apply to videos.
 */
export function shownFilters(info: ConnectorInfo, chosen: Chosen = {}): Filter[] {
  const set = settled(info, chosen)

  return info.filters.filter(({ id, when }) => id !== depthFilter && (!when || applies(when, set)))
}

/**
 * What's chosen once one filter is set to a value, or cleared with none. A choice can take other filters away, as
 * choosing videos takes away the ones for pictures, and their values go with them.
 */
export function choose(info: ConnectorInfo, chosen: Chosen, filter: string, value: string | undefined): Chosen {
  const next: Record<string, string> = Object.fromEntries(Object.entries(chosen).filter(([id]) => id !== filter))

  if (value !== undefined) {
    next[filter] = value
  }

  return Object.fromEntries(
    shownFilters(info, next).flatMap(({ id }) => (next[id] === undefined ? [] : [[id, next[id]]]))
  )
}

/** How many filters past the first few are set away from their default, which the Filters button counts. */
export function setPastView(info: ConnectorInfo, chosen: Chosen): number {
  return shownFilters(info, chosen)
    .slice(filtersInView)
    .filter(({ id, default: usual }) => chosen[id] !== undefined && chosen[id] !== usual).length
}

/**
 * What a search finds: the kind a filter's value names, as Pixabay's type names videos, or else the first the
 * connector finds.
 */
export function kindFor(info: ConnectorInfo, chosen: Chosen): FindKind {
  const named = Object.values(settled(info, chosen)).flatMap((value) => {
    const kind = findKind.safeParse(value)

    return kind.success && info.finds.includes(kind.data) ? [kind.data] : []
  })

  return named[0] ?? info.finds[0]
}

/** How results are laid out: screens of one shape sit in rows, and pictures of every shape pack into columns. */
export function layoutFor(kind: FindKind): "rows" | "columns" {
  return kind === "photos" || kind === "videos" ? "columns" : "rows"
}

/** A picture's size in pixels. */
export interface PictureBox {
  width: number
  height: number
}

/** A result's size when the source doesn't say: its platform's usual screen, or a photo's proportions. */
const usualSizes = { ios: { width: 390, height: 844 }, web: { width: 1280, height: 800 }, any: { width: 4, height: 3 } }

/** A result's size at 100%: its picture's own, or its platform's usual one when the source doesn't say. */
export function sizeOf(found: Pick<Found, "image" | "platform">): PictureBox {
  const { width, height } = found.image

  if (width && height) {
    return { width, height }
  }

  return usualSizes[found.platform ?? "any"]
}

/** How many a search asks for at a time: three rows of web pages or two of phones, or a dozen pictures. */
export function pageSizeFor(info: ConnectorInfo, chosen: Chosen): number {
  const kind = kindFor(info, chosen)

  if (layoutFor(kind) === "columns") {
    return Math.min(12, info.limit.max)
  }

  return Math.min(settled(info, chosen).platform === "ios" ? 12 : 9, info.limit.max)
}

/** The request for a search: its first results, or more after `shown`, in the way the connector gives more. */
export function requestFor(
  info: ConnectorInfo,
  searched: Searched,
  shown: readonly Pick<Found, "id">[] = []
): SearchRequest {
  const depth = depthOf(info)

  const filters = depth
    ? { ...searched.filters, [depthFilter]: searched.deep ? depth.deep : depth.quick }
    : searched.filters

  const limit = pageSizeFor(info, searched.filters)
  const request: SearchRequest = { query: searched.query, kind: kindFor(info, searched.filters), limit, filters }

  if (shown.length === 0) {
    return request
  }

  return info.more === "exclude"
    ? { ...request, exclude: shown.map(({ id }) => id).slice(-100) }
    : { ...request, page: Math.floor(shown.length / limit) + 1 }
}

/** Whether a search's answer may have more after it: one that filled its page. */
export function mayHaveMore(found: number, request: Pick<SearchRequest, "limit">): boolean {
  return request.limit !== undefined && found >= request.limit
}

/** What a search finds, for counts and the search field: one and many. */
export interface Noun {
  one: string
  many: string
}

const kindNouns: Record<FindKind, Noun> = {
  screens: { one: "screen", many: "screens" },
  flows: { one: "flow", many: "flows" },
  sections: { one: "section", many: "sections" },
  photos: { one: "photo", many: "photos" },
  videos: { one: "video", many: "videos" }
}

/**
 * What a search finds, in words: the type a connector's type filter is set to ("illustrations"), or else its kind
 * ("screens").
 */
export function nounFor(info: ConnectorInfo, chosen: Chosen): Noun {
  const type = info.filters.find(({ id }) => id === "type")
  const value = type?.values.find(({ id }) => id === (chosen.type ?? type.default))

  if (!value) {
    return kindNouns[kindFor(info, chosen)]
  }

  const many = value.name.toLowerCase()

  return { one: many.replace(/s$/, ""), many }
}

/** The search field's name: "Describe a screen", or "Describe an illustration". */
export function fieldLabel(info: ConnectorInfo, chosen: Chosen): string {
  const { one } = nounFor(info, chosen)

  return `Describe ${/^[aeiou]/.test(one) ? "an" : "a"} ${one}`
}

/** A count of what was found: "1 photo", "9 screens". */
export function countOf(count: number, noun: Noun): string {
  return `${count} ${count === 1 ? noun.one : noun.many}`
}

/**
 * What a search was narrowed by, as a recent search lists it: the value of every filter that always has one, then of
 * any other that was chosen. So every Mobbin search says its platform, and a Pixabay one only what was picked.
 */
export function narrowedBy(info: ConnectorInfo, chosen: Chosen): FilterValue[] {
  return shownFilters(info, chosen).flatMap(
    (filter) => filter.values.find(({ id }) => id === (chosen[filter.id] ?? filter.default)) ?? []
  )
}

/**
 * The filter to offer when nothing matched: the other side of a first filter that's a switch between two, as Mobbin's
 * platform is, since an app can be on one and not the other.
 */
export function otherSide(info: ConnectorInfo, chosen: Chosen): { filter: Filter; value: FilterValue } | undefined {
  const [first] = shownFilters(info, chosen)

  if (!first?.default || first.values.length !== 2) {
    return undefined
  }

  const now = chosen[first.id] ?? first.default
  const value = first.values.find(({ id }) => id !== now)

  return value && { filter: first, value }
}

/** Who a result is credited to first: the app a screen is from, or who made a picture. */
export function creditOf(found: Pick<Found, "credit" | "title">): string {
  return found.credit[0]?.name ?? found.title
}

/** What a result is called where its name stands alone: a screen by its app, a picture by what it shows and who made it. */
export function labelOf(found: Pick<Found, "credit" | "title" | "kind">): string {
  return layoutFor(found.kind) === "columns" ? `${found.title}, by ${creditOf(found)}` : creditOf(found)
}

/**
 * Whether a result can go into a design, or into the project to use in one: photos and videos, not screens from real
 * apps.
 */
export function isPlaceable(found: Pick<Found, "kind">): boolean {
  return placeableKinds.includes(found.kind)
}

/**
 * Who a picture added to a project is credited to: who made it, and its own page at its library, which the Media tab
 * opens it at.
 */
export function pictureCredit(
  found: Pick<Found, "credit" | "link">,
  library: Pick<ConnectorInfo, "name">
): { name: string; url: string; source: string } | undefined {
  const [author] = found.credit

  return author && { name: author.name, url: found.link, source: library.name }
}
