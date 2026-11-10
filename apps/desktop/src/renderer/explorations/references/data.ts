import type { ScreenKind } from "../explore-data.ts"

/*
 * Sample results standing in for Mobbin's, from made-up apps. The real tab shows Mobbin's own screenshots; these are
 * drawn in plain blocks so the exploration ships no one else's work.
 */

export type ReferenceKind = "screens" | "flows" | "sections"

export type Platform = "web" | "ios"

/** What a phone screen in the samples shows. */
export type PhoneKind = "onboarding" | "paywall" | "settings" | "signup" | "empty" | "checkout" | "home"

/** A drawing of one screen: a web page by the explorations' kinds, or a phone screen. */
export type Shot = { platform: "web"; kind: ScreenKind } | { platform: "ios"; kind: PhoneKind }

export interface Reference {
  id: string
  kind: ReferenceKind
  platform: Platform
  app: string
  /** The app's color, for its drawing. */
  hue: number
  dark?: boolean
  /** A screen's or section's drawing; a flow's first step. */
  shot: Shot
  /** A flow's steps, in order, each with its caption. */
  steps?: { caption: string; shot: Shot }[]
  /** Words a search matches, beside the app's name. */
  tags: string[]
}

export const references: readonly Reference[] = [
  {
    id: "ledgerly-pricing",
    kind: "screens",
    platform: "web",
    app: "Ledgerly",
    hue: 150,
    shot: { platform: "web", kind: "marketing" },
    tags: ["pricing", "plans", "yearly", "toggle", "landing"]
  },
  {
    id: "northwind-dashboard",
    kind: "screens",
    platform: "web",
    app: "Northwind",
    hue: 260,
    shot: { platform: "web", kind: "dashboard" },
    tags: ["dashboard", "analytics", "chart", "overview"]
  },
  {
    id: "papertrail-docs",
    kind: "screens",
    platform: "web",
    app: "Papertrail",
    hue: 40,
    shot: { platform: "web", kind: "docs" },
    tags: ["docs", "documentation", "sidebar", "article"]
  },
  {
    id: "harbor-marketplace",
    kind: "screens",
    platform: "web",
    app: "Harbor",
    hue: 200,
    dark: true,
    shot: { platform: "web", kind: "marketplace" },
    tags: ["marketplace", "grid", "cards", "browse", "pricing"]
  },
  {
    id: "quill-chat",
    kind: "screens",
    platform: "web",
    app: "Quill",
    hue: 300,
    shot: { platform: "web", kind: "chat" },
    tags: ["chat", "messages", "inbox"]
  },
  {
    id: "tandem-collab",
    kind: "screens",
    platform: "web",
    app: "Tandem",
    hue: 20,
    shot: { platform: "web", kind: "collab" },
    tags: ["collaboration", "board", "team", "empty state"]
  },
  {
    id: "budgetbird-onboarding",
    kind: "screens",
    platform: "ios",
    app: "Budgetbird",
    hue: 150,
    shot: { platform: "ios", kind: "onboarding" },
    tags: ["onboarding", "welcome", "budget", "finance"]
  },
  {
    id: "lumen-paywall",
    kind: "screens",
    platform: "ios",
    app: "Lumen",
    hue: 280,
    dark: true,
    shot: { platform: "ios", kind: "paywall" },
    tags: ["paywall", "pricing", "subscription", "yearly", "trial"]
  },
  {
    id: "orbit-settings",
    kind: "screens",
    platform: "ios",
    app: "Orbit",
    hue: 220,
    shot: { platform: "ios", kind: "settings" },
    tags: ["settings", "preferences", "account"]
  },
  {
    id: "fernway-signup",
    kind: "screens",
    platform: "ios",
    app: "Fernway",
    hue: 120,
    shot: { platform: "ios", kind: "signup" },
    tags: ["sign up", "signup", "account", "onboarding"]
  },
  {
    id: "pocketlist-empty",
    kind: "screens",
    platform: "ios",
    app: "Pocketlist",
    hue: 30,
    shot: { platform: "ios", kind: "empty" },
    tags: ["empty state", "tasks", "first run"]
  },
  {
    id: "crate-checkout",
    kind: "screens",
    platform: "ios",
    app: "Crate",
    hue: 10,
    shot: { platform: "ios", kind: "checkout" },
    tags: ["checkout", "payment", "cart", "pricing"]
  },
  {
    id: "budgetbird-onboarding-flow",
    kind: "flows",
    platform: "ios",
    app: "Budgetbird",
    hue: 150,
    shot: { platform: "ios", kind: "onboarding" },
    steps: [
      { caption: "Welcome", shot: { platform: "ios", kind: "onboarding" } },
      { caption: "Create an account", shot: { platform: "ios", kind: "signup" } },
      { caption: "Pick a plan", shot: { platform: "ios", kind: "paywall" } },
      { caption: "First budget", shot: { platform: "ios", kind: "home" } }
    ],
    tags: ["onboarding", "welcome", "budget", "finance", "sign up"]
  },
  {
    id: "crate-checkout-flow",
    kind: "flows",
    platform: "ios",
    app: "Crate",
    hue: 10,
    shot: { platform: "ios", kind: "checkout" },
    steps: [
      { caption: "Cart", shot: { platform: "ios", kind: "home" } },
      { caption: "Payment", shot: { platform: "ios", kind: "checkout" } },
      { caption: "Order placed", shot: { platform: "ios", kind: "empty" } }
    ],
    tags: ["checkout", "payment", "cart", "pricing"]
  },
  {
    id: "ledgerly-trial-flow",
    kind: "flows",
    platform: "web",
    app: "Ledgerly",
    hue: 150,
    shot: { platform: "web", kind: "marketing" },
    steps: [
      { caption: "Pricing", shot: { platform: "web", kind: "marketing" } },
      { caption: "Start a trial", shot: { platform: "web", kind: "docs" } },
      { caption: "Workspace", shot: { platform: "web", kind: "dashboard" } }
    ],
    tags: ["pricing", "trial", "onboarding", "sign up", "yearly"]
  },
  {
    id: "northwind-pricing-section",
    kind: "sections",
    platform: "web",
    app: "Northwind",
    hue: 260,
    shot: { platform: "web", kind: "marketing" },
    tags: ["pricing", "plans", "yearly", "toggle"]
  },
  {
    id: "harbor-footer-section",
    kind: "sections",
    platform: "web",
    app: "Harbor",
    hue: 200,
    dark: true,
    shot: { platform: "web", kind: "marketplace" },
    tags: ["footer", "links", "pricing"]
  },
  {
    id: "quill-hero-section",
    kind: "sections",
    platform: "web",
    app: "Quill",
    hue: 300,
    shot: { platform: "web", kind: "chat" },
    tags: ["hero", "landing", "pricing"]
  }
]

/** The results a search shows: every word must match the app's name or a tag, in any order. */
export function search(query: string, kind: ReferenceKind, platform: Platform): Reference[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)

  return references.filter((each) => {
    if (each.kind !== kind || each.platform !== platform) {
      return false
    }

    const haystack = [each.app, ...each.tags].join(" ").toLowerCase()

    return words.every((word) => haystack.includes(word))
  })
}

/** A reference's size at 100%: a web page at a laptop's width, or a phone. */
export function naturalSize(platform: Platform, kind: ReferenceKind) {
  if (platform === "ios") {
    return { width: 390, height: 844 }
  }

  return kind === "sections" ? { width: 1440, height: 560 } : { width: 1440, height: 900 }
}
