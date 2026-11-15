import { data } from "react-router"
import { Avatar } from "~/components/Avatar"
import { Badge } from "~/components/Badge"
import { Card } from "~/components/Card"
import { findProject } from "~/data/projects"
import type { Route } from "./+types/project"

export function loader({ params }: Route.LoaderArgs) {
  const project = findProject(params.projectId)

  if (!project) {
    throw data("Project not found", { status: 404 })
  }

  return { project }
}

export default function Project({ loaderData: { project } }: Route.ComponentProps) {
  return (
    <>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <Badge tone={project.status === "active" ? "success" : "neutral"}>{project.status}</Badge>
      </div>
      <p className="text-muted-foreground mt-2">{project.summary}</p>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card title="People" description="Everyone working on this project.">
          <ul className="space-y-3">
            {project.members.map((member) => (
              <li key={member} className="flex items-center gap-3 text-sm">
                <Avatar name={member} />
                {member}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="This week" description="3 tasks due, 1 overdue." />
      </div>
    </>
  )
}
