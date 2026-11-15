export interface Project {
  id: string
  name: string
  status: "active" | "paused" | "archived"
  summary: string
  members: string[]
}

export const projects: Project[] = [
  {
    id: "atlas",
    name: "Atlas",
    status: "active",
    summary: "Maps of every office, with desks people can book.",
    members: ["Ada Lovelace", "Grace Hopper", "Alan Kay"],
  },
  {
    id: "beacon",
    name: "Beacon",
    status: "paused",
    summary: "Alerts for the support team when a queue backs up.",
    members: ["Margaret Hamilton", "Ken Thompson"],
  },
  {
    id: "compass",
    name: "Compass",
    status: "archived",
    summary: "The old onboarding checklist, kept for reference.",
    members: ["Barbara Liskov"],
  },
]

export function findProject(id: string): Project | undefined {
  return projects.find((project) => project.id === id)
}
