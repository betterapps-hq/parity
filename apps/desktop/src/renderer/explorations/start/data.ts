/**
 * Made-up projects, stacks and templates for the second pass at the start page. People and organizations come from the
 * first pass, so every exploration shares one cast.
 */
import {
  Bird,
  Boxes,
  Flame,
  Gamepad2,
  HeartPulse,
  Layers,
  type LucideIcon,
  MessagesSquare,
  NotebookText,
  PawPrint,
  Rocket,
  ShoppingBag,
  Sparkles,
  Store,
  Swords,
  Users
} from "lucide-react"
import { me, type Organization, people, type Person } from "../explore-data.ts"

/** How a project's own app looks: its brand, and whether it's dark. Renders of its designs use it. */
export interface Look {
  /** The brand's hue, in oklch degrees. */
  hue: number
  /** The app's name, as its own header shows it. */
  brand: string
  icon: LucideIcon
  dark?: boolean
  /** Serif headings, for an app with a warmer voice. */
  serif?: boolean
  /** Black and white, with no brand color. */
  mono?: boolean
  /** The organization the app belongs to, as its own screens name it: the brand when left out. */
  org?: string
}

/** The kinds of screen the renders can draw. */
export type RenderKind =
  | "landing"
  | "pricing"
  | "overview"
  | "billing"
  | "signin"
  | "docs"
  | "inbox"
  | "levels"
  | "play"
  | "arena"
  | "components"
  | "listings"
  | "walker"
  | "board"

export interface Design {
  name: string
  kind: RenderKind
  /** Also designed for phones: thumbnails show that mode beside the desktop one. */
  mobile?: boolean
}

export type StackId = "tanstack-start" | "spawnkit" | "nextjs" | "react-library"

/** A made-up customer the samples belong to, as the portal's explorations use it, and your own projects. */
export const organizations = {
  kestrel: { id: "kestrel", name: "Kestrel", members: 8, hue: 200 },
  personal: { id: "personal", name: "Personal", members: 1, hue: 162 }
} satisfies Record<string, Organization>

export type OrgId = keyof typeof organizations

export interface StartProject {
  id: string
  name: string
  org: OrgId
  look: Look
  stack: StackId
  /** Where it lives: a repository or a folder on this computer. */
  source: { type: "github" | "azure" | "local"; path: string; branch?: string }
  /** Its designs, the one it opens on first. */
  designs: Design[]
  edited: string
  editedBy: Person
  people: Person[]
  starred?: boolean
  /** Open in a tab right now. */
  open?: boolean
  /** Shared with you by someone else. */
  shared?: boolean
  /** Someone working in it right now, and on what. */
  live?: { who: Person; doing: string }
  /** Comments waiting for you. */
  comments?: number
}

