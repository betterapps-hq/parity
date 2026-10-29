/** Made-up people, projects and activity for the start page, sign-in and notification explorations. */

export interface Person {
  name: string
  /** Hue for their avatar, in oklch degrees. */
  hue: number
  /** An agent rather than a person: it gets a sparkle instead of initials. */
  agent?: boolean
}

export const me: Person = { name: "Andrew Craswell", hue: 250 }

export const people = {
  maya: { name: "Maya Chen", hue: 330 },
  jonas: { name: "Jonas Weber", hue: 30 },
  priya: { name: "Priya Raman", hue: 162 },
  sam: { name: "Sam Okafor", hue: 80 },
  lena: { name: "Lena Fischer", hue: 290 },
  claude: { name: "Claude Code", hue: 270, agent: true },
  cursor: { name: "Cursor", hue: 30, agent: true }
} satisfies Record<string, Person>

export interface Organization {
  id: string
  name: string
  members: number
  hue: number
}

export const organizations: Organization[] = [
  { id: "buildkit", name: "Buildkit", members: 8, hue: 250 },
  { id: "personal", name: "Personal", members: 1, hue: 162 }
]

/** What a project's designs look like, for its thumbnail. */
export type ScreenKind = "marketing" | "dashboard" | "docs" | "game" | "library" | "chat" | "marketplace" | "collab"

export interface Project {
  id: string
  name: string
  org: string
  kind: ScreenKind
  /** Accent hue, in oklch degrees. */
  hue: number
  /** Where it lives: a repository or a folder on this computer. */
  source: { type: "github" | "azure" | "local"; path: string; branch?: string }
  designs: number
  edited: string
  editedBy: Person
  people: Person[]
  starred?: boolean
  /** Open in a tab right now. */
  open?: boolean
  /** Agents are working in it right now. */
  agents?: Person[]
}

export const projects: Project[] = [
  {
    id: "website",
    name: "Buildkit website",
    org: "buildkit",
    kind: "marketing",
    hue: 250,
    source: { type: "github", path: "buildkitgg/website", branch: "main" },
    designs: 14,
    edited: "12 min ago",
    editedBy: people.maya,
    people: [people.maya, people.priya, me],
    starred: true,
    open: true
  },
  {
    id: "dashboard",
    name: "Better Apps dashboard",
    org: "buildkit",
    kind: "dashboard",
    hue: 162,
    source: { type: "github", path: "buildkitgg/better-apps", branch: "feat/billing" },
    designs: 38,
    edited: "1 h ago",
    editedBy: people.claude,
    people: [people.jonas, people.sam, me],
    starred: true,
    agents: [people.claude]
  },
  {
    id: "example",
    name: "shadcn example",
    org: "personal",
    kind: "dashboard",
    hue: 300,
    source: { type: "local", path: "D:\\canvas\\examples\\shadcn-vite" },
    designs: 6,
    edited: "Yesterday",
    editedBy: me,
    people: [me]
  },
  {
    id: "spawnkit",
    name: "SpawnKit",
    org: "buildkit",
    kind: "game",
    hue: 30,
    source: { type: "azure", path: "buildkit/spawnkit", branch: "main" },
    designs: 21,
    edited: "2 days ago",
    editedBy: people.jonas,
    people: [people.jonas, people.lena]
  },
  {
    id: "docs",
    name: "Parity docs",
    org: "buildkit",
    kind: "docs",
    hue: 200,
    source: { type: "github", path: "buildkitgg/parity-docs", branch: "main" },
    designs: 9,
    edited: "3 days ago",
    editedBy: people.priya,
    people: [people.priya, me]
  },
  {
    id: "library",
    name: "Component library",
    org: "buildkit",
    kind: "library",
    hue: 280,
    source: { type: "github", path: "buildkitgg/ui", branch: "main" },
    designs: 52,
    edited: "Last week",
    editedBy: people.lena,
    people: [people.lena, people.maya, people.jonas, me]
  },
  {
    id: "copilot",
    name: "AI support copilot",
    org: "buildkit",
    kind: "chat",
    hue: 330,
    source: { type: "github", path: "buildkitgg/copilot", branch: "main" },
    designs: 11,
    edited: "Last week",
    editedBy: people.sam,
    people: [people.sam, people.cursor]
  },
  {
    id: "booking",
    name: "Booking app",
    org: "personal",
    kind: "marketplace",
    hue: 80,
    source: { type: "local", path: "D:\\code\\booking" },
    designs: 17,
    edited: "2 weeks ago",
    editedBy: me,
    people: [me]
  }
]

export interface Template {
  id: string
  name: string
  blurb: string
  kind: ScreenKind | "blank"
  hue: number
  stack: string[]
}

