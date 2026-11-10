import {
  type ConnectorInfo,
  type Filter,
  type Found,
  mobbin,
  type SearchRequest,
  unsplash
} from "@parity-app/connectors"
import type { CSSProperties } from "react"
import { desktop, phone } from "../start/render-kit.tsx"
import { samplePhoto, sampleScreen } from "./data.ts"
import { PhotoArt } from "./photos.tsx"
import { ScreenPicture } from "./screens.tsx"

/*
 * The libraries the browser searches, each a connector (packages/connectors) with the few words and choices that are
 * the browser's own: what it's called, how to describe what you're after, and what happens to what you pick. What a
 * search can be narrowed by isn't here: the browser draws that from the connector's own `filters`.
 */

export type LibraryId = "mobbin" | "unsplash"

export interface Library {
  id: LibraryId
  /** What the connector says about itself: its name, site, filters and how it gives more results. */
  info: ConnectorInfo
  /** The browser's name, and what opens it. */
  title: string
  /** The search field's name and its example. */
  field: { label: string; placeholder: string }
  /** What it finds, for counts: "9 screens". */
  noun: { one: string; many: string }
  /** How the source's search likes things described, from its own guidance. */
  tips: readonly string[]
  /** Screens sit in rows of one shape; photos of every shape pack into columns. */
  layout: "rows" | "columns"
  /** What the button says for this many picked. */
  place(count: number): string
  /** How many a search asks for, given its filters. */
  pageSize(filters: Readonly<Record<string, string>>): number
}

export const libraries: Record<LibraryId, Library> = {
  mobbin: {
    id: "mobbin",
    info: mobbin.info,
    title: "Find references",
    field: { label: "Describe a screen", placeholder: "Describe a screen, like “checkout with a promo code field”" },
    noun: { one: "screen", many: "screens" },
    tips: [
      "Say what kind of screen it is, then what's on it: “paywall with plan cards and a free trial button”.",
      "Name an app to see only that app: “Ledgerly pricing page”.",
      "Search for one screen at a time. Words like “clean” or “modern” don't help."
    ],
    layout: "rows",
    place: (count) => (count === 0 ? "Place on canvas" : `Place ${count} on canvas`),
    // Three rows of web pages, or two of phones.
    pageSize: (filters) => (filters.platform === "ios" ? 12 : 9)
  },
  unsplash: {
    id: "unsplash",
    info: unsplash.info,
    title: "Find photos",
    field: { label: "Describe a photo", placeholder: "Describe a photo, like “desk with a laptop and coffee”" },
    noun: { one: "photo", many: "photos" },
    tips: [
      "Say what's in the photo: “mountain lake at sunrise”, “team around a laptop”.",
      "Orientation and color narrow a search without changing its words.",
      "Each photo you add goes into the project's images, with its photographer's name."
    ],
    layout: "columns",
    place: (count) => {
      if (count === 0) {
        return "Add photos"
      }

      return count === 1 ? "Add 1 photo" : `Add ${count} photos`
    },
    pageSize: () => 12
  }
}

/**
 * The filter that makes a search slower and closer, which the browser offers as Search deeper on the results rather
 * than as a choice before searching: Mobbin's depth.
 */
export function depthOf(info: ConnectorInfo): Filter | undefined {
  return info.filters.find((filter) => filter.id === "depth")
}

/** The filters the browser draws as controls beside the search field. */
export function shownFilters(info: ConnectorInfo): readonly Filter[] {
  return info.filters.filter((filter) => filter.id !== "depth")
}

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

/** The filters' chosen values in words, as a recent search lists them: "iOS", "Portrait, Teal". */
export function filtersInWords(info: ConnectorInfo, filters: Readonly<Record<string, string>>): string {
  return shownFilters(info)
    .flatMap((filter) => filter.values.find((value) => value.id === filters[filter.id])?.name ?? [])
    .join(", ")
}

/** Who a result is credited to first: the app a screen is from, or a photo's photographer. */
export function creditOf(found: Found): string {
  return found.credit[0]?.name ?? found.title
}

/** What a result is called where its name stands alone: a screen by its app, a photo by what it shows and who took it. */
export function labelOf(found: Found): string {
  return found.kind === "photos" ? `${found.title}, by ${creditOf(found)}` : creditOf(found)
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
 * loads from the source's own link, as Unsplash's terms ask.
 */
export function Picture({ found, className = "", style }: { found: Found; className?: string; style?: CSSProperties }) {
  const screen = sampleScreen(found.id)

  if (screen) {
    return <ScreenPicture screen={screen} className={className} style={style} />
  }

  const { width, height } = sizeOf(found)
  const photo = samplePhoto(found.id)

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ aspectRatio: `${width} / ${height}`, ...style }}>
      {photo ? (
        <PhotoArt photo={photo} />
      ) : (
        <img
          src={found.image.url}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full bg-muted object-cover"
        />
      )}
    </div>
  )
}
