import { EmptyState } from "~/components/EmptyState"
import { ProjectCard } from "~/components/ProjectCard"
import { projects } from "~/data/projects"
import styles from "~/styles/pages.module.css"
import type { Route } from "./+types/index"

export function loader() {
  return { projects }
}

export default function Projects({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <h1 className={styles.heading}>Projects</h1>
      {loaderData.projects.length === 0 ? (
        <EmptyState title="No projects yet" action="Create a project" to="/projects" />
      ) : (
        <div className={styles.grid}>
          {loaderData.projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </>
  )
}
