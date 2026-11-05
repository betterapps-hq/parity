import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { AppWindow, CopyPlus, Ellipsis, Link, Star, X } from "lucide-react"
import type { CSSProperties } from "react"
import { Hint } from "../chrome/Hint.tsx"
import { type KnownProject, projectHue, whenLabel } from "./projects.ts"
import { newProjectNotReady, notReady, useStartActions } from "./start-actions.ts"

/** Parity's own accent, from its mark, for the ring round a project or template under the pointer. */
export const accent = { "--parity": "oklch(0.7 0.16 275)" } as CSSProperties

/**
 * A project's picture, until Parity keeps a render of its canvas: a desktop board with a phone beside it, in a color of
 * the project's own, with its initial where the design would be.
 */
export function ProjectArt({ project }: { project: KnownProject }) {
  const hue = projectHue(project.root)
  const ink = `oklch(0.66 0.15 ${hue})`
  const initial = /[\p{L}\p{N}]/u.exec(project.name)?.[0]?.toUpperCase() ?? "?"
  return (
    <div aria-hidden className="relative aspect-[16/10] overflow-hidden bg-muted/70">
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(70% 60% at 30% 25%, oklch(0.6 0.14 ${hue} / 0.22), transparent 70%), radial-gradient(50% 50% at 90% 100%, oklch(0.6 0.12 ${hue + 60} / 0.14), transparent 70%)`
        }}
      />
      <div className="absolute top-[13%] left-[7%] flex aspect-[16/10] w-[66%] flex-col overflow-hidden rounded-[5px] bg-background shadow-lg ring-1 ring-foreground/10">
        <span className="flex h-[12%] shrink-0 items-center gap-[3%] border-b px-[4%]">
          <span className="aspect-square h-2/5 rounded-full" style={{ background: ink }} />
          <span className="h-1/4 w-1/4 rounded-full bg-muted" />
        </span>
        <span
          className="grid flex-1 place-items-center font-semibold"
          style={{ color: ink, containerType: "size", fontSize: "min(40cqh, 2.5rem)" }}
        >
          {initial}
        </span>
      </div>
      <div className="absolute top-[24%] right-[8%] flex aspect-[9/19] w-[16%] flex-col overflow-hidden rounded-[6px] bg-background shadow-lg ring-1 ring-foreground/10">
        <span className="h-[8%] shrink-0 border-b" />
        <span className="m-[14%] h-[6%] rounded-full" style={{ background: ink }} />
      </div>
    </div>
  )
}

/** When it was opened, or where it is when that isn't known. */
function openedLine(project: KnownProject, now: number): string {
  if (project.opened === undefined) return project.root.slice(0, -project.name.length - 1) || project.root
  return `Opened ${whenLabel(project.opened, now)}`
}

/** What can be done with a project from the start page. */
function ProjectMenu({
  project,
  onRemove,
  className
}: {
  project: KnownProject
  onRemove?: () => void
  className?: string
}) {
  const actions = useStartActions()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={`More for ${project.name}`} className={className}>
            <Ellipsis />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => actions.open(project.root)}>
          <AppWindow /> Open
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => actions.star(project.root, !project.starred)}>
          <Star /> {project.starred ? "Unstar" : "Star"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => newProjectNotReady(actions)}>
          <CopyPlus /> New project from this
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => notReady("Links to projects aren't ready yet")}>
          <Link /> Copy link
        </DropdownMenuItem>
        {onRemove && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onRemove}>
              <X /> Remove from recent
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A project: its picture, its name, and when it was last opened. The whole card opens it; its menu does the rest. */
export function ProjectCard({
  project,
  now,
  onRemove
}: {
  project: KnownProject
  /** The time its last opening is counted back from. */
  now: number
  onRemove?: () => void
}) {
  const actions = useStartActions()
  return (
    <article className="group/card relative flex min-w-0 flex-col gap-2.5" style={accent}>
      <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10 transition-shadow duration-150 group-hover/card:ring-2 group-hover/card:ring-(--parity)">
        <ProjectArt project={project} />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="text-sm font-medium">
            <Hint label={project.root} wait>
              <button
                type="button"
                onClick={() => actions.open(project.root)}
                className="block max-w-full truncate text-left outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
              >
                {project.name}
              </button>
            </Hint>
          </h3>
          <span className="truncate text-xs text-muted-foreground">{openedLine(project, now)}</span>
        </div>
        <ProjectMenu
          project={project}
          onRemove={onRemove}
          className="relative z-10 opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
        />
      </div>
    </article>
  )
}
