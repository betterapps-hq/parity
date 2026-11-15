import { data } from "react-router"
import { Avatar } from "~/components/Avatar"
import { Badge } from "~/components/Badge"
import { Card } from "~/components/Card"
import { findProject } from "~/data/projects"
import styles from "~/styles/pages.module.css"
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
      <div className={styles.row}>
        <h1 className={styles.heading}>{project.name}</h1>
        <Badge tone={project.status === "active" ? "success" : "neutral"}>{project.status}</Badge>
      </div>
      <p className={styles.muted}>{project.summary}</p>
      <div className={styles.grid}>
        <Card title="People" description="Everyone working on this project.">
          <ul className={styles.list}>
            {project.members.map((member) => (
              <li key={member} className={styles.listItem}>
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
