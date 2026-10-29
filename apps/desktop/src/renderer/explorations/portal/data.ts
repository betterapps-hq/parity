/**
 * The portal's sample org: a made-up customer, Kestrel, using Parity on the web. It shares the explorations' cast and
 * the start page's projects, renamed so the org reads as a customer's. Every screen draws from the same events and
 * board statuses here, so they agree with each other.
 */
import { type Activity, me, type Organization, people, type Person } from "../explore-data.ts"
import { type Design, project, type StartProject } from "../start/data.ts"

export const kestrel: Organization = { id: "kestrel", name: "Kestrel", members: 8, hue: 200 }

const renamed: Record<string, { name: string; brand: string; first?: string }> = {
  // Its landing page carries the start page's own tagline, so it opens on Pricing.
  website: { name: "Kestrel website", brand: "Kestrel", first: "Pricing" },
  dashboard: { name: "Cloud console", brand: "Kestrel Cloud" },
  docs: { name: "Help center", brand: "Kestrel Help" },
  library: { name: "Kestrel UI", brand: "Kestrel UI" },
  spawnkit: { name: "Ember Caves", brand: "Ember Caves" },
  copilot: { name: "Relay", brand: "Relay" }
}

/**
 * A start page project as the portal names it. Nothing is "open in a tab" on the web, and who's in it comes from
 * where people are now, so a card never disagrees with Working now.
 */
export function portalProject(id: string): StartProject {
  const here = workingNow.find((where) => where.project === id && !where.away)
  const shown = { ...project(id), open: false, live: here && { who: here.who, doing: here.doing } }
  const names = renamed[id]
  if (!names) return shown
  const first = shown.designs.filter((design) => design.name === names.first)
  const designs = [...first, ...shown.designs.filter((design) => !first.includes(design))]
  return { ...shown, name: names.name, look: { ...shown.look, brand: names.brand, org: kestrel.name }, designs }
}

/** One of a project's designs, by name. */
export function designOf(shown: StartProject, name: string): Design {
  return shown.designs.find((design) => design.name === name) ?? shown.designs[0]!
}

export interface Team {
  org: Organization
  people: Person[]
  /** Project ids. */
  projects: string[]
}

function team(id: string, name: string, hue: number, members: Person[], projects: string[]): Team {
  return { org: { id, name, members: members.length, hue }, people: members, projects }
}

export const teams = {
  apps: team("apps", "Apps", 162, [me, people.jonas, people.sam, people.lena], ["dashboard", "spawnkit", "copilot"]),
  web: team("web", "Web", 250, [me, people.maya, people.priya], ["website", "docs"]),
  system: team("system", "Design system", 280, [people.lena, people.maya], ["library"])
}

/**
 * Where a board stands between design and code, from Parity's own versions, so it works without git. In review:
 * someone asked for a review. Ready to build: a version was approved and isn't built yet. Changed since approval:
 * edited after the approved version, so it needs another look first. Built: the project's code draws the approved
 * version as designed. Code differs: the code changed after it was built. Branches and pull requests show too, where a
 * project has them.
 */
export type Handoff = "In review" | "Ready to build" | "Changed since approval" | "Built" | "Code differs"

export const handoff: Record<string, Handoff> = {
  "dashboard/Billing": "In review",
  "dashboard/Overview": "In review",
  "dashboard/Sign in": "In review",
  "website/Pricing": "Changed since approval",
  "website/Home": "Built",
  "spawnkit/Level select": "Ready to build",
  "spawnkit/In game": "Code differs",
  "docs/Docs home": "In review",
  "copilot/Inbox": "Ready to build",
  "library/Components": "Built"
}

/** How many boards are ready to build, as the nav and the week's numbers count them. */
export const readyToBuild = Object.values(handoff).filter((status) => status === "Ready to build").length

/** Where someone is right now: the project and design, and what they're doing there. */
export interface Whereabouts {
  who: Person
  project: string
  design: string
  doing: string
  /** For an agent: who started it. Agents are people's own, so they work for someone. */
  for?: Person
  /** How long since they left, when they're not in a project now. */
  away?: string
}

/** Your teammates and their agents, where they are now. */
export const workingNow: Whereabouts[] = [
  { who: people.maya, project: "website", design: "Pricing", doing: "Editing the plan cards" },
  { who: people.claude, project: "website", design: "Pricing", doing: "Try shorter plan names at 360", for: me },
  { who: people.jonas, project: "spawnkit", design: "In game", doing: "Checking Cursor's tiles" },
  { who: people.cursor, project: "spawnkit", design: "In game", doing: "Place the new tiles", for: people.jonas },
  { who: people.sam, project: "dashboard", design: "Overview", doing: "Reviewing the usage chart" },
  { who: people.priya, project: "docs", design: "Docs home", doing: "Left a review", away: "2 h ago" }
]

/** Kestrel's projects, most recently edited first. */
export const orgProjects = ["website", "spawnkit", "dashboard", "docs", "copilot", "library", "standup"].map(
  portalProject
)