/** The Scaffolder's starting points, one per kind of app we support. */
export const templates: Template[] = [
  {
    id: "saas",
    name: "SaaS dashboard",
    blurb: "Teams, roles and billing, ready for customers",
    kind: "dashboard",
    hue: 162,
    stack: ["TanStack Start", "WorkOS", "Stripe", "D1"]
  },
  {
    id: "ai",
    name: "AI app",
    blurb: "Chat, agents and tools, streaming",
    kind: "chat",
    hue: 300,
    stack: ["AI SDK", "OpenRouter", "Neon"]
  },
  {
    id: "marketing",
    name: "Marketing site",
    blurb: "Landing pages, pricing and a blog",
    kind: "marketing",
    hue: 250,
    stack: ["TanStack Start", "MDX"]
  },
  {
    id: "docs",
    name: "Docs site",
    blurb: "Guides and API reference with search",
    kind: "docs",
    hue: 200,
    stack: ["Fumadocs", "TanStack Start"]
  },
  {
    id: "marketplace",
    name: "Marketplace",
    blurb: "Listings, bookings and payouts",
    kind: "marketplace",
    hue: 80,
    stack: ["Stripe Connect", "Neon", "Queues"]
  },
  {
    id: "collab",
    name: "Collaborative app",
    blurb: "Realtime rooms, presence and comments",
    kind: "collab",
    hue: 330,
    stack: ["Convex", "TanStack Start"]
  },
  {
    id: "library",
    name: "Component library",
    blurb: "A design system with its own Storybook",
    kind: "library",
    hue: 280,
    stack: ["shadcn", "Storybook"]
  },
  {
    id: "game",
    name: "Browser game",
    blurb: "A SpawnKit game with a level editor",
    kind: "game",
    hue: 30,
    stack: ["SpawnKit", "Vite"]
  }
]

export type ActivityKind = "mention" | "comment" | "agent" | "review" | "publish" | "invite" | "merge"

export interface Activity {
  id: string
  kind: ActivityKind
  who: Person
  project: string
  /** The design it's about, when it's about one. */
  design?: string
  /** What happened, after the person's name. */
  action: string
  /** A quote: the comment, or what the agent was asked to do. */
  quote?: string
  when: string
  day: "Today" | "Yesterday" | "This week"
  unread?: boolean
}

export const activity: Activity[] = [
  {
    id: "a1",
    kind: "mention",
    who: people.maya,
    project: "Better Apps dashboard",
    design: "Pricing",
    action: "mentioned you on",
    quote: "@Andrew can we drop the annual toggle here? It fights with the plan cards.",
    when: "8 min ago",
    day: "Today",
    unread: true
  },
  {
    id: "a2",
    kind: "comment",
    who: people.jonas,
    project: "SpawnKit",
    design: "Level select",
    action: "replied on",
    quote: "Pushed the new tiles. The locked state reads much better now.",
    when: "25 min ago",
    day: "Today",
    unread: true
  },
  {
    id: "a3",
    kind: "agent",
    who: people.claude,
    project: "Better Apps dashboard",
    action: "changed 4 designs in",
    quote: "Tighten the plan cards",
    when: "1 h ago",
    day: "Today"
  },
  {
    id: "a4",
    kind: "review",
    who: people.priya,
    project: "Parity docs",
    design: "Docs home",
    action: "asked you to review",
    when: "2 h ago",
    day: "Today",
    unread: true
  },
  {
    id: "a5",
    kind: "merge",
    who: people.sam,
    project: "Better Apps dashboard",
    action: "merged #142 Billing settings into main of",
    when: "Yesterday",
    day: "Yesterday"
  },
  {
    id: "a6",
    kind: "publish",
    who: people.lena,
    project: "Component library",
    action: "published Button, Toggle and Menu in",
    when: "Yesterday",
    day: "Yesterday"
  },
  {
    id: "a7",
    kind: "invite",
    who: people.sam,
    project: "AI support copilot",
    action: "invited you to",
    when: "Tuesday",
    day: "This week"
  }
]

export interface Repository {
  name: string
  owner: string
  updated: string
  private?: boolean
  /** Already opened in Parity. */
  inParity?: boolean
}

export const repositories: Record<"github" | "azure", Repository[]> = {
  github: [
    { owner: "buildkitgg", name: "better-apps", updated: "Updated 1 h ago", private: true, inParity: true },
    { owner: "buildkitgg", name: "website", updated: "Updated 3 h ago", inParity: true },
    { owner: "buildkitgg", name: "checkout", updated: "Updated yesterday", private: true },
    { owner: "buildkitgg", name: "status-page", updated: "Updated last week" }
  ],
  azure: [
    { owner: "buildkit", name: "spawnkit", updated: "Updated 2 days ago", private: true, inParity: true },
    { owner: "buildkit", name: "partner-portal", updated: "Updated last week", private: true }
  ]
}

/** The first letters of someone's first and last names. */
export function initials(person: Person): string {
  return person.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
}

export function organization(id: string): Organization {
  return organizations.find((candidate) => candidate.id === id)!
}