export const projects: StartProject[] = [
  {
    id: "dashboard",
    name: "Cloud console",
    org: "kestrel",
    look: { hue: 158, brand: "Kestrel Cloud", icon: Layers, org: "Kestrel" },
    stack: "tanstack-start",
    source: { type: "github", path: "kestrel/cloud-console", branch: "feat/billing" },
    designs: [
      { name: "Billing", kind: "billing", mobile: true },
      { name: "Overview", kind: "overview", mobile: true },
      { name: "Sign in", kind: "signin" }
    ],
    edited: "1 h ago",
    editedBy: people.claude,
    people: [people.jonas, people.sam, me],
    starred: true,
    open: true,
    live: { who: people.claude, doing: "Tighten the plan cards" },
    comments: 2
  },
  {
    id: "website",
    name: "Kestrel website",
    org: "kestrel",
    look: { hue: 268, brand: "Kestrel", icon: Bird, org: "Kestrel" },
    stack: "tanstack-start",
    source: { type: "github", path: "kestrel/website", branch: "main" },
    designs: [
      { name: "Home", kind: "landing", mobile: true },
      { name: "Pricing", kind: "pricing", mobile: true }
    ],
    edited: "12 min ago",
    editedBy: people.maya,
    people: [people.maya, people.priya, me],
    starred: true,
    open: true,
    live: { who: people.maya, doing: "Pricing" },
    comments: 1
  },
  {
    id: "walkies",
    name: "Walkies",
    org: "personal",
    look: { hue: 52, brand: "Walkies", icon: PawPrint, serif: true },
    stack: "tanstack-start",
    source: { type: "local", path: "D:\\code\\walkies" },
    designs: [
      { name: "Search", kind: "listings", mobile: true },
      { name: "Walker", kind: "walker" }
    ],
    edited: "20 min ago",
    editedBy: people.cursor,
    people: [me],
    live: { who: people.cursor, doing: "Draft the booking flow" }
  },
  {
    id: "spawnkit",
    name: "Ember Caves",
    org: "kestrel",
    look: { hue: 34, brand: "Ember Caves", icon: Flame, dark: true },
    stack: "spawnkit",
    source: { type: "github", path: "kestrel/ember-caves", branch: "tiles" },
    designs: [
      { name: "Level select", kind: "levels" },
      { name: "In game", kind: "play" }
    ],
    edited: "25 min ago",
    editedBy: people.jonas,
    people: [people.jonas, me],
    comments: 1
  },
  {
    id: "docs",
    name: "Help center",
    org: "kestrel",
    look: { hue: 276, brand: "Kestrel Help", icon: NotebookText, dark: true, org: "Kestrel" },
    stack: "tanstack-start",
    source: { type: "github", path: "kestrel/help-center", branch: "main" },
    designs: [{ name: "Docs home", kind: "docs" }],
    edited: "2 h ago",
    editedBy: people.priya,
    people: [people.priya, me]
  },
  {
    id: "status",
    name: "Status page",
    org: "kestrel",
    look: { hue: 150, brand: "Kestrel Status", icon: HeartPulse, org: "Kestrel" },
    stack: "tanstack-start",
    source: { type: "github", path: "kestrel/status-page", branch: "incidents" },
    designs: [{ name: "Status", kind: "overview", mobile: true }],
    edited: "3 h ago",
    editedBy: people.lena,
    people: [people.lena, people.jonas, me]
  },
  {
    id: "copilot",
    name: "Relay",
    org: "kestrel",
    look: { hue: 312, brand: "Relay", icon: MessagesSquare, dark: true, org: "Kestrel" },
    stack: "tanstack-start",
    source: { type: "github", path: "kestrel/relay", branch: "main" },
    designs: [
      { name: "Inbox", kind: "inbox" },
      { name: "Sign in", kind: "signin" }
    ],
    edited: "Yesterday",
    editedBy: people.sam,
    people: [people.sam, people.lena],
    shared: true
  },
  {
    id: "library",
    name: "Kestrel UI",
    org: "kestrel",
    look: { hue: 255, brand: "Kestrel UI", icon: Boxes, org: "Kestrel" },
    stack: "react-library",
    source: { type: "azure", path: "kestrel/ui", branch: "main" },
    designs: [{ name: "Components", kind: "components" }],
    edited: "3 days ago",
    editedBy: people.lena,
    people: [people.lena, people.maya, me],
    starred: true
  },
  {
    id: "standup",
    name: "Standup",
    org: "kestrel",
    look: { hue: 205, brand: "Standup", icon: Users, org: "Kestrel" },
    stack: "tanstack-start",
    source: { type: "github", path: "kestrel/standup", branch: "main" },
    designs: [{ name: "Retro board", kind: "board" }],
    edited: "4 days ago",
    editedBy: people.priya,
    people: [people.priya, people.jonas, people.lena],
    shared: true
  },
  {
    id: "onboarding",
    name: "Onboarding",
    org: "kestrel",
    look: { hue: 230, brand: "Kestrel Cloud", icon: Rocket, org: "Kestrel" },
    stack: "tanstack-start",
    source: { type: "github", path: "kestrel/onboarding", branch: "main" },
    designs: [
      { name: "Sign up", kind: "signin" },
      { name: "Welcome", kind: "landing", mobile: true }
    ],
    edited: "5 days ago",
    editedBy: people.sam,
    people: [people.sam, people.priya, me]
  },
  {
    id: "arena",
    name: "Arena prototype",
    org: "personal",
    look: { hue: 200, brand: "Arena", icon: Swords, dark: true },
    stack: "spawnkit",
    source: { type: "local", path: "D:\\code\\arena" },
    designs: [{ name: "Round", kind: "arena" }],
    edited: "Last week",
    editedBy: me,
    people: [me]
  }
]

