/**
 * What each board delivers, as its project's code names it: the version, its components and the files they live in,
 * its tokens and their values, its states and sizes, and who approved and who's building it. Handoff, Inspect and What
 * changed all read from here, so they always name the same things.
 */
import { me, type Person, people } from "../explore-data.ts"
import { claudeTask, event } from "./data.ts"

const { maya, sam, lena, claude, priya } = people

/** A component on a board: its file, how often the board uses it, and how this version changes it. */
export interface Part {
  name: string
  file: string
  uses?: number
  /** New in this version, given new props, or only looking different because a token it uses changed. */
  change?: "New" | "New props" | "Follows --brand"
}

export interface Token {
  name: string
  value: string
  /** Its value before this version, when this version changed it. */
  was?: string
  added?: boolean
  /** The components that use it. */
  usedBy: string[]
}

/** A change made after the approved version, with the version it made. */
export interface Since {
  version: number
  who: Person
  when: string
  what: string
}

export interface Deliverable {
  project: string
  design: string
  /** The version this status is about: the one approved, being built, built, or asking for review. */
  version: number
  by: { who: Person; what: string; short: string }
  /** What this version asks the code for, in words. */
  asks: string
  parts: Part[]
  tokens: Token[]
  states: string[]
  sizes: string[]
  /** Changes made after the approved version, newest last. */
  since?: Since[]
  /** Who's building it, with their branch and pull request where the project uses git. */
  building?: { who: Person; branch?: string; pr?: { number: number; state: string } }
  /** The issue it's tracked in, where the org has a tracker. */
  issue?: string
}

/** The Cloud console's components that use its brand color, with their files. */
export const consoleFiles = {
  Brand: "src/app/Brand.tsx",
  SidebarLink: "src/app/Sidebar.tsx",
  Button: "src/ui/Button.tsx",
  PlanBadge: "src/billing/PlanBadge.tsx",
  UsageMeter: "src/billing/UsageMeter.tsx",
  PlanCard: "src/billing/PlanCard.tsx",
  StatCard: "src/overview/StatCard.tsx",
  UsageChart: "src/overview/UsageChart.tsx",
  AppRow: "src/overview/AppRow.tsx",
  SignInPanel: "src/auth/SignInPanel.tsx"
}

export type ConsolePart = keyof typeof consoleFiles

function following(...names: ConsolePart[]): Part[] {
  return names.map((name) => ({ name, file: consoleFiles[name], change: "Follows --brand" }))
}

const brand: Token = {
  name: "--brand",
  value: "oklch(0.62 0.15 158)",
  was: "oklch(0.6 0.17 250)",
  usedBy: Object.keys(consoleFiles)
}

const claudeReview = {
  by: {
    who: claude,
    what: `Claude Code, for Sam Okafor, asks for your review: “${claudeTask}”`,
    short: "Claude Code, for Sam"
  },
  asks: "The brand color goes from blue to green. No component changed; everything that uses the token follows it",
  tokens: [brand],
  building: { who: claude, branch: "claude/green-brand", pr: { number: 148, state: "open" } }
}

