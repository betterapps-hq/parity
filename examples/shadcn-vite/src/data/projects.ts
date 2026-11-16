export interface Project {
  id: string
  name: string
  owner: string
  status: "Active" | "Paused" | "Done"
  updated: string
}

export const projects: Project[] = [
  {
    id: "atlas",
    name: "Atlas",
    owner: "Priya Shah",
    status: "Active",
    updated: "Today",
  },
  {
    id: "beacon",
    name: "Beacon",
    owner: "Tomás Ortega",
    status: "Paused",
    updated: "Yesterday",
  },
  {
    id: "cinder",
    name: "Cinder",
    owner: "Mei Lin",
    status: "Done",
    updated: "Last week",
  },
]