export function project(id: string): StartProject {
  return projects.find((candidate) => candidate.id === id)!
}

/** Where you were last in an organization's projects, and what happened there since. */
export interface Visit {
  project: string
  design: string
  when: string
  since: { who: Person; text: string }[]
}

export const lastVisits: Record<OrgId, Visit> = {
  kestrel: {
    project: "dashboard",
    design: "Billing",
    when: "Yesterday at 6:40 PM",
    since: [
      { who: people.claude, text: "changed 4 designs" },
      { who: people.maya, text: "left 2 comments" },
      { who: people.jonas, text: "pushed 3 commits" }
    ]
  },
  personal: {
    project: "walkies",
    design: "Search",
    when: "Today at 9:12 AM",
    since: [{ who: people.cursor, text: "changed 2 designs" }]
  }
}

export type ForYouKind = "agent" | "mention" | "review" | "reply" | "invite"

/** What needs you, most pressing first. */
export interface ForYouItem {
  id: string
  kind: ForYouKind
  who: Person
  action: string
  design?: string
  project: string
  quote?: string
  when: string
  /** The one thing to do about it. */
  act: string
  unread?: boolean
}

export const forYou: ForYouItem[] = [
  {
    id: "cursor-question",
    kind: "agent",
    who: people.cursor,
    action: "is waiting on you in",
    project: "Walkies",
    quote: "Should bookings take payment up front, or after the walk?",
    when: "20 min ago",
    act: "Answer",
    unread: true
  },
  {
    id: "maya-mention",
    kind: "mention",
    who: people.maya,
    action: "mentioned you on",
    design: "Pricing",
    project: "Kestrel website",
    quote: "@Andrew can we drop the annual toggle? It fights with the plan cards.",
    when: "8 min ago",
    act: "Reply",
    unread: true
  },
  {
    id: "priya-review",
    kind: "review",
    who: people.priya,
    action: "asked you to review",
    design: "Docs home",
    project: "Help center",
    when: "2 h ago",
    act: "Review",
    unread: true
  },
  {
    id: "jonas-reply",
    kind: "reply",
    who: people.jonas,
    action: "replied on",
    design: "Level select",
    project: "Ember Caves",
    quote: "Pushed the new tiles. The locked state reads much better now.",
    when: "25 min ago",
    act: "Open"
  },
  {
    id: "sam-invite",
    kind: "invite",
    who: people.sam,
    action: "invited you to",
    project: "Relay",
    when: "Yesterday",
    act: "Join"
  }
]

/** A framework and its mode, which the Scaffolder builds templates on. */
export interface Stack {
  id: StackId
  name: string
  summary: string
  /** Initials for its mark. */
  mark: string
  hue: number
  /** Modes a template can offer, such as server rendering or a game's renderer. */
  modes: string[]
  /** What every template on this stack starts with. */
  includes: string[]
}

