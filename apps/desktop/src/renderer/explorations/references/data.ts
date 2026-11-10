import type { Found, RecentSearch, SearchAnswer, SearchRequest } from "@parity-app/connectors"
import {
  Anchor,
  Apple,
  Bike,
  Bird,
  Compass,
  Feather,
  Flower2,
  Footprints,
  Leaf,
  Lightbulb,
  ListChecks,
  Mountain,
  Music,
  PiggyBank,
  Receipt,
  ScrollText,
  Send,
  Sunrise,
  Trees,
  Waves,
  Wind
} from "lucide-react"
import type { Look } from "../start/data.ts"
import { desktop, phone } from "../start/render-kit.tsx"

/*
 * Sample libraries standing in for Mobbin and Unsplash, answering in the connectors' own words (`SearchRequest` in,
 * `SearchAnswer` out), so the browser is the same code against samples as against the real connectors. The apps,
 * photographers and pictures are made up, drawn by `screens.tsx` and `photos.tsx`, so the exploration ships no one
 * else's work.
 */

/** Where a browser's searches go: the samples here, or the real connectors through the host. */
export interface Source {
  search(connector: string, request: SearchRequest): Promise<SearchAnswer>
  /** The answer without the wait, for a story that opens on results. Only the samples have one. */
  instant?(connector: string, request: SearchRequest): SearchAnswer
  /**
   * The person's recent searches, newest first, from a source that keeps them, as the app's main process does. Without
   * it the window keeps its own.
   */
  recent?(): Promise<RecentSearch[]>
}

type Platform = "web" | "ios"

/** What a sample screen shows, which picks its drawing. */
export type Layout =
  | "pricing-tiers"
  | "pricing-compare"
  | "pricing-usage"
  | "pricing-two"
  | "paywall-plans"
  | "paywall-timeline"
  | "paywall-compare"
  | "phone-pricing"
  | "landing"
  | "sign-in"
  | "dashboard"
  | "billing"
  | "docs"
  | "inbox"
  | "listings"
  | "phone-landing"
  | "phone-dashboard"
  | "phone-billing"
  | "phone-listings"

/** A sample screen: what Mobbin would return for it, and what its drawing needs. */
export interface SampleScreen {
  id: string
  app: string
  platform: Platform
  look: Look
  layout: Layout
}

interface LayoutFacts {
  platform: Platform
  /** The kind of screen it is. */
  kind: string
  /** What's on it. */
  shows: string
}

const pricingPage = "pricing plans subscription marketing"
const paywall = "paywall pricing subscription upgrade premium"

const facts: Record<Layout, LayoutFacts> = {
  "pricing-tiers": { platform: "web", kind: pricingPage, shows: "yearly monthly toggle switch plan cards tiers" },
  "pricing-compare": { platform: "web", kind: pricingPage, shows: "comparison compare table features" },
  "pricing-usage": { platform: "web", kind: pricingPage, shows: "slider usage calculator" },
  "pricing-two": { platform: "web", kind: pricingPage, shows: "yearly monthly toggle switch questions faq free plan" },
  "paywall-plans": { platform: "ios", kind: paywall, shows: "free trial yearly monthly plan options" },
  "paywall-timeline": { platform: "ios", kind: paywall, shows: "free trial timeline reminder steps" },
  "paywall-compare": { platform: "ios", kind: paywall, shows: "comparison compare table features lifetime" },
  "phone-pricing": {
    platform: "ios",
    kind: "pricing plans paywall subscription",
    shows: "yearly monthly toggle cards"
  },
  landing: { platform: "web", kind: "landing home marketing website hero", shows: "terminal headline" },
  "sign-in": { platform: "web", kind: "sign login log signin authentication", shows: "google github password email" },
  dashboard: { platform: "web", kind: "dashboard overview analytics", shows: "chart usage sidebar deploys" },
  billing: { platform: "web", kind: "billing settings invoices payment", shows: "usage meter card invoices" },
  docs: { platform: "web", kind: "docs documentation article guide", shows: "sidebar code" },
  inbox: { platform: "web", kind: "inbox support messages conversation", shows: "list thread reply" },
  listings: { platform: "web", kind: "listings search results browse marketplace", shows: "map cards photos" },
  "phone-landing": { platform: "ios", kind: "landing home welcome onboarding", shows: "headline" },
  "phone-dashboard": { platform: "ios", kind: "dashboard overview home analytics", shows: "chart usage" },
  "phone-billing": { platform: "ios", kind: "billing settings payment account", shows: "usage meter card" },
  "phone-listings": { platform: "ios", kind: "listings search results browse", shows: "map cards photos" }
}

