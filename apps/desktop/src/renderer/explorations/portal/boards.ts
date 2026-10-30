/**
 * What each board delivers, as its project's code names it: the version, its page, its components and the files they
 * live in, its tokens and their values, its states and sizes, who approved it, and who's writing its code. Handoff,
 * Inspect and What changed all read from here, so they always name the same things.
 */
import { me, type Person, people } from "../explore-data.ts"
import { claudeTask, event, handoff } from "./data.ts"

const { maya, sam, lena, claude, priya, jonas } = people

/** A component on a board: its file, how often the board uses it, and how this version changes it. */
export interface Part {
  name: string
  /** Its file, or for a library's component, the package it comes from. */
  file: string
  /** The library and version it comes from, when it isn't the project's own. */
  library?: string
  uses?: number
  /** New in this version, given new props, or only looking different because a token it uses changed. */
  change?: "New" | "New props" | "Changed" | "Follows --brand"
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

/**
 * A version made after the approved one. Every change makes a version, but only one its designer marks ready, asking
 * a reviewer, moves the board's status or reaches whoever's building it; the rest are drafts.
 */
export interface Since {
  version: number
  who: Person
  when: string
  what: string
  /** Marked ready for review, with who reviews it. */
  ready?: { reviewer: Person }
}

export interface PullRequest {
  number: number
  state: string
}

/**
 * The code side of a board. Building: someone picked up the approved version. Built: the code draws it as designed.
 * Made with the design: an agent changed the design and its code together, so approving it leaves only a merge.
 */
export interface Code {
  who: Person
  doing: "Building" | "Built" | "Made with the design"
  when: string
  branch?: string
  pr?: PullRequest
}

export interface Deliverable {
  project: string
  design: string
  /**
   * The version this status is about: the one approved, being built, built, or asking for review. Each board has its
   * own versions, and is approved on its own.
   */
  version: number
  /** The version approved before this one, for a board in review. */
  approvedBefore?: number
  /** Who approved this version. A board in review has `review` instead. */
  approved?: { who: Person; when: string }
  /** Who asked for a review of this version, and who it waits on, while it's in review. */
  review?: { who: Person; when: string; for?: Person; reviewer: Person }
  /** What this version asks the code for, in words. */
  asks: string
  /** The page or route the board is, as a file. */
  page: string
  parts: Part[]
  tokens: Token[]
  states: string[]
  sizes: string[]
  /** Changes made after the approved version, newest last. */
  since?: Since[]
  code?: Code
  /** The issue it's tracked in, where the org has a tracker. */
  issue?: string
  /** What the designer wants the builder to know that the board can't show. */
  notes?: { who: Person; text: string }
  /** For code that's moved away from its design: the pull request that moved it. */
  drift?: { who: Person; when: string; pr: PullRequest }
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
  review: { who: claude, when: event("claude-run").when, for: sam, reviewer: me },
  asks: `${claudeTask}: the brand color goes from blue to green. No component changed; everything that uses the token follows it`,
  tokens: [brand],
  code: {
    who: claude,
    doing: "Made with the design",
    when: event("claude-run").when,
    branch: "claude/green-brand",
    pr: { number: 148, state: "open" }
  }
} satisfies Partial<Deliverable>

export const deliverables: Record<string, Deliverable> = {
  "spawnkit/Level select": {
    project: "spawnkit",
    design: "Level select",
    version: 8,
    approved: { who: me, when: "20 min ago" },
    asks: "Locked levels get their own tile, and stars move under each tile",
    page: "src/routes/levels.tsx",
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
    code: {
      who: sam,
      doing: "Building",
      when: "10 min ago",
      branch: "feat/level-select",
      pr: { number: 151, state: "draft" }
    },
    notes: {
      who: jonas,
      text: "Locked tiles ignore taps and show the lock instead of the number. Every played tile has its stars under it, even 0; the current one has none until it's played."
    }
  },
  "copilot/Inbox": {
    project: "copilot",
    design: "Inbox",
    version: 21,
    approved: { who: lena, when: "yesterday" },
    asks: "Unread threads get a dot, and the reply box stays pinned to the bottom",
    page: "src/routes/inbox.tsx",
    parts: [
      { name: "ThreadRow", file: "src/inbox/ThreadRow.tsx", uses: 8, change: "New props" },
      { name: "Composer", file: "src/inbox/Composer.tsx", uses: 1 },
      { name: "InboxList", file: "src/inbox/InboxList.tsx", uses: 1 },
      { name: "Toggle", file: "@kestrel/ui", library: "Kestrel UI 2.3", uses: 1 }
    ],
    tokens: [{ name: "--unread", value: "oklch(0.7 0.15 250)", added: true, usedBy: ["ThreadRow"] }],
    states: ["Default", "Unread", "Empty"],
    sizes: ["Desktop"],
    issue: "Linear KES-212"
  },
  "website/Pricing": {
    project: "website",
    design: "Pricing",
    version: 12,
    approved: { who: me, when: "yesterday" },
    asks: "Three plans side by side. Team's card says Save 20%, and Compare all plans sits under the cards",
    page: "src/app/pricing/page.tsx",
    parts: [
      { name: "PlanCard", file: "src/components/pricing/plan-card.tsx", uses: 3, change: "New props" },
      { name: "ComparePlansLink", file: "src/components/pricing/compare-plans-link.tsx", uses: 1, change: "New" },
      { name: "BillingToggle", file: "src/components/pricing/billing-toggle.tsx", uses: 1 }
    ],
    tokens: [{ name: "--savings", value: "oklch(0.72 0.15 162)", added: true, usedBy: ["PlanCard"] }],
    states: ["Monthly", "Yearly"],
    sizes: ["Desktop", "Phone"],
    since: [
      { version: 13, who: maya, when: "40 min ago", what: "Moved Save 20% from Team's card into the billing toggle" },
      {
        version: 14,
        who: maya,
        when: event("maya-change").when,
        what: "Made Team's card Most popular, and took out Compare all plans",
        ready: { reviewer: priya }
      }
    ],
    code: {
      who: me,
      doing: "Building",
      when: "yesterday",
      branch: "pricing-plans",
      pr: { number: 150, state: "draft" }
    }
  },
  "spawnkit/In game": {
    project: "spawnkit",
    design: "In game",
    version: 5,
    approved: { who: lena, when: "3 weeks ago" },
    asks: "The score at the top left, and the hearts in a pill at the bottom left, both over the level",
    page: "src/routes/play.tsx",
    parts: [
      { name: "HealthBar", file: "src/hud/HealthBar.tsx", uses: 1 },
      { name: "GameHud", file: "src/hud/GameHud.tsx", uses: 1 },
      { name: "Hotbar", file: "src/hud/Hotbar.tsx", uses: 1 }
    ],
    tokens: [{ name: "--health", value: "oklch(0.68 0.22 25)", usedBy: ["HealthBar"] }],
    states: ["Playing", "Paused"],
    sizes: ["Phone"],
    code: { who: sam, doing: "Built", when: "2 weeks ago", pr: { number: 128, state: "merged" } },
    drift: { who: sam, when: "9 days ago", pr: { number: 139, state: "merged" } }
  },
  "dashboard/Billing": {
    project: "dashboard",
    design: "Billing",
    version: 19,
    approvedBefore: 18,
    ...claudeReview,
    page: "src/routes/billing.tsx",
    parts: [
      ...following("Brand", "SidebarLink", "Button", "PlanBadge", "UsageMeter", "PlanCard"),
      { name: "Toggle", file: "@kestrel/ui", library: "Kestrel UI 2.3", uses: 1 }
    ],
    states: ["Default"],
    sizes: ["Desktop", "Phone"]
  },
  "dashboard/Overview": {
    project: "dashboard",
    design: "Overview",
    version: 12,
    approvedBefore: 11,
    ...claudeReview,
    page: "src/routes/overview.tsx",
    parts: following("Brand", "SidebarLink", "Button", "StatCard", "UsageChart", "AppRow"),
    states: ["Default"],
    sizes: ["Desktop", "Phone"]
  },
  "dashboard/Sign in": {
    project: "dashboard",
    design: "Sign in",
    version: 7,
    approvedBefore: 6,
    ...claudeReview,
    page: "src/routes/sign-in.tsx",
    parts: following("SignInPanel", "Brand", "Button"),
    states: ["Default", "Signing in"],
    sizes: ["Desktop"]
  },
  "docs/Docs home": {
    project: "docs",
    design: "Docs home",
    version: 3,
    review: { who: priya, when: event("priya-review").when, reviewer: me },
    asks: "A search field, and a getting started section",
    page: "src/pages/index.tsx",
    parts: [
      { name: "SearchField", file: "src/search/SearchField.tsx", uses: 1, change: "New" },
      { name: "GuideCard", file: "src/guides/GuideCard.tsx", uses: 4, change: "New" },
      { name: "DocsNav", file: "src/nav/DocsNav.tsx", uses: 1 },
      { name: "Toggle", file: "@kestrel/ui", library: "Kestrel UI 2.4", uses: 1 }
    ],
    tokens: [],
    states: ["Default", "Searching", "No results"],
    sizes: ["Desktop", "Phone"]
  },
  "website/Home": {
    project: "website",
    design: "Home",
    version: 9,
    approved: { who: me, when: "2 weeks ago" },
    asks: "Built as approved",
    page: "src/app/page.tsx",
    parts: [{ name: "Hero", file: "src/components/home/hero.tsx", uses: 1 }],
    tokens: [],
    states: ["Default"],
    sizes: ["Desktop", "Phone"],
    code: { who: sam, doing: "Built", when: "last week", pr: { number: 131, state: "merged" } }
  },
  "library/Components": {
    project: "library",
    design: "Components",
    version: 31,
    approved: { who: maya, when: "2 days ago" },
    asks: "Built as approved, and published in Kestrel UI 2.4",
    page: "packages/ui/src/index.ts",
    parts: [
      { name: "Toggle", file: "packages/ui/src/toggle.tsx", uses: 3, change: "New props" },
      { name: "Button", file: "packages/ui/src/button.tsx", uses: 4, change: "Changed" },
      { name: "Menu", file: "packages/ui/src/menu.tsx", uses: 1, change: "Changed" }
    ],
    tokens: [],
    states: ["Default"],
    sizes: ["Desktop"],
    code: { who: lena, doing: "Built", when: "yesterday" }
  }
}

/** How many boards were approved this week, from Monday, October 26, in some projects or all of them. */
export function approvedThisWeek(projects?: string[]): number {
  return Object.values(deliverables).filter(
    (board) =>
      (!projects || projects.includes(board.project)) &&
      board.approved &&
      /min ago|h ago|yesterday|^[23] days ago$/.test(board.approved.when)
  ).length
}

/**
 * What Handoff's nav counts: boards ready for anyone to pick up, reviews waiting on you, and boards that changed under
 * you while you build them. It's every row that says you, or anyone, can act now.
 */
export const handoffWaiting = Object.values(deliverables).filter((board) => {
  const status = handoff[`${board.project}/${board.design}`]
  if (status === "Ready to build") return true
  if (status === "In review") return board.review?.reviewer === me
  return status === "Changed since approval" && board.code?.who === me
}).length

/** How many boards' code was built as designed this week, from Monday, October 26. */
export const builtThisWeek = Object.values(deliverables).filter(
  (board) => board.code?.doing === "Built" && /min ago|h ago|yesterday|^[23] days ago$/.test(board.code.when)
).length

/** One board's deliverable, by project and design. */
export function deliverable(project: string, design: string): Deliverable {
  return deliverables[`${project}/${design}`]!
}