export const stacks: Stack[] = [
  {
    id: "tanstack-start",
    name: "TanStack Start",
    summary: "Full-stack React apps with server functions, deployed to Cloudflare.",
    mark: "TS",
    hue: 162,
    modes: ["Server rendered", "Single page"],
    includes: ["TanStack Router, Query and Form", "shadcn/ui on Base UI", "Tailwind CSS", "Zod", "Vitest", "Vite+"]
  },
  {
    id: "spawnkit",
    name: "SpawnKit",
    summary: "Browser games, with the renderer of your choice.",
    mark: "SK",
    hue: 34,
    modes: ["Phaser", "Pixi", "Three.js", "Babylon.js"],
    includes: ["Vite", "Vitest", "Playwright", "Game telemetry"]
  },
  {
    id: "react-library",
    name: "React library",
    summary: "Components and design systems, published to npm.",
    mark: "R",
    hue: 220,
    modes: [],
    includes: ["Storybook", "tsdown", "Vitest", "beachball"]
  },
  {
    id: "nextjs",
    name: "Next.js",
    summary: "React apps on the App Router.",
    mark: "N",
    hue: 0,
    modes: ["App Router"],
    includes: ["shadcn/ui", "Tailwind CSS", "Vitest"]
  }
]

export function stack(id: StackId): Stack {
  return stacks.find((candidate) => candidate.id === id)!
}

/** Who an app is for, which picks its sign-in and billing, as the stack guide recommends. */
export const audiences = [
  { id: "b2b", name: "Companies and their teams", signIn: "WorkOS", billing: "Stripe Billing, per organization" },
  { id: "b2c", name: "People, one at a time", signIn: "Clerk", billing: "Stripe Checkout, per person" },
  { id: "internal", name: "Your own team", signIn: "Better Auth", billing: "None" }
] as const

export type AudienceId = (typeof audiences)[number]["id"]

export interface Template {
  id: string
  name: string
  blurb: string
  stack: StackId
  /** The designs it starts with, drawn in its look. */
  designs: Design[]
  look: Look
  /** What it adds to the stack, on top of what every template there has. */
  adds: string[]
  audience?: AudienceId
  database?: string
  jobs?: string
  mode?: string
}

const starter = (hue: number, icon: LucideIcon, dark = false): Look => ({ hue, brand: "Acme", icon, dark })