const apps = {
  Ledgerly: { hue: 150, brand: "Ledgerly", icon: Receipt },
  Northwind: { hue: 260, brand: "Northwind", icon: Wind },
  Papertrail: { hue: 40, brand: "Papertrail", icon: ScrollText, serif: true },
  Harbor: { hue: 200, brand: "Harbor", icon: Anchor, dark: true },
  Quill: { hue: 300, brand: "Quill", icon: Feather },
  Tandem: { hue: 20, brand: "Tandem", icon: Bike },
  Basalt: { hue: 0, brand: "Basalt", icon: Mountain, mono: true },
  Juniper: { hue: 165, brand: "Juniper", icon: Trees, serif: true },
  Marlow: { hue: 230, brand: "Marlow", icon: Compass, dark: true },
  Saffron: { hue: 70, brand: "Saffron", icon: Flower2 },
  Kite: { hue: 190, brand: "Kite", icon: Send },
  Orchard: { hue: 130, brand: "Orchard", icon: Apple },
  Budgetbird: { hue: 150, brand: "Budgetbird", icon: Bird },
  Lumen: { hue: 280, brand: "Lumen", icon: Lightbulb, dark: true },
  Stillwater: { hue: 210, brand: "Stillwater", icon: Waves, serif: true },
  Trailhead: { hue: 95, brand: "Trailhead", icon: Footprints },
  Pennywise: { hue: 40, brand: "Pennywise", icon: PiggyBank },
  Daybreak: { hue: 25, brand: "Daybreak", icon: Sunrise },
  Mossy: { hue: 140, brand: "Mossy", icon: Leaf, dark: true },
  Tempo: { hue: 330, brand: "Tempo", icon: Music },
  Pocketlist: { hue: 10, brand: "Pocketlist", icon: ListChecks }
} satisfies Record<string, Look>

type App = keyof typeof apps

/** The screens, in the order Mobbin would rank equal matches. */
const screenList: [Layout, App][] = [
  ["pricing-tiers", "Ledgerly"],
  ["pricing-compare", "Northwind"],
  ["pricing-two", "Quill"],
  ["pricing-usage", "Kite"],
  ["pricing-tiers", "Harbor"],
  ["pricing-two", "Papertrail"],
  ["pricing-compare", "Basalt"],
  ["pricing-usage", "Saffron"],
  ["pricing-tiers", "Juniper"],
  ["pricing-two", "Marlow"],
  ["pricing-compare", "Tandem"],
  ["pricing-usage", "Orchard"],
  ["landing", "Northwind"],
  ["landing", "Juniper"],
  ["landing", "Marlow"],
  ["sign-in", "Ledgerly"],
  ["sign-in", "Harbor"],
  ["sign-in", "Basalt"],
  ["dashboard", "Northwind"],
  ["dashboard", "Kite"],
  ["dashboard", "Marlow"],
  ["billing", "Ledgerly"],
  ["billing", "Quill"],
  ["docs", "Papertrail"],
  ["docs", "Kite"],
  ["inbox", "Tandem"],
  ["inbox", "Harbor"],
  ["listings", "Orchard"],
  ["listings", "Saffron"],
  ["paywall-plans", "Budgetbird"],
  ["paywall-timeline", "Lumen"],
  ["paywall-compare", "Trailhead"],
  ["paywall-plans", "Stillwater"],
  ["paywall-timeline", "Daybreak"],
  ["phone-pricing", "Pennywise"],
  ["paywall-compare", "Mossy"],
  ["paywall-plans", "Tempo"],
  ["paywall-timeline", "Pocketlist"],
  ["phone-landing", "Trailhead"],
  ["phone-landing", "Tempo"],
  ["phone-dashboard", "Pennywise"],
  ["phone-dashboard", "Mossy"],
  ["phone-billing", "Budgetbird"],
  ["phone-billing", "Daybreak"],
  ["phone-listings", "Stillwater"],
  ["phone-listings", "Pocketlist"]
]

