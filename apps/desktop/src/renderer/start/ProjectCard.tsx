import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { AppWindow, Ellipsis, FolderX, Link, Star, X } from "lucide-react"
import { type CSSProperties, useId, useRef, useState } from "react"
import { toast } from "sonner"
import { Hint } from "../chrome/Hint.tsx"
import { ProjectArt, useScreenCount, useScreenName } from "./ProjectArt.tsx"
import { type KnownProject, whenLabel } from "./projects.ts"
import { notReady, useStartActions } from "./start-actions.ts"

/** Parity's own accent, from its mark, for the ring round a project or template under the pointer. */
export const accent = { "--parity": "oklch(0.7 0.16 275)" } as CSSProperties

/** When it was opened, or where it is when that isn't known. */
function openedLine(project: KnownProject, now: number): string {
  if (project.opened === undefined) return project.root.slice(0, -project.name.length - 1) || project.root
  return `Opened ${whenLabel(project.opened, now)}`
}

/**
 * Says a project's folder isn't where it was, and offers to take it off the list. It stays listed until then, since a
 * drive that isn't plugged in comes back.
 */
export function folderMissing(project: KnownProject, remove?: () => void): void {
  toast(`Parity can't find ${project.name}`, {
    description: `Its folder isn't at ${project.root} any more. Put it back, or remove it from Recent.`,
    ...(remove ? { action: { label: "Remove", onClick: remove } } : {})
  })
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
        <DropdownMenuItem
          onClick={() => (project.missing ? folderMissing(project, onRemove) : actions.open(project.root))}
        >
          <AppWindow /> Open
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => actions.star(project.root, !project.starred)}>
          <Star /> {project.starred ? "Unstar" : "Star"}
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
  const line = useId()
  const art = useRef<HTMLDivElement>(null)
  const count = useScreenCount(project)
  const [screen, setScreen] = useState(0)
  const [hovered, setHovered] = useState(false)
  const name = useScreenName(project, screen)
  const open = () => (project.missing ? folderMissing(project, onRemove) : actions.open(project.root))
  return (
    <article
      className="group/card relative flex min-w-0 flex-col gap-2.5"
      style={accent}
      onPointerEnter={() => setHovered(true)}
      onPointerMove={(event) => setScreen(screenUnder(art.current, event.clientX, event.clientY, count))}
      onPointerLeave={() => {
        setHovered(false)
        setScreen(0)
      }}
    >
      <div
        ref={art}
        className="relative overflow-hidden rounded-lg ring-1 ring-foreground/10 transition-shadow duration-150 group-hover/card:ring-2 group-hover/card:ring-(--parity)"
      >
        <div className={project.missing ? "opacity-40 grayscale" : undefined}>
          <ProjectArt project={project} screen={screen} />
        </div>
        {project.missing && (
          <span className="absolute top-2 left-2 flex items-center gap-1 rounded-md bg-background/90 px-1.5 py-0.5 text-[11px] font-medium shadow-sm">
            <FolderX className="size-3" /> Folder not found
          </span>
        )}
        {count > 1 && !project.missing && (
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-linear-to-t from-black/70 to-transparent px-3 pt-6 pb-2.5 transition-opacity duration-150 ${hovered ? "opacity-100" : "opacity-0"}`}
          >
            <span className="truncate text-[11px] font-medium text-white">{name}</span>
            <span className="flex gap-1">
              {Array.from({ length: count }, (_, position) => (
                <span
                  key={position}
                  className={`h-0.5 flex-1 rounded-full ${position === screen ? "bg-white" : "bg-white/30"}`}
                />
              ))}
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="text-sm font-medium">
            <Hint label={project.root} wait>
              <button
                type="button"
                onClick={open}
                aria-describedby={project.missing ? line : undefined}
                className="block max-w-full truncate text-left outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
              >
                {project.name}
              </button>
            </Hint>
          </h3>
          <span id={line} className="truncate text-xs text-muted-foreground">
            {project.missing ? "Folder not found" : openedLine(project, now)}
          </span>
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

/**
 * Which of a picture's screens the pointer is over: the picture split into as many strips across as there are screens,
 * as the exploration's cards flip. The first below the picture, over the card's name.
 */
function screenUnder(art: HTMLElement | null, x: number, y: number, count: number): number {
  const box = art?.getBoundingClientRect()
  if (!box || count < 2 || y > box.bottom || box.width === 0) return 0
  return Math.min(count - 1, Math.max(0, Math.floor(((x - box.left) / box.width) * count)))
}
