import { useId, useState } from "react"
import { ProjectCard } from "./ProjectCard.tsx"
import { inScope, type KnownProject, type ProjectScope } from "./projects.ts"
import { useStartActions } from "./start-actions.ts"
import { useNow } from "./use-now.ts"

const scopes: { id: ProjectScope; label: string }[] = [
  { id: "recent", label: "Recent" },
  { id: "starred", label: "Starred" },
  { id: "shared", label: "Shared with you" },
  { id: "all", label: "All projects" }
]

const empty: Record<ProjectScope, string> = {
  recent: "Projects you open show up here.",
  starred: "Nothing starred yet. Star a project from its menu to keep it here.",
  shared: "Nothing has been shared with you yet.",
  all: "No projects yet."
}

/**
 * Your projects as cards: the recent ones first, or the starred ones, the ones shared with you, or all of them. Two rows
 * show until you ask for more. `skip` leaves one out of Recent, as Home leaves out the one it offers to continue.
 */
export function ProjectList({
  projects,
  skip,
  limit = 8
}: {
  projects: readonly KnownProject[]
  skip?: string
  limit?: number
}) {
  const actions = useStartActions()
  const heading = useId()
  const now = useNow()
  const [scope, setScope] = useState<ProjectScope>("recent")
  const [more, setMore] = useState(false)
  const listed = inScope(projects, scope, skip)
  const shown = more ? listed : listed.slice(0, limit)
  return (
    <section aria-labelledby={heading} className="flex flex-col gap-4">
      <h2 id={heading} className="sr-only">
        Projects
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <fieldset className="m-0 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 border-0 p-0 text-sm">
          <legend className="sr-only">Projects to show</legend>
          {scopes.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={option.id === scope}
              onClick={() => {
                setScope(option.id)
                setMore(false)
              }}
              className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-pressed:font-medium aria-pressed:text-foreground"
            >
              {option.label}
            </button>
          ))}
        </fieldset>
        {listed.length > limit && (
          <button
            type="button"
            onClick={() => setMore(!more)}
            className="rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {more ? "Show less" : `Show ${listed.length - shown.length} more`}
          </button>
        )}
      </div>
      {shown.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-x-5 gap-y-7">
          {shown.map((project) => (
            <ProjectCard
              key={project.root}
              project={project}
              now={now}
              onRemove={scope === "recent" ? () => actions.forget(project.root) : undefined}
            />
          ))}
        </div>
      ) : (
        <p className="py-8 text-sm text-muted-foreground">{empty[scope]}</p>
      )}
    </section>
  )
}