const screens: readonly SampleScreen[] = screenList.map(([layout, app]) => ({
  id: `${app.toLowerCase()}-${layout}`,
  app,
  platform: facts[layout].platform,
  look: apps[app],
  layout
}))

export function sampleScreen(id: string): SampleScreen | undefined {
  return screens.find((each) => each.id === id)
}

/** What a sample photo is of, which picks its drawing. */
export type Scene =
  | "hills"
  | "coast"
  | "city"
  | "desk"
  | "portrait"
  | "leaves"
  | "abstract"
  | "collage"
  | "figure"
  | "rocket"
  | "heart"
  | "star"

/** A sample photo: what Unsplash would return for it, and what its drawing needs. */
export interface SamplePhoto {
  id: string
  description: string
  /** The photographer. */
  by: string
  scene: Scene
  hue: number
  width: number
  height: number
  /** The one of Unsplash's colors it would be found under. */
  color: string
  /** Words a search matches, beside its description. */
  tags: string
}

const wide = { width: 4800, height: 3200 }
const tall = { width: 3200, height: 4800 }
const square = { width: 4000, height: 4000 }

const photos: readonly SamplePhoto[] = [
  {
    id: "lake-at-sunrise",
    description: "A mountain lake at sunrise",
    by: "Mara Lindqvist",
    scene: "hills",
    hue: 25,
    ...wide,
    color: "orange",
    tags: "mountains nature landscape morning outdoors calm"
  },
  {
    id: "team-at-a-laptop",
    description: "A desk with a laptop and coffee",
    by: "Dev Anand",
    scene: "desk",
    hue: 60,
    ...wide,
    color: "yellow",
    tags: "office work team laptop desk workspace startup"
  },
  {
    id: "skyline-at-dusk",
    description: "A city skyline at dusk",
    by: "Tobias Renner",
    scene: "city",
    hue: 280,
    ...wide,
    color: "purple",
    tags: "city buildings urban evening architecture"
  },
  {
    id: "portrait-in-window-light",
    description: "A portrait in window light",
    by: "Aiko Tanaka",
    scene: "portrait",
    hue: 30,
    ...tall,
    color: "orange",
    tags: "person people portrait woman face team"
  },
  {
    id: "monstera-leaves",
    description: "Monstera leaves against a wall",
    by: "Lucía Ferrer",
    scene: "leaves",
    hue: 150,
    ...tall,
    color: "green",
    tags: "plant leaves nature green botanical"
  },
  {
    id: "soft-gradient",
    description: "A soft blue and violet gradient",
    by: "Noor Haddad",
    scene: "abstract",
    hue: 255,
    ...wide,
    color: "blue",
    tags: "abstract gradient background texture color"
  },
  {
    id: "green-hills",
    description: "Rolling green hills under a clear sky",
    by: "Mara Lindqvist",
    scene: "hills",
    hue: 140,
    ...wide,
    color: "green",
    tags: "mountains nature landscape hills outdoors"
  },
  {
    id: "rocky-coast",
    description: "Waves on a rocky coast",
    by: "Tobias Renner",
    scene: "coast",
    hue: 205,
    ...wide,
    color: "teal",
    tags: "sea ocean coast beach water nature"
  },
  {
    id: "desk-from-above",
    description: "A tidy desk from above",
    by: "Aiko Tanaka",
    scene: "desk",
    hue: 200,
    ...square,
    color: "blue",
    tags: "office work desk workspace flat lay laptop"
  },
  {
    id: "tower-blocks",
    description: "Tower blocks in morning haze",
    by: "Dev Anand",
    scene: "city",
    hue: 205,
    ...tall,
    color: "teal",
    tags: "city buildings urban architecture morning"
  },
  {
    id: "portrait-on-teal",
    description: "A portrait against a teal wall",
    by: "Lucía Ferrer",
    scene: "portrait",
    hue: 185,
    ...tall,
    color: "teal",
    tags: "person people portrait man face team"
  },
  {
    id: "warm-gradient",
    description: "A warm orange and pink gradient",
    by: "Noor Haddad",
    scene: "abstract",
    hue: 20,
    ...square,
    color: "orange",
    tags: "abstract gradient background texture color"
  },
  {
    id: "alpine-dusk",
    description: "Mountains at dusk",
    by: "Mara Lindqvist",
    scene: "hills",
    hue: 290,
    ...wide,
    color: "purple",
    tags: "mountains nature landscape evening outdoors"
  },
  {
    id: "fern-fronds",
    description: "Fern fronds up close",
    by: "Lucía Ferrer",
    scene: "leaves",
    hue: 125,
    ...square,
    color: "green",
    tags: "plant leaves nature green botanical forest"
  },
  {
    id: "sunset-shore",
    description: "A shore at sunset",
    by: "Tobias Renner",
    scene: "coast",
    hue: 35,
    ...wide,
    color: "orange",
    tags: "sea ocean coast beach water sunset nature"
  },
  {
    id: "desk-at-night",
    description: "A desk lit by a screen at night",
    by: "Dev Anand",
    scene: "desk",
    hue: 265,
    ...wide,
    color: "black",
    tags: "office work desk workspace laptop night dark"
  },
  {
    id: "city-in-grey",
    description: "A street between tall buildings",
    by: "Aiko Tanaka",
    scene: "city",
    hue: 0,
    ...tall,
    color: "black_and_white",
    tags: "city buildings urban street architecture"
  },
  {
    id: "portrait-in-grey",
    description: "A portrait in black and white",
    by: "Aiko Tanaka",
    scene: "portrait",
    hue: 0,
    ...square,
    color: "black_and_white",
    tags: "person people portrait face team"
  },
  {
    id: "misty-ridge",
    description: "A ridge in the mist",
    by: "Mara Lindqvist",
    scene: "hills",
    hue: 215,
    ...tall,
    color: "blue",
    tags: "mountains nature landscape fog outdoors"
  },
  {
    id: "green-gradient",
    description: "A green and teal gradient",
    by: "Noor Haddad",
    scene: "abstract",
    hue: 165,
    ...wide,
    color: "teal",
    tags: "abstract gradient background texture color"
  }
]