/** Something that happened, as every list draws it. */
export interface PortalEvent extends Activity {
  /** How long ago, in minutes: every list sorts by it, newest first. */
  ago: number
  /** It's waiting on you, so it's in Needs you and the inbox until it's done. */
  needsYou?: boolean
  /** Which team's projects it's in. */
  team?: keyof typeof teams
}

const { maya, jonas, priya, sam, lena, claude, cursor } = people
export const noah = { name: "Noah Park", hue: 210 }

/** What Sam asked Claude Code to do in the Cloud console, which it now wants reviewed. */
export const claudeTask = "Move the console to the green brand"

/** Everything that happened in Kestrel lately, newest first. */
export const events: PortalEvent[] = [
  {
    id: "maya-mention",
    ago: 8,
    kind: "mention",
    who: maya,
    project: "Kestrel website",
    design: "Pricing",
    action: "mentioned you on",
    quote: "@Andrew can we drop the annual toggle here? It fights with the plan cards.",
    when: "8 min ago",
    day: "Today",
    unread: true,
    needsYou: true,
    team: "web"
  },
  {
    id: "maya-change",
    ago: 12,
    kind: "publish",
    who: maya,
    project: "Kestrel website",
    design: "Pricing",
    action: "changed",
    when: "12 min ago",
    day: "Today",
    team: "web"
  },
  {
    id: "cursor-question",
    ago: 20,
    kind: "agent",
    who: cursor,
    project: "Help center",
    design: "Docs home",
    action: "is waiting on you on",
    quote: "Should search results open in a panel, or on their own page?",
    when: "20 min ago",
    day: "Today",
    unread: true,
    needsYou: true,
    team: "web"
  },
  {
    id: "jonas-reply",
    ago: 25,
    kind: "comment",
    who: jonas,
    project: "Ember Caves",
    design: "Level select",
    action: "replied to you on",
    quote: "Pushed the new tiles. The locked state reads much better now.",
    when: "25 min ago",
    day: "Today",
    unread: true,
    team: "apps"
  },
  {
    id: "maya-comment",
    ago: 40,
    kind: "comment",
    who: maya,
    project: "Cloud console",
    design: "Billing",
    action: "commented on",
    quote: "Love the green. Can the Team card keep its Most popular badge?",
    when: "40 min ago",
    day: "Today",
    team: "apps"
  },
  {
    id: "noah-seat",
    ago: 50,
    kind: "invite",
    who: noah,
    project: "Kestrel",
    action: "asked for an editor seat in",
    quote: "I'm picking up the Help center redesign with Priya.",
    when: "50 min ago",
    day: "Today",
    unread: true,
    needsYou: true
  },
  {
    id: "claude-run",
    ago: 60,
    kind: "agent",
    who: claude,
    project: "Cloud console",
    design: "Billing",
    action: "wants your review on",
    quote: `${claudeTask}, for Sam Okafor: one token changed, on 3 boards.`,
    when: "1 h ago",
    day: "Today",
    unread: true,
    needsYou: true,
    team: "apps"
  },
  {
    id: "priya-review",
    ago: 120,
    kind: "review",
    who: priya,
    project: "Help center",
    design: "Docs home",
    action: "asked you to review",
    quote: "Can you check the new search field, and whether getting started reads in the right order?",
    when: "2 h ago",
    day: "Today",
    unread: true,
    needsYou: true,
    team: "web"
  },
  {
    id: "sam-merge",
    ago: 180,
    kind: "merge",
    who: sam,
    project: "Cloud console",
    action: "merged #142 Billing settings into main of",
    when: "3 h ago",
    day: "Today",
    team: "apps"
  },
  {
    id: "lena-publish",
    ago: 1300,
    kind: "publish",
    who: lena,
    project: "Kestrel UI",
    action: "published Button, Toggle and Menu in",
    when: "Yesterday",
    day: "Yesterday",
    team: "system"
  },
  {
    id: "priya-adds-noah",
    ago: 1400,
    kind: "invite",
    who: priya,
    project: "Web",
    action: "added Noah Park to",
    when: "Yesterday",
    day: "Yesterday",
    team: "web"
  },
  {
    id: "lena-resolve",
    ago: 1500,
    kind: "comment",
    who: lena,
    project: "Kestrel website",
    design: "Pricing",
    action: "resolved your thread on",
    quote: "Perfect.",
    when: "Yesterday",
    day: "Yesterday",
    team: "web"
  },
  {
    id: "sam-invite",
    ago: 2900,
    kind: "invite",
    who: sam,
    project: "Relay",
    action: "invited you to",
    when: "2 days ago",
    day: "This week",
    team: "apps"
  }
]

/** One event, by id. */
export function event(id: string): PortalEvent {
  return events.find((candidate) => candidate.id === id)!
}

/** What's waiting on you, newest first. */
export const needsYou = events.filter((item) => item.needsYou)