export const templates: Template[] = [
  {
    id: "saas",
    name: "SaaS dashboard",
    blurb: "Teams, roles, billing and settings",
    stack: "tanstack-start",
    designs: [
      { name: "Overview", kind: "overview", mobile: true },
      { name: "Billing", kind: "billing", mobile: true },
      { name: "Sign in", kind: "signin" }
    ],
    look: starter(250, Layers),
    adds: ["WorkOS", "Stripe Billing", "D1", "TanStack Table", "shadcn Charts"],
    audience: "b2b",
    database: "Cloudflare D1",
    jobs: "Queues and Workflows"
  },
  {
    id: "ai",
    name: "AI app",
    blurb: "Chat with tools and streaming, traced",
    stack: "tanstack-start",
    designs: [
      { name: "Inbox", kind: "inbox" },
      { name: "Sign in", kind: "signin" }
    ],
    look: starter(292, Sparkles, true),
    adds: ["AI SDK", "OpenRouter", "Neon with pgvector", "Langfuse", "Trigger.dev"],
    audience: "b2b",
    database: "Neon",
    jobs: "Trigger.dev"
  },
  {
    id: "marketing",
    name: "Marketing site",
    blurb: "Landing, pricing and a blog",
    stack: "tanstack-start",
    designs: [
      { name: "Home", kind: "landing", mobile: true },
      { name: "Pricing", kind: "pricing", mobile: true }
    ],
    look: starter(18, Rocket),
    adds: ["react-markdown", "Motion"],
    database: "None",
    jobs: "None"
  },
  {
    id: "marketplace",
    name: "Marketplace",
    blurb: "Listings, bookings and payouts",
    stack: "tanstack-start",
    designs: [
      { name: "Search", kind: "listings", mobile: true },
      { name: "Listing", kind: "walker" }
    ],
    look: { hue: 150, brand: "Acme", icon: Store, serif: true },
    adds: ["Neon", "Stripe Connect", "Queues", "Novu"],
    audience: "b2c",
    database: "Neon",
    jobs: "Queues and Workflows"
  },
  {
    id: "collab",
    name: "Collaborative app",
    blurb: "Shared boards, live cursors and comments",
    stack: "tanstack-start",
    designs: [{ name: "Board", kind: "board" }],
    look: starter(205, Users),
    adds: ["Convex", "Tiptap", "Durable Objects"],
    audience: "b2b",
    database: "Convex",
    jobs: "Convex scheduler"
  },
  {
    id: "docs",
    name: "Docs site",
    blurb: "Guides and API reference, with search",
    stack: "tanstack-start",
    designs: [{ name: "Docs page", kind: "docs" }],
    look: starter(160, NotebookText, true),
    adds: ["Fumadocs", "Orama search"],
    database: "None",
    jobs: "None"
  },
  {
    id: "platformer",
    name: "Platformer",
    blurb: "Tiles, physics and a level select",
    stack: "spawnkit",
    designs: [
      { name: "In game", kind: "play" },
      { name: "Level select", kind: "levels" }
    ],
    look: starter(34, Gamepad2, true),
    adds: ["Arcade physics", "HTML UI"],
    mode: "Phaser"
  },
  {
    id: "arena",
    name: "3D arena",
    blurb: "A physics arena with a follow camera",
    stack: "spawnkit",
    designs: [{ name: "Round", kind: "arena" }],
    look: starter(200, Swords, true),
    adds: ["Rapier 3D", "HTML UI"],
    mode: "Three.js"
  },
  {
    id: "map",
    name: "World map",
    blurb: "Levels on a map, with stars and saves",
    stack: "spawnkit",
    designs: [{ name: "Level select", kind: "levels" }],
    look: starter(280, Flame, true),
    adds: ["Pixi UI", "Saves"],
    mode: "Pixi"
  },
  {
    id: "library",
    name: "Component library",
    blurb: "Components, tokens and docs, published to npm",
    stack: "react-library",
    designs: [{ name: "Components", kind: "components" }],
    look: starter(255, Boxes),
    adds: ["Storybook docs", "Design tokens"]
  },
  {
    id: "next-starter",
    name: "App Router starter",
    blurb: "Pages, layouts and a landing page",
    stack: "nextjs",
    designs: [{ name: "Home", kind: "landing", mobile: true }],
    look: { ...starter(0, ShoppingBag), mono: true },
    adds: ["Server actions"]
  }
]

export function templatesOn(id: StackId): Template[] {
  return templates.filter((template) => template.stack === id)
}

export interface Repository {
  name: string
  description: string
  /** The stack Parity found in it, or nothing when there's no React app to open. */
  detected?: string
  updated: string
  /** Already a project in Parity. */
  inParity?: boolean
}

/** Repositories on the connected accounts. */
export const repositories: Record<"github" | "azure", { account: string; repos: Repository[] }> = {
  github: {
    account: "kestrel",
    repos: [
      {
        name: "status-page",
        description: "Uptime and incidents for Kestrel Cloud",
        detected: "Vite and React",
        updated: "2 h ago",
        inParity: true
      },
      {
        name: "cloud-console",
        description: "The console customers run their apps from",
        detected: "TanStack Start",
        updated: "1 h ago",
        inParity: true
      },
      {
        name: "website",
        description: "kestrel.dev",
        detected: "TanStack Start",
        updated: "12 min ago",
        inParity: true
      },
      {
        name: "partner-portal",
        description: "Where resellers track their customers",
        detected: "Next.js",
        updated: "3 days ago"
      },
      { name: "edge-router", description: "Routes requests to the nearest region", updated: "Yesterday" },
      { name: "terraform", description: "Infrastructure for every environment", updated: "Last week" }
    ]
  },
  azure: {
    account: "kestrel / Platform",
    repos: [
      { name: "ui", description: "Kestrel UI", detected: "React library", updated: "3 days ago", inParity: true },
      {
        name: "admin-portal",
        description: "Support tools for the platform team",
        detected: "Vite and React",
        updated: "5 days ago"
      },
      { name: "billing-service", description: "Invoices and usage metering", updated: "Yesterday" }
    ]
  }
}