/** What a Pixabay sample is, which its search's Type filter picks between. */
export type MediaType = "photos" | "illustrations" | "vectors" | "videos"

/** A sample from Pixabay's library: a picture of one of its types, or a video with its length. */
export interface SampleMedia extends SamplePhoto {
  type: MediaType
  /** A video's length in seconds. */
  seconds?: number
  /** A video that's drawn rather than filmed. */
  animated?: boolean
}

const film = { width: 3840, height: 2160 }
const clear = "transparent"

function media(
  type: MediaType,
  id: string,
  description: string,
  by: string,
  rest: Omit<SampleMedia, "id" | "description" | "by" | "type">
): SampleMedia {
  return { type, id: `pixabay-${id}`, description, by, ...rest }
}

/** Pixabay's samples: the photos above under its own contributors' names, then illustrations, vectors and videos. */
const mediaList: readonly SampleMedia[] = [
  ...photos.map((photo): SampleMedia => ({
    ...photo,
    id: `pixabay-${photo.id}`,
    type: "photos"
  })),
  media("illustrations", "shapes-warm", "Overlapping shapes in warm colors", "studio_kelp", {
    scene: "collage",
    hue: 40,
    ...wide,
    color: "orange",
    tags: "abstract shapes geometric pattern background backgrounds"
  }),
  media("illustrations", "figure-at-desk", "A person working at a laptop", "inkfold", {
    scene: "figure",
    hue: 255,
    ...wide,
    color: "blue",
    tags: "person people work office business computer laptop"
  }),
  media("illustrations", "shapes-cool", "Overlapping shapes in cool colors", "studio_kelp", {
    scene: "collage",
    hue: 200,
    ...square,
    color: "teal",
    tags: "abstract shapes geometric pattern background backgrounds"
  }),
  media("illustrations", "figure-in-green", "A person at a desk with a plant", "inkfold", {
    scene: "figure",
    hue: 150,
    ...tall,
    color: "green",
    tags: "person people work office business nature plant"
  }),
  media("illustrations", "hills-flat", "Flat hills at dusk", "paperhill", {
    scene: "hills",
    hue: 300,
    ...wide,
    color: "purple",
    tags: "nature landscape mountains travel places"
  }),
  media("illustrations", "leaves-flat", "Flat leaves on cream", "paperhill", {
    scene: "leaves",
    hue: 95,
    ...square,
    color: "green",
    tags: "nature plant leaves botanical"
  }),
  media("vectors", "rocket", "A rocket", "vektorhaus", {
    scene: "rocket",
    hue: 25,
    ...square,
    color: clear,
    tags: "rocket launch startup business science icon"
  }),
  media("vectors", "heart", "A heart", "vektorhaus", {
    scene: "heart",
    hue: 10,
    ...square,
    color: clear,
    tags: "heart love feelings health icon"
  }),
  media("vectors", "star", "A star", "linework", {
    scene: "star",
    hue: 85,
    ...square,
    color: clear,
    tags: "star rating favorite icon"
  }),
  media("vectors", "rocket-blue", "A blue rocket", "linework", {
    scene: "rocket",
    hue: 250,
    ...square,
    color: clear,
    tags: "rocket launch startup business science icon"
  }),
  media("vectors", "star-violet", "A violet star", "vektorhaus", {
    scene: "star",
    hue: 300,
    ...square,
    color: clear,
    tags: "star rating favorite icon"
  }),
  media("vectors", "heart-teal", "A teal heart", "linework", {
    scene: "heart",
    hue: 190,
    ...square,
    color: clear,
    tags: "heart love feelings health icon"
  }),
  media("videos", "clouds-over-hills", "Clouds moving over hills", "slowframe", {
    scene: "hills",
    hue: 215,
    ...film,
    color: "blue",
    tags: "nature landscape mountains sky travel",
    seconds: 18
  }),
  media("videos", "waves-at-dusk", "Waves coming in at dusk", "slowframe", {
    scene: "coast",
    hue: 30,
    ...film,
    color: "orange",
    tags: "nature sea ocean water travel places",
    seconds: 24
  }),
  media("videos", "city-lights", "City lights at night", "nightshift", {
    scene: "city",
    hue: 265,
    ...film,
    color: "purple",
    tags: "city buildings urban travel places",
    seconds: 12
  }),
  media("videos", "gradient-loop", "A looping gradient", "loopyard", {
    scene: "abstract",
    hue: 190,
    ...film,
    color: "teal",
    tags: "abstract gradient background backgrounds loop",
    seconds: 8,
    animated: true
  }),
  media("videos", "typing-at-a-desk", "Typing at a desk", "nightshift", {
    scene: "desk",
    hue: 60,
    ...film,
    color: "yellow",
    tags: "office work desk business computer laptop",
    seconds: 15
  }),
  media("videos", "green-valley", "A green valley from above", "slowframe", {
    scene: "hills",
    hue: 140,
    ...film,
    color: "green",
    tags: "nature landscape mountains travel",
    seconds: 30
  }),
  media("videos", "shapes-loop", "Shapes moving in a loop", "loopyard", {
    scene: "collage",
    hue: 320,
    ...film,
    color: "purple",
    tags: "abstract shapes background backgrounds loop",
    seconds: 10,
    animated: true
  }),
  media("videos", "morning-coast", "A coast in the morning", "slowframe", {
    scene: "coast",
    hue: 200,
    ...film,
    color: "teal",
    tags: "nature sea ocean water travel places",
    seconds: 21
  })
]

