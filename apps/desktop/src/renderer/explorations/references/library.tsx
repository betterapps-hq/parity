import {
  applies,
  type ConnectorInfo,
  type Filter,
  type FilterValue,
  type Found,
  mobbin,
  pixabay,
  type SearchRequest,
  unsplash
} from "@parity-app/connectors"
import type { CSSProperties } from "react"
import { desktop, phone } from "../start/render-kit.tsx"
import { samplePhoto, sampleScreen } from "./data.ts"
import { PhotoArt } from "./photos.tsx"
import { ScreenPicture } from "./screens.tsx"

/*
 * The libraries the browser searches, each a connector (packages/connectors) with the few choices that are the
 * browser's own: what it's called, how its results are laid out, and what happens to what you pick. The source's name,
 * mark, filters and guidance on searching it aren't here: the browser reads those from the connector.
 */

export type LibraryId = "mobbin" | "unsplash" | "pixabay"

type Chosen = Readonly<Record<string, string>>

interface Noun {
  one: string
  many: string
}

export interface Library {
  id: LibraryId
  /** What the connector says about itself: its name, site, mark, filters, guidance and how it gives more results. */
  info: ConnectorInfo
  /** The browser's name, and what opens it. */
  title: string
  /** What a search finds, given its filters, for counts and the search field: "9 screens", "Describe a video". */
  noun(filters: Chosen): Noun
  /** Screens sit in rows of one shape; pictures of every shape pack into columns. */
  layout: "rows" | "columns"
  /** Where what's picked goes: beside the design to look at, or into the project to use. */
  goes: "beside" | "into"
  /** What the button says for this many picked. */
  place(count: number): string
  /** How many a search asks for, given its filters. */
  pageSize(filters: Chosen): number
}

const pixabayNouns = new Map<string, Noun>([
  ["photos", { one: "photo", many: "photos" }],
  ["illustrations", { one: "illustration", many: "illustrations" }],
  ["vectors", { one: "vector", many: "vectors" }],
  ["videos", { one: "video", many: "videos" }]
])

export const libraries: Record<LibraryId, Library> = {
  mobbin: {
    id: "mobbin",
    info: mobbin.info,
    title: "Find references",
    noun: () => ({ one: "screen", many: "screens" }),
    layout: "rows",
    goes: "beside",
    place: (count) => (count === 0 ? "Place on canvas" : `Place ${count} on canvas`),
    // Three rows of web pages, or two of phones.
    pageSize: (filters) => (filters.platform === "ios" ? 12 : 9)
  },
  unsplash: {
    id: "unsplash",
    info: unsplash.info,
    title: "Find photos",
    noun: () => ({ one: "photo", many: "photos" }),
    layout: "columns",
    goes: "into",
    place: (count) => {
      if (count === 0) {
        return "Add photos"
      }

      return count === 1 ? "Add 1 photo" : `Add ${count} photos`
    },
    pageSize: () => 12
  },
  pixabay: {
    id: "pixabay",
    info: pixabay.info,
    title: "Find images and videos",
    noun: (filters) => pixabayNouns.get(filters.type ?? "") ?? { one: "photo", many: "photos" },
    layout: "columns",
    goes: "into",
    // What's picked can be of several types, so the button doesn't name one.
    place: (count) => (count === 0 ? "Add to project" : `Add ${count} to project`),
    pageSize: () => 12
  }
}

/** The service a result came from, by the connector it names, to credit it wherever the result is shown. */
export function sourceOf(found: Found): ConnectorInfo | undefined {
  return Object.values(libraries).find((library) => library.info.id === found.connector)?.info
}

/**
 * The filter that makes a search slower and closer, which the browser offers as Search deeper on the results rather
 * than as a choice before searching: Mobbin's depth.
 */
export function depthOf(info: ConnectorInfo): Filter | undefined {
  return info.filters.find((filter) => filter.id === "depth")
}

/**
 * The filters the browser draws as controls, for what's chosen so far: every one but depth, leaving out any that
 * doesn't apply to another filter's choice, as Pixabay's orientation doesn't apply to videos.
 */
