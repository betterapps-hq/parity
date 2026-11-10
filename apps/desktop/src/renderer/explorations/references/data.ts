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

/*
 * A stand-in for Mobbin's REST API, which has one endpoint: `POST /v1/screens/search`. It takes a description in plain
 * words, a platform, a mode, a limit and screens to leave out, and returns screens. The samples are made-up apps, drawn
 * by `screens.tsx` where Mobbin returns screenshots.
 */

/** The API's `platform`, its only filter, and required. */
export type Platform = "web" | "ios"

/**
 * The API's `mode`. `standard` answers quickly. `deep` checks each candidate against the description and keeps the
 * close matches, so it takes longer and can return fewer screens than the limit.
 */
export type Mode = "standard" | "deep"

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

/** A screen as the API returns one (`id`, `app_name`, `platform`, `mobbin_url`), with what its drawing needs. */
export interface Sample {
  id: string
  app: string
  platform: Platform
  /** Where the screen is on Mobbin. */
  link: string
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

const facts: Record<Layout, LayoutFacts> = {
  "pricing-tiers": {
    platform: "web",
    kind: "pricing plans subscription marketing",
    shows: "yearly monthly toggle switch plan cards tiers"
  },
  "pricing-compare": {
    platform: "web",
    kind: "pricing plans subscription marketing",
    shows: "comparison compare table features"
  },
  "pricing-usage": {
    platform: "web",
    kind: "pricing plans subscription marketing",
    shows: "slider usage calculator"
  },
  "pricing-two": {
    platform: "web",
    kind: "pricing plans subscription marketing",
    shows: "yearly monthly toggle switch questions faq free plan"
  },
  "paywall-plans": {
    platform: "ios",
    kind: "paywall pricing subscription upgrade premium",
    shows: "free trial yearly monthly plan options"
  },
  "paywall-timeline": {
    platform: "ios",
    kind: "paywall pricing subscription upgrade premium",
    shows: "free trial timeline reminder steps"
  },
  "paywall-compare": {
    platform: "ios",
    kind: "paywall pricing subscription upgrade premium",
    shows: "comparison compare table features lifetime"
  },
  "phone-pricing": {
    platform: "ios",
    kind: "pricing plans paywall subscription",
    shows: "yearly monthly toggle plan cards"
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

/** The library, in the order Mobbin would rank equal matches. */
const library: [Layout, App][] = [
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

export const samples: readonly Sample[] = library.map(([layout, app]) => {
  const id = `${app.toLowerCase()}-${layout}`

  return {
    id,
    app,
    platform: facts[layout].platform,
    link: `https://mobbin.com/screens/${id}`,
    look: apps[app],
    layout
  }
})

export function sampleOf(id: string): Sample | undefined {
  return samples.find((each) => each.id === id)
}

/** Words that say nothing about a screen. */
const filler = new Set([
  "a",
  "an",
  "the",
  "with",
  "and",
  "for",
  "of",
  "in",
  "on",
  "to",
  "page",
  "screen",
  "app",
  "that"
])

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

/** The API's request, without `image_quality`, which a drawing has no use for. */
export interface SearchRequest {
  query: string
  platform: Platform
  mode: Mode
  limit: number
  /** `exclude_screen_ids`: screens already shown, so asking again brings others. Up to 100. */
  exclude?: readonly string[]
}

/**
 * Searches the samples the way the API searches Mobbin. Naming an app keeps the results to that app. `standard`
 * returns every screen some word of the description fits, the closest first. `deep` keeps only the screens every word
 * fits, so it can return fewer than the limit.
 */
export function searchScreens({ query, platform, mode, limit, exclude = [] }: SearchRequest): Sample[] {
  const named = samples.find((each) => says(query, each.app.toLowerCase()))?.app
  const words = wordsOf(query).filter((word) => word !== named?.toLowerCase())

  const scored = samples.flatMap((sample) => {
    if (sample.platform !== platform || exclude.includes(sample.id) || (named && sample.app !== named)) {
      return []
    }

    const { kind, shows } = facts[sample.layout]
    const fits = words.filter((word) => says(kind, word) || says(shows, word)).length
    const close = mode === "deep" ? fits === words.length : fits > 0 || words.length === 0

    return close ? [{ sample, fits }] : []
  })

  return scored
    .toSorted((first, second) => second.fits - first.fits)
    .slice(0, limit)
    .map(({ sample }) => sample)
}

/** The most screens one description can bring, as the API takes at most 100 ids to leave out. */
export const mostPerSearch = 100

/** A description to start from for a design: its name, as a page on the web or a screen on a phone. */
export function startingQuery(designName: string, platform: Platform): string {
  return `${designName.toLowerCase()} ${platform === "web" ? "page" : "screen"}`
}