export function sampleMedia(id: string): SampleMedia | undefined {
  return mediaList.find((each) => each.id === id)
}

export function samplePhoto(id: string): SamplePhoto | undefined {
  return photos.find((each) => each.id === id) ?? sampleMedia(id)
}

/** Words that say nothing about a screen or a photo. */
const filler = new Set(["a", "an", "the", "with", "and", "for", "of", "in", "on", "to", "at", "page", "screen", "app"])

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !filler.has(word))
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word))
}

function says(text: string, word: string): boolean {
  return wordsOf(text).some((each) => each === word || (word.length > 2 && each.startsWith(word)))
}

/** A sample picture's link. Nothing loads it: `pictures.tsx` draws samples by their id. */
const drawn = (id: string) => `https://example.com/samples/${id}.png`

function foundScreen(screen: SampleScreen): Found {
  const link = `https://mobbin.com/screens/${screen.id}`

  return {
    connector: "mobbin",
    id: screen.id,
    kind: "screens",
    title: screen.app,
    platform: screen.platform,
    image: { url: drawn(screen.id), ...(screen.platform === "ios" ? phone : desktop) },
    link,
    credit: [{ name: screen.app }, { name: "Mobbin", url: link }]
  }
}

function foundPhoto(photo: SamplePhoto): Found {
  return {
    connector: "unsplash",
    id: photo.id,
    kind: "photos",
    title: photo.description,
    image: { url: drawn(photo.id), width: photo.width, height: photo.height },
    link: `https://unsplash.com/photos/${photo.id}`,
    credit: [
      { name: photo.by, url: "https://unsplash.com" },
      { name: "Unsplash", url: "https://unsplash.com" }
    ]
  }
}