export const deliverables: Record<string, Deliverable> = {
  "spawnkit/Level select": {
    project: "spawnkit",
    design: "Level select",
    version: 8,
    by: { who: me, what: "You approved v8, 20 min ago", short: "You, 20 min ago" },
    asks: "Locked levels get their own tile, and stars move under each tile",
    parts: [
      { name: "LevelTile", file: "src/levels/LevelTile.tsx", uses: 9, change: "New props" },
      { name: "StarRating", file: "src/levels/StarRating.tsx", uses: 5, change: "New" },
      { name: "LevelPath", file: "src/levels/LevelPath.tsx", uses: 1 },
      { name: "GameHud", file: "src/hud/GameHud.tsx", uses: 1 },
      { name: "PlayButton", file: "src/ui/PlayButton.tsx", uses: 1 }
    ],
    tokens: [
      { name: "--tile-from", value: "oklch(0.78 0.17 49)", usedBy: ["LevelTile"] },
      { name: "--tile-to", value: "oklch(0.62 0.2 34)", usedBy: ["LevelTile"] },
      { name: "--tile-locked", value: "oklch(0.32 0.03 34)", added: true, usedBy: ["LevelTile"] },
      { name: "--tile-locked-foreground", value: "oklch(0.62 0.04 34)", added: true, usedBy: ["LevelTile"] },
      { name: "--star", value: "oklch(0.86 0.17 88)", usedBy: ["StarRating"] }
    ],
    states: ["Open", "Locked", "Cleared", "Current"],
    sizes: ["Phone", "Tablet"],
    building: { who: sam, branch: "feat/level-select", pr: { number: 151, state: "draft" } }
  },
  "copilot/Inbox": {
    project: "copilot",
    design: "Inbox",
    version: 21,
    by: { who: lena, what: "Lena Fischer approved v21 yesterday", short: "Lena, yesterday" },
    asks: "Unread threads get a dot, and the reply box stays pinned to the bottom",
    parts: [
      { name: "ThreadRow", file: "src/inbox/ThreadRow.tsx", uses: 8, change: "New props" },
      { name: "Composer", file: "src/inbox/Composer.tsx", uses: 1 },
      { name: "InboxList", file: "src/inbox/InboxList.tsx", uses: 1 }
    ],
    tokens: [{ name: "--unread", value: "oklch(0.7 0.15 250)", added: true, usedBy: ["ThreadRow"] }],
    states: ["Default", "Unread", "Empty"],
    sizes: ["Desktop"],
    issue: "KES-212 in Linear"
  },
  "website/Pricing": {
    project: "website",
    design: "Pricing",
    version: 12,
    by: { who: me, what: "You approved v12 yesterday", short: "You, yesterday" },
    asks: "Team keeps its savings badge, and the plan cards line up at every width",
    parts: [
      { name: "PlanCard", file: "src/components/pricing/plan-card.tsx", uses: 3, change: "New props" },
      { name: "BillingToggle", file: "src/components/pricing/billing-toggle.tsx", uses: 1 },
      { name: "PriceTag", file: "src/components/pricing/price-tag.tsx", uses: 3 }
    ],
    tokens: [{ name: "--savings", value: "oklch(0.78 0.15 162)", added: true, usedBy: ["PlanCard"] }],
    states: ["Monthly", "Yearly"],
    sizes: ["Desktop", "Phone"],
    since: [
      { version: 13, who: maya, when: "40 min ago", what: "Moved the billing toggle above the plan cards" },
      {
        version: 14,
        who: maya,
        when: event("maya-change").when,
        what: "Team's badge says Save 20% instead of Most popular"
      }
    ]
  },
  "spawnkit/In game": {
    project: "spawnkit",
    design: "In game",
    version: 5,
    by: { who: sam, what: "Sam Okafor built v5, 2 weeks ago", short: "Sam, 2 weeks ago" },
    asks: "The code moved the health bar to the top after v5 was built, in #139",
    parts: [
      { name: "HealthBar", file: "src/hud/HealthBar.tsx", uses: 1 },
      { name: "Hotbar", file: "src/hud/Hotbar.tsx", uses: 1 }
    ],
    tokens: [{ name: "--health", value: "oklch(0.68 0.22 25)", usedBy: ["HealthBar"] }],
    states: ["Playing", "Paused"],
    sizes: ["Phone"]
  },
  "dashboard/Billing": {
    project: "dashboard",
    design: "Billing",
    version: 43,
    ...claudeReview,
    parts: following("Brand", "SidebarLink", "Button", "PlanBadge", "UsageMeter", "PlanCard"),
    states: ["Default"],
    sizes: ["Desktop", "Phone"]
  },
  "dashboard/Overview": {
    project: "dashboard",
    design: "Overview",
    version: 43,
    ...claudeReview,
    parts: following("Brand", "SidebarLink", "Button", "StatCard", "UsageChart", "AppRow"),
    states: ["Default"],
    sizes: ["Desktop", "Phone"]
  },
  "dashboard/Sign in": {
    project: "dashboard",
    design: "Sign in",
    version: 43,
    ...claudeReview,
    parts: following("SignInPanel", "Brand", "Button"),
    states: ["Default", "Signing in"],
    sizes: ["Desktop"]
  },
  "docs/Docs home": {
    project: "docs",
    design: "Docs home",
    version: 3,
    by: { who: priya, what: "Priya Raman asks for your review", short: "Priya, 2 h ago" },
    asks: "A search field, and a getting started section",
    parts: [
      { name: "SearchField", file: "src/search/SearchField.tsx", uses: 1, change: "New" },
      { name: "GuideCard", file: "src/guides/GuideCard.tsx", uses: 4, change: "New" },
      { name: "DocsNav", file: "src/nav/DocsNav.tsx", uses: 1 }
    ],
    tokens: [],
    states: ["Default", "Searching", "No results"],
    sizes: ["Desktop", "Phone"]
  },
  "website/Home": {
    project: "website",
    design: "Home",
    version: 9,
    by: { who: sam, what: "Sam Okafor built v9 last week", short: "Sam, last week" },
    asks: "Built as approved",
    parts: [{ name: "Hero", file: "src/components/home/hero.tsx", uses: 1 }],
    tokens: [],
    states: ["Default"],
    sizes: ["Desktop", "Phone"]
  },
  "library/Components": {
    project: "library",
    design: "Components",
    version: 24,
    by: { who: lena, what: "Lena Fischer published Kestrel UI 2.4 yesterday", short: "Lena, yesterday" },
    asks: "Built as approved",
    parts: [{ name: "Toggle", file: "packages/ui/src/toggle.tsx", uses: 1 }],
    tokens: [],
    states: ["Default"],
    sizes: ["Desktop"]
  }
}

/** One board's deliverable, by project and design. */
export function deliverable(project: string, design: string): Deliverable {
  return deliverables[`${project}/${design}`]!
}
