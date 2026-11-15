import { EmptyState } from "~/components/EmptyState"
import { ProjectCard } from "~/components/ProjectCard"
import { projects } from "~/data/projects"
import type { Route } from "./+types/index"

export function loader() {
  return { projects }
}

export default function Projects({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <h1 className="text-2xl font-semibold">Projects</h1>
      {loaderData.projects.length === 0 ? (
        <EmptyState title="No projects yet" action="Create a project" to="/projects" />
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {loaderData.projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </>
  )
}
