import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@buildkitgg/shadcn-baseui-kit"
import { FolderOpen, History, type LucideIcon, Star, Users } from "lucide-react"
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

const empty: Record<ProjectScope, { icon: LucideIcon; title: string; description: string }> = {
  recent: {
    icon: History,
    title: "No recent projects",
    description: "Projects you open show up here, with a picture of their screens."
  },
  starred: {
    icon: Star,
    title: "No starred projects",
    description: "Star a project from its menu to keep it here, even once it leaves Recent."
  },
  shared: {
    icon: Users,
    title: "Nothing shared with you",
    description: "Projects people share with you will show up here once sharing is ready."
  },
  all: { icon: FolderOpen, title: "No projects yet", description: "Open a React app's folder to see it on a canvas." }
}

/** A list with nothing in it: what will show up there, in a dashed box the height of a row of cards. */
function EmptyList({ scope }: { scope: ProjectScope }) {
  const { icon: Icon, title, description } = empty[scope]
  return (
    <Empty className="min-h-[220px] border">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="text-muted-foreground">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
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
  const toggle = listed.length > limit && (
    <button
      type="button"
      onClick={() => setMore(!more)}
      className="rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {more ? "Show less" : `Show ${listed.length - shown.length} more`}
    </button>
  )
  return (
    <section aria-labelledby={heading} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-4">
      <h2 id={heading} className="sr-only">
        Projects
      </h2>
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
            className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-pressed:text-foreground"
          >
            {option.label}
          </button>
        ))}
      </fieldset>
      {/* Beside the filters, except on a phone, where it follows the cards in reading order too, not only on screen. */}
      {toggle && <div className="justify-self-end max-sm:hidden">{toggle}</div>}
      {shown.length > 0 ? (
        <div className="col-span-2 grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-x-5 gap-y-7">
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
        <div className="col-span-2">
          <EmptyList scope={scope} />
        </div>
      )}
      {toggle && <div className="col-span-2 sm:hidden">{toggle}</div>}
    </section>
  )
}
