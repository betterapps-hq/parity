import { Link } from "react-router"
import type { Project } from "~/data/projects"
import { Avatar } from "./Avatar"
import { Badge } from "./Badge"
import styles from "./ProjectCard.module.css"

const statusTone = { active: "success", paused: "warning", archived: "neutral" } as const

/** A project in the list: its name, status, summary and the people on it. */
export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link to={`/projects/${project.id}`} className={styles.card}>
      <div className={styles.heading}>
        <h3 className={styles.name}>{project.name}</h3>
        <Badge tone={statusTone[project.status]}>{project.status}</Badge>
      </div>
      <p className={styles.summary}>{project.summary}</p>
      <div className={styles.members}>
        {project.members.map((member) => (
          <Avatar key={member} name={member} size="sm" />
        ))}
      </div>
    </Link>
  )
}
