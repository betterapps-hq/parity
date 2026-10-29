/**
 * The portal's sample org: a made-up customer, Kestrel, using Parity on the web. It shares the explorations' cast and
 * the start page's projects, renamed so the org reads as a customer's.
 */
import { me, type Organization, people, type Person } from "../explore-data.ts"
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

/** A start page project as the portal names it. */
export function portalProject(id: string): StartProject {
  const shown = project(id)
  const names = renamed[id]
  if (!names) return shown
  const first = shown.designs.filter((design) => design.name === names.first)
  const designs = [...first, ...shown.designs.filter((design) => !first.includes(design))]
  return { ...shown, name: names.name, look: { ...shown.look, brand: names.brand }, designs }
}

/** One of a project's designs, by name. */
export function designOf(shown: StartProject, name: string): Design {
  return shown.designs.find((design) => design.name === name) ?? shown.designs[0]!
}

/** Kestrel's projects, most recently edited first. */
export const orgProjects = ["website", "dashboard", "spawnkit", "docs", "copilot", "library", "standup"].map(
  portalProject
)

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

/** Where someone is right now: the project and design, and what they're doing there. */
export interface Whereabouts {
  who: Person
  project: string
  design: string
  doing: string
  /** How long since they left, when they're not in a project now. */
  away?: string
}

/** Your teammates and their agents, where they are now. */
export const workingNow: Whereabouts[] = [
  { who: people.maya, project: "website", design: "Pricing", doing: "Editing the plan cards" },
  { who: people.claude, project: "dashboard", design: "Billing", doing: "Tighten the plan cards" },
  { who: people.jonas, project: "spawnkit", design: "Level select", doing: "Drawing the locked tiles" },
  { who: people.sam, project: "dashboard", design: "Overview", doing: "Reviewing the usage chart" },
  { who: people.priya, project: "docs", design: "Docs home", doing: "Left a review", away: "2 h ago" }
]