/** A sample as a search would return it, for a story that starts with one picked or placed. */
export function sampleFound(id: string): Found | undefined {
  const screen = sampleScreen(id)

  if (screen) {
    return foundScreen(screen)
  }

  const item = sampleMedia(id)

  if (item) {
    return foundMedia(item)
  }

  const photo = samplePhoto(id)

  return photo && foundPhoto(photo)
}

function foundMedia(item: SampleMedia): Found {
  const found: Found = {
    connector: "pixabay",
    id: item.id,
    kind: item.seconds === undefined ? "photos" : "videos",
    title: item.description,
    image: { url: drawn(item.id), width: item.width, height: item.height },
    link: `https://pixabay.com/${item.type}/${item.id}`,
    credit: [
      { name: item.by, url: `https://pixabay.com/users/${item.by}` },
      { name: "Pixabay", url: "https://pixabay.com" }
    ]
  }

  if (item.seconds !== undefined) {
    found.video = { url: `https://example.com/samples/${item.id}.mp4`, duration: item.seconds }
  }

  return found
}

/** Pixabay's names for the colors the samples are filed under. */
const pixabayColors = new Map([
  ["purple", "lilac"],
  ["teal", "turquoise"],
  ["black_and_white", "grayscale"]
])

/**
 * Searches the Pixabay samples the way its API does: a type first, then words, then whatever narrows them, a page at a
 * time.
 */
