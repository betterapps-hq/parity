import { Link } from "react-router"
import type { Project } from "~/data/projects"
import { Avatar } from "./Avatar"
import { Badge } from "./Badge"

const statusTone = { active: "success", paused: "warning", archived: "neutral" } as const

/** A project in the list: its name, status, summary and the people on it. */
export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      to={`/projects/${project.id}`}
      className="border-border hover:border-brand block rounded-lg border p-5 transition"
    >
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-semibold">{project.name}</h3>
        <Badge tone={statusTone[project.status]}>{project.status}</Badge>
      </div>
      <p className="text-muted-foreground mt-2 text-sm">{project.summary}</p>
      <div className="mt-4 flex -space-x-2">
        {project.members.map((member) => (
          <Avatar key={member} name={member} size="sm" />
        ))}
      </div>
    </Link>
  )
}