export function shownFilters(info: ConnectorInfo, chosen: Chosen = {}): readonly Filter[] {
  // Each filter at what it's set to: what was chosen, or its default.
  const set = Object.fromEntries(
    info.filters.flatMap(({ id, default: usual }) => {
      const value = chosen[id] ?? usual

      return value === undefined ? [] : [[id, value]]
    })
  )

  return info.filters.filter((filter) => filter.id !== "depth" && (!filter.when || applies(filter.when, set)))
}

/** How many filters sit beside the search field. Any more go behind Filters, in the connector's order. */
export const filtersInView = 3

/** A search as the browser ran it. */
export interface Searched {
  query: string
  /** The value chosen for each filter shown, by its id. A filter left out is at its default, or any. */
  filters: Readonly<Record<string, string>>
  /** Searched in the connector's deep mode. */
  deep?: boolean
}

/** The request for a search: its first results, or more of them after `shown`, by the way the connector gives more. */
export function requestFor(library: Library, searched: Searched, shown: readonly Found[] = []): SearchRequest {
  const filters = depthOf(library.info)
    ? { ...searched.filters, depth: searched.deep ? "deep" : "standard" }
    : searched.filters

  const limit = library.pageSize(filters)
  const request: SearchRequest = { query: searched.query, kind: library.info.finds[0], limit, filters }

  if (shown.length === 0) {
    return request
  }

  return library.info.more === "exclude"
    ? { ...request, exclude: shown.map((each) => each.id).slice(-100) }
    : { ...request, page: Math.floor(shown.length / limit) + 1 }
}

/** The search field's name: "Describe a screen", or "Describe an illustration". */
export function fieldLabel(library: Library, filters: Chosen): string {
  const { one } = library.noun(filters)

  return `Describe ${/^[aeiou]/.test(one) ? "an" : "a"} ${one}`
}

/**
 * What a search was narrowed by, as a recent search lists it: the value of every filter that always has one, then of
 * any other that was chosen. So every Mobbin search says its platform, and a Pixabay one says only what was picked.
 */
export function narrowedBy(info: ConnectorInfo, filters: Readonly<Record<string, string>>): FilterValue[] {
  return shownFilters(info, filters).flatMap(
    (filter) => filter.values.find((value) => value.id === (filters[filter.id] ?? filter.default)) ?? []
  )
}

/** Who a result is credited to first: the app a screen is from, or a photo's photographer. */
export function creditOf(found: Found): string {
  return found.credit[0]?.name ?? found.title
}

/** What a result is called where its name stands alone: a screen by its app, a photo by what it shows and who took it. */
export function labelOf(found: Found): string {
  return found.kind === "photos" || found.kind === "videos" ? `${found.title}, by ${creditOf(found)}` : creditOf(found)
}

/** A result that's a video: how long it runs, and where it plays from. */
export function clipOf(found: Found): { seconds: number; url: string; preview?: string } | undefined {
  const { video } = found

  return video && { seconds: video.duration, url: video.url, preview: video.preview }
}

/** Whether a result is one of the samples, which are drawn rather than loaded. */
export function isSample(found: Found): boolean {
  return !!(sampleScreen(found.id) ?? samplePhoto(found.id))
}

/** A length in seconds as a player shows it: "0:18". */
export function clockOf(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`
}

/** A result's size at 100%: its picture's own, or its platform's usual one when the source doesn't say. */
export function sizeOf(found: Found) {
  const { width, height } = found.image

  if (width && height) {
    return { width, height }
  }

  return found.platform === "ios" ? phone : desktop
}

/**
 * A result's picture, filling its box's width, or its height when `style` gives one. A sample is drawn; anything else
 * loads from the source's own link, its smaller copy when `small` and it has one. `at` is how far through a sample
 * video is, from 0 to 1, which moves its drawing.
 */
export function Picture({
  found,
  at,
  small,
  className = "",
  style
}: {
  found: Found
  at?: number
  small?: boolean
  className?: string
  style?: CSSProperties
}) {
  const screen = sampleScreen(found.id)

  if (screen) {
    return <ScreenPicture screen={screen} className={className} style={style} />
  }

  const { width, height } = sizeOf(found)
  const photo = samplePhoto(found.id)

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ aspectRatio: `${width} / ${height}`, ...style }}>
      {photo ? (
        <PhotoArt photo={photo} at={at} />
      ) : (
        <img
          src={(small && found.preview?.url) || found.image.url}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full bg-muted object-cover"
        />
      )}
    </div>
  )
}