function searchMedia({ query, limit = 20, filters = {}, page = 1 }: SearchRequest): Found[] {
  const words = wordsOf(query)

  const type = filters.type ?? "photos"

  const scored = mediaList.flatMap((item) => {
    const fits = words.filter((word) => says(item.description, word) || says(item.tags, word)).length
    const wide = item.width > item.height ? "horizontal" : "vertical"

    const kept =
      item.type === type &&
      (!filters.orientation || (item.width !== item.height && wide === filters.orientation)) &&
      (!filters.color || (pixabayColors.get(item.color) ?? item.color) === filters.color) &&
      (!filters.footage || (filters.footage === "animation") === !!item.animated) &&
      (!filters.category || says(item.tags, filters.category))

    return fits > 0 && kept ? [{ item, fits }] : []
  })

  const ranked = scored.toSorted((first, second) => second.fits - first.fits)

  return ranked.slice((page - 1) * limit, page * limit).map(({ item }) => foundMedia(item))
}

/**
 * Searches the sample screens the way Mobbin's API does. Naming an app keeps the results to that app. A standard search
 * returns every screen some word of the description fits, the closest first. A deep one keeps only the screens every
 * word fits, so it can return fewer than the limit. More come by leaving out the ones already shown.
 */
function searchScreens({ query, limit = 20, filters = {}, exclude = [] }: SearchRequest): Found[] {
  const named = screens.find((each) => says(query, each.app.toLowerCase()))?.app
  const words = wordsOf(query).filter((word) => word !== named?.toLowerCase())
  const platform = filters.platform ?? "web"
  const deep = filters.depth === "deep"

  const scored = screens.flatMap((screen) => {
    if (screen.platform !== platform || exclude.includes(screen.id) || (named && screen.app !== named)) {
      return []
    }

    const { kind, shows } = facts[screen.layout]
    const fits = words.filter((word) => says(kind, word) || says(shows, word)).length
    const close = deep ? fits === words.length : fits > 0 || words.length === 0

    return close ? [{ screen, fits }] : []
  })

  return scored
    .toSorted((first, second) => second.fits - first.fits)
    .slice(0, limit)
    .map(({ screen }) => foundScreen(screen))
}

function orientationOf(photo: SamplePhoto): string {
  if (photo.width > photo.height) {
    return "landscape"
  }

  return photo.height > photo.width ? "portrait" : "squarish"
}

/** Searches the sample photos the way Unsplash's API does: by words, orientation and color, a page at a time. */
function searchPhotos({ query, limit = 20, filters = {}, page = 1 }: SearchRequest): Found[] {
  const words = wordsOf(query)

  const scored = photos.flatMap((photo) => {
    const fits = words.filter((word) => says(photo.description, word) || says(photo.tags, word)).length
    const kept = !filters.orientation || orientationOf(photo) === filters.orientation
    const colored = !filters.color || photo.color === filters.color

    return fits > 0 && kept && colored ? [{ photo, fits }] : []
  })

  return scored
    .toSorted((first, second) => second.fits - first.fits)
    .slice((page - 1) * limit, page * limit)
    .map(({ photo }) => foundPhoto(photo))
}

/** How long the samples take to answer, as the real searches do. */
const wait = { quick: 450, deep: 2200 }

/** The sample libraries as a source. */
export function samples(): Source {
  const instant = (connector: string, request: SearchRequest): SearchAnswer => {
    if (connector === "pixabay") {
      return { found: searchMedia(request) }
    }

    return connector === "unsplash" ? { found: searchPhotos(request) } : { found: searchScreens(request) }
  }

  return {
    instant,
    search: (connector, request) =>
      new Promise((resolve) => {
        setTimeout(
          () => resolve(instant(connector, request)),
          request.filters?.depth === "deep" ? wait.deep : wait.quick
        )
      })
  }
}
