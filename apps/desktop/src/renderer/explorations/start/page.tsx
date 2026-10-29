/**
 * The start page's parts: what Home, a new tab and the first run are built from. The design is one page in three
 * contexts, so a person learns it once.
 */
import {
  ArrowRight,
  AtSign,
  ChevronDown,
  ChevronsUpDown,
  CircleHelp,
  Ellipsis,
  Eye,
  FileInput,
  FolderGit2,
  FolderOpen,
  GitBranch,
  MessageSquare,
  Plus,
  Reply,
  Search,
  Star,
  UserPlus
} from "lucide-react"
import { type CSSProperties, type ReactNode, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { agentPalettes } from "../../agent/agent-colors.ts"
import { AgentBadge, AgentPointer } from "../../agent/AgentPointer.tsx"
import { me, organization, people, type Person } from "../explore-data.ts"
import {
  accent,
  Avatar,
  AvatarStack,
  AzureDevOpsMark,
  ExploreWindow,
  GitHubMark,
  type MockTab,
  SourceIcon
} from "../parts.tsx"
import { OrgBadge, TitleBarActions } from "../start-page-parts.tsx"
import {
  type Design,
  type ForYouItem,
  type ForYouKind,
  forYou,
  lastVisit,
  project as findProject,
  projects,
  type Stack,
  type StackId,
  type StartProject,
  stacks,
  type Template,
  templatesOn
} from "./data.ts"
import { DesignRender } from "./renders.tsx"

/** Parity's own accent, from its mark: hover rings, focus and the odd highlight. */
export const parity = "oklch(0.7 0.16 275)"

/** The window around a start page, with the inbox and account in the title bar. */
export function StartWindow({
  tabs,
  active,
  unread = 3,
  children
}: {
  tabs: MockTab[]
  active: string
  unread?: number
  children: ReactNode
}) {
  return (
    <ExploreWindow tabs={tabs} active={active} actions={<TitleBarActions unread={unread} />}>
      <style>{liveStyles}</style>
      {children}
    </ExploreWindow>
  )
}

/** Paths for cursors drifting over a design while someone works on it. */
const liveStyles = `
@keyframes start-live-a { 0%, 100% { transform: translate(0, 0) } 30% { transform: translate(34px, 12px) } 55% { transform: translate(14px, 30px) } 80% { transform: translate(-14px, 8px) } }
@keyframes start-live-b { 0%, 100% { transform: translate(0, 0) } 35% { transform: translate(-26px, 18px) } 70% { transform: translate(20px, -10px) } }
`

/** Cursor colors, the same ones the canvas gives each of them. */
const palettes: Record<string, number> = {
  [people.claude.name]: 7,
  [people.maya.name]: 0,
  [people.cursor.name]: 4,
  [people.jonas.name]: 1,
  [people.priya.name]: 5
}

function paletteFor(person: Person) {
  return agentPalettes[palettes[person.name] ?? 9]!
}

/** Someone's cursor at work on a design: an agent shows what it's doing, a person their name. */
function LiveCursor({
  who,
  doing,
  style,
  path = "a",
  small
}: {
  who: Person
  doing?: string
  style: CSSProperties
  path?: "a" | "b"
  small?: boolean
}) {
  const palette = paletteFor(who)
  return (
    <div
      className={`pointer-events-none absolute z-10 ${small ? "scale-[0.8]" : ""} origin-top-left motion-safe:animate-[var(--drift)]`}
      style={{ ...style, ["--drift" as string]: `start-live-${path} ${path === "a" ? 9 : 11}s ease-in-out infinite` }}
    >
      <AgentPointer palette={palette} />
      {who.agent && !small ? (
        <AgentBadge palette={palette} agent={who.name} kind="write" label={doing} />
      ) : (
        <div
          className="mt-0.5 ml-4 w-max rounded-full px-1.5 py-px text-[10px] font-semibold shadow-md"
          style={{ background: palette.color, color: palette.ink }}
        >
          {who.name.split(" ")[0]}
        </div>
      )}
    </div>
  )
}

/** A comment pin on a board: who started it, and how many replies. */
function Pin({ person, replies, style }: { person: Person; replies: number; style: CSSProperties }) {
  return (
    <span
      className="absolute z-10 flex items-center gap-1 rounded-full rounded-bl-none bg-background p-0.5 pr-1.5 shadow-lg ring-1 ring-white/10"
      style={style}
    >
      <Avatar person={person} size={18} />
      <span className="text-[10px] text-muted-foreground">{replies}</span>
    </span>
  )
}

/**
 * A project's canvas, as it looks right now: its design's desktop frame, the phone frame beside it where there is
 * one, and whoever is working there. Every frame is a real render of the design.
 */
export function CanvasArt({
  project,
  design,
  labels,
  pins,
  live = true,
  fill,
  className = ""
}: {
  project: StartProject
  design: Design
  /** Board names above the frames, as the canvas draws them. */
  labels?: boolean
  /** Comment pins on the boards. */
  pins?: boolean
  live?: boolean
  /** Fill the box instead of keeping the canvas's own proportions. */
  fill?: boolean
  className?: string
}) {
  const { look } = project
  const label = "absolute -top-[18px] left-0 text-[11px] font-medium whitespace-nowrap text-white/45"
  const frame = "absolute overflow-visible rounded-[5px] shadow-[0_16px_40px_-10px_rgb(0_0_0/0.7)] ring-1 ring-white/10"
  return (
    <div
      className={`relative overflow-hidden bg-[#0f0f12] ${className}`}
      style={fill ? undefined : { aspectRatio: "16 / 10" }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(70% 60% at 30% 25%, oklch(0.55 0.14 ${look.hue} / 0.18), transparent 70%), radial-gradient(50% 50% at 90% 100%, oklch(0.55 0.12 ${look.hue + 60} / 0.1), transparent 70%)`
        }}
      />
      <div className={frame} style={design.mobile ? { left: "6%", top: labels ? "15%" : "9%", width: "72%" } : { left: "8%", top: labels ? "12%" : "8%", width: "84%" }}>
        {labels && <span className={label}>{design.name}</span>}
        <DesignRender kind={design.kind} look={look} className="rounded-[5px]" />
      </div>
      {design.mobile && (
        <div className={`${frame} rounded-[9px]`} style={{ right: "6%", top: labels ? "27%" : "22%", width: "19%" }}>
          {labels && <span className={label}>{design.name}, phone</span>}
          <DesignRender kind={design.kind} look={look} mobile className="rounded-[9px]" />
        </div>
      )}
      {pins && (
        <>
          <Pin person={people.maya} replies={2} style={{ left: "27%", top: "44%" }} />
          <Pin person={people.jonas} replies={1} style={{ left: "60%", top: "70%" }} />
        </>
      )}
      {live && project.live && (
        <LiveCursor
          who={project.live.who}
          doing={project.live.doing}
          small={!labels}
          style={labels ? { left: "40%", top: "60%" } : { left: "46%", top: "52%" }}
        />
      )}
    </div>
  )
}

function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-medium text-white ring-1 ring-white/10 backdrop-blur ${className}`}
    >
      {children}
    </span>
  )
}

function LiveDot({ person }: { person: Person }) {
  return (
    <span className="relative flex size-1.5">
      <span
        className="absolute inset-0 rounded-full motion-safe:animate-ping"
        style={{ background: paletteFor(person).color }}
      />
      <span className="relative size-1.5 rounded-full" style={{ background: paletteFor(person).color }} />
    </span>
  )
}

/** "Edited 12 min ago by Maya", or "edited yesterday by you". */
function editedBy(project: StartProject): string {
  const who = project.editedBy === me ? "you" : project.editedBy.name.split(" ")[0]
  const when = /^\d/.test(project.edited) ? project.edited : project.edited.toLowerCase()
  return `Edited ${when} by ${who}`
}

/**
 * A project: a live render of its canvas, its name and who's been in it. Moving the pointer across the picture flips
 * through its designs.
 */
export function ProjectCard({ project, showOrg }: { project: StartProject; showOrg?: boolean }) {
  const art = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const design = project.designs[index]!
  const many = project.designs.length > 1
  return (
    <article
      className="group/card relative flex flex-col gap-3"
      onPointerEnter={() => setHovered(true)}
      onPointerMove={(event) => {
        const box = art.current?.getBoundingClientRect()
        if (!box || event.clientY > box.bottom) return setIndex(0)
        const share = (event.clientX - box.left) / box.width
        setIndex(Math.min(project.designs.length - 1, Math.max(0, Math.floor(share * project.designs.length))))
      }}
      onPointerLeave={() => {
        setHovered(false)
        setIndex(0)
      }}
    >
      <div
        ref={art}
        className="relative overflow-hidden rounded-xl ring-1 ring-white/[0.08] transition-shadow duration-150 group-hover/card:ring-2 group-hover/card:ring-(--parity)"
        style={{ ["--parity" as string]: parity }}
      >
        <CanvasArt project={project} design={design} />
        <div className="absolute top-2.5 left-2.5 z-10 flex gap-1.5">
          {project.live && (
            <Chip>
              <LiveDot person={project.live.who} />
              {project.live.who.agent
                ? `${project.live.who.name} is working`
                : `${project.live.who.name.split(" ")[0]} is here`}
            </Chip>
          )}
          {project.open && <Chip>Open in a tab</Chip>}
        </div>
        {!!project.comments && (
          <span
            className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 rounded-full bg-[oklch(0.62_0.19_256)] px-1.5 py-0.5 text-[11px] font-semibold text-white shadow"
            title={`${project.comments} new comments for you`}
          >
            <MessageSquare className="size-3" /> {project.comments}
          </span>
        )}
        {many && (
          <div
            className={`absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pt-6 pb-2.5 transition-opacity duration-150 ${
              hovered ? "opacity-100" : "opacity-0"
            }`}
          >
            <span className="text-[11px] font-medium text-white">{design.name}</span>
            <span className="flex gap-1">
              {project.designs.map((item, position) => (
                <span
                  key={item.name}
                  className={`h-0.5 flex-1 rounded-full ${position === index ? "bg-white" : "bg-white/30"}`}
                />
              ))}
            </span>
          </div>
        )}
      </div>
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="flex items-center gap-1.5 text-sm font-medium">
            <button
              type="button"
              className="truncate text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              {project.name}
            </button>
            {project.starred && <Star className="size-3 shrink-0 fill-current text-muted-foreground" />}
          </h3>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <SourceIcon type={project.source.type} className="size-3 shrink-0" />
            <span className="truncate">
              {showOrg ? `${organization(project.org).name}, ` : ""}
              {editedBy(project)}
            </span>
          </span>
        </div>
        <span className="relative z-10 flex items-center gap-1">
          <span className="transition-opacity group-hover/card:opacity-0">
            <AvatarStack people={project.people} size={20} max={3} />
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`More for ${project.name}`}
            className="absolute right-0 opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100"
          >
            <Ellipsis />
          </Button>
        </span>
      </div>
    </article>
  )
}

/** The project you were last in, as you left it, and what happened there since. */
export function ContinueCard() {
  const project = findProject(lastVisit.project)
  const design = project.designs.find((item) => item.name === lastVisit.design)!
  return (
    <section className="group/continue grid min-h-[300px] grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] overflow-hidden rounded-2xl border bg-card/40">
      <div className="relative">
        <CanvasArt project={project} design={design} labels pins fill className="absolute inset-0" />
      </div>
      <div className="flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Pick up where you left off</span>
          <h2 className="text-xl font-semibold tracking-tight">{project.name}</h2>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            You were on {lastVisit.design}, {lastVisit.when.toLowerCase()}.
            <span className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px]">
              <GitBranch className="size-3" />
              {project.source.branch}
            </span>
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="text-xs font-medium text-muted-foreground">Since then</span>
          {lastVisit.since.map((item) => (
            <span key={item.text} className="flex items-start gap-2.5 text-[13px] leading-snug">
              <Avatar person={item.who} size={20} className="mt-px" />
              <span className="text-muted-foreground">
                <span className="font-medium text-foreground">{item.who.name}</span> {item.text}
                {item.detail && <span className="text-foreground">: {item.detail}</span>}
              </span>
            </span>
          ))}
        </div>
        <div className="mt-auto flex items-center gap-2">
          <Button size="lg" className="px-3">
            Resume <Kbd className="bg-primary-foreground/10 text-primary-foreground/70">Enter</Kbd>
          </Button>
          <Button size="lg" variant="outline">
            Review changes
          </Button>
        </div>
      </div>
    </section>
  )
}

const forYouIcons: Record<ForYouKind, typeof AtSign> = {
  agent: CircleHelp,
  mention: AtSign,
  review: Eye,
  reply: Reply,
  invite: UserPlus
}

function ForYouRow({ item }: { item: ForYouItem }) {
  const Icon = forYouIcons[item.kind]
  return (
    <li className="group/row relative flex gap-3 rounded-xl px-3 py-2.5 hover:bg-muted/40">
      <span className="relative h-fit shrink-0">
        <Avatar person={item.who} size={28} />
        <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-background ring-1 ring-border">
          <Icon className="size-2.5 text-muted-foreground" />
        </span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] leading-snug text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{item.who.name}</span> {item.action}{" "}
          {item.design && (
            <>
              <span className="font-medium text-foreground">{item.design}</span> in{" "}
            </>
          )}
          <span className="font-medium text-foreground">{item.project}</span>
        </span>
        {item.quote && <span className="line-clamp-1 border-l-2 pl-2 text-foreground/80">{item.quote}</span>}
        <span className="text-xs">{item.when}</span>
      </div>
      <span className="flex shrink-0 flex-col items-end gap-2">
        {item.unread && <span className="mt-1.5 size-2 rounded-full bg-[oklch(0.65_0.18_256)]" />}
        <Button
          size="xs"
          variant={item.kind === "agent" ? "default" : "outline"}
          className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
        >
          {item.act}
        </Button>
      </span>
    </li>
  )
}

/** What needs you across every project: agents waiting, mentions, reviews and replies. */
export function ForYouPanel({ limit = 4 }: { limit?: number }) {
  const unread = forYou.filter((item) => item.unread).length
  return (
    <section className="flex flex-col rounded-2xl border bg-card/40">
      <header className="flex items-center justify-between px-5 pt-4 pb-1.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          For you
          <span className="rounded-full bg-[oklch(0.62_0.19_256)] px-1.5 text-[11px] leading-4 font-semibold text-white">
            {unread}
          </span>
        </h2>
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground">
          Open inbox
        </button>
      </header>
      <ul className="flex flex-col p-2 pt-0">
        {forYou.slice(0, limit).map((item) => (
          <ForYouRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  )
}

type Scope = "recent" | "starred" | "shared" | "all"

const scopes: { id: Scope; label: string }[] = [
  { id: "recent", label: "Recent" },
  { id: "starred", label: "Starred" },
  { id: "shared", label: "Shared with you" },
  { id: "all", label: "All projects" }
]

/** Quiet tabs, for switching what a section lists. */
export function Segmented<T extends string>({
  options,
  value,
  onChange
}: {
  options: { id: T; label: ReactNode }[]
  value: T
  onChange(value: T): void
}) {
  return (
    <span className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-background aria-pressed:font-medium aria-pressed:text-foreground aria-pressed:shadow-sm"
        >
          {option.label}
        </button>
      ))}
    </span>
  )
}

/** Your projects, as renders: recent first, or starred, shared or everything. */
export function RecentProjects({
  skip,
  rows = 2,
  title = "Projects"
}: {
  /** A project shown elsewhere on the page already. */
  skip?: string
  rows?: number
  title?: string
}) {
  const [scope, setScope] = useState<Scope>("recent")
  const listed = projects.filter((project) => {
    if (project.id === skip) return false
    if (scope === "starred") return project.starred
    if (scope === "shared") return project.shared
    return true
  })
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <Segmented options={scopes} value={scope} onChange={setScope} />
        </div>
        <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          All {projects.length} projects <ArrowRight className="size-3" />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-x-5 gap-y-7">
        {listed.slice(0, rows * 4).map((project) => (
          <ProjectCard key={project.id} project={project} showOrg={scope === "all" || scope === "shared"} />
        ))}
      </div>
    </section>
  )
}

/** A stack's mark: its initials on its color. */
export function StackMark({ stack, size = 20 }: { stack: Stack; size?: number }) {
  const chroma = stack.hue === 0 ? 0 : 0.09
  return (
    <span
      className="grid shrink-0 place-items-center rounded-md font-mono font-bold tracking-tight"
      style={{
        width: size,
        height: size,
        fontSize: size * (stack.mark.length > 1 ? 0.42 : 0.55),
        background: stack.hue === 0 ? "oklch(0.95 0 0)" : `oklch(0.32 ${chroma} ${stack.hue})`,
        color: stack.hue === 0 ? "oklch(0.15 0 0)" : `oklch(0.88 ${chroma + 0.04} ${stack.hue})`
      }}
    >
      {stack.mark}
    </span>
  )
}

/** A template: its first design, drawn in the template's own look, then its name. */
export function TemplateCard({ template, onPick }: { template: Template; onPick?(template: Template): void }) {
  return (
    <button
      type="button"
      onClick={() => onPick?.(template)}
      className="group/template flex flex-col gap-2.5 text-left outline-none"
      style={{ ["--parity" as string]: parity }}
    >
      <span className="relative block overflow-hidden rounded-xl ring-1 ring-white/[0.08] transition-shadow duration-150 group-hover/template:ring-2 group-hover/template:ring-(--parity) group-focus-visible/template:ring-2 group-focus-visible/template:ring-ring">
        <DesignRender kind={template.designs[0]!.kind} look={template.look} />
        <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white opacity-0 backdrop-blur transition-opacity group-hover/template:opacity-100">
          Use template <ArrowRight className="size-3" />
        </span>
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{template.name}</span>
        <span className="text-xs text-muted-foreground">{template.blurb}</span>
      </span>
    </button>
  )
}

/** Starting from what exists: a repository, a folder, or one of your projects. */
export function ExistingCard({ onPick }: { onPick?(): void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="group/existing flex flex-col gap-2.5 text-left outline-none"
      style={{ ["--parity" as string]: parity }}
    >
      <span className="relative grid aspect-[16/10] place-items-center overflow-hidden rounded-xl border border-dashed border-white/15 bg-white/[0.015] transition-colors group-hover/existing:border-(--parity) group-focus-visible/existing:border-ring">
        <span className="flex items-center gap-2.5">
          {[
            <GitHubMark key="github" size={18} />,
            <AzureDevOpsMark key="azure" size={18} />,
            <FolderOpen key="folder" className="size-[18px]" />,
            <FolderGit2 key="project" className="size-[18px]" />
          ].map((mark, index) => (
            <span
              key={index}
              className="grid size-10 place-items-center rounded-xl bg-muted/60 text-muted-foreground ring-1 ring-white/5 transition-transform group-hover/existing:-translate-y-0.5"
              style={{ transitionDelay: `${index * 30}ms` }}
            >
              {mark}
            </span>
          ))}
        </span>
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">From an existing project</span>
        <span className="text-xs text-muted-foreground">A repository, a folder or one of your projects</span>
      </span>
    </button>
  )
}

/** A stack's blank app, for starting from nothing but the stack. */
function BlankCard({ stack }: { stack: Stack }) {
  return (
    <button type="button" className="group/blank flex flex-col gap-2.5 text-left outline-none" style={{ ["--parity" as string]: parity }}>
      <span className="grid aspect-[16/10] place-items-center rounded-xl border border-white/[0.08] bg-white/[0.015] transition-colors group-hover/blank:border-(--parity)">
        <span className="flex flex-col items-center gap-2 text-muted-foreground">
          <StackMark stack={stack} size={30} />
          <Plus className="size-4" />
        </span>
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">Blank app</span>
        <span className="text-xs text-muted-foreground">Just {stack.name}, set up</span>
      </span>
    </button>
  )
}

/** Something new: templates on a stack, a blank app, or an existing project. */
export function StartNew({
  title = "Start something new",
  columns = 5,
  onPickTemplate,
  onPickExisting
}: {
  title?: string
  columns?: number
  onPickTemplate?(template: Template): void
  onPickExisting?(): void
}) {
  const [stackId, setStackId] = useState<StackId>("tanstack-start")
  const stack = stacks.find((candidate) => candidate.id === stackId)!
  const shown = templatesOn(stackId).slice(0, columns - 1)
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <Segmented
            options={stacks.map((candidate) => ({
              id: candidate.id,
              label: (
                <>
                  <StackMark stack={candidate} size={16} /> {candidate.name}
                </>
              )
            }))}
            value={stackId}
            onChange={setStackId}
          />
        </div>
        <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          {templatesOn(stackId).length > shown.length ? `All ${templatesOn(stackId).length} templates` : "All templates"}
          <ArrowRight className="size-3" />
        </button>
      </div>
      <div className="grid gap-x-5 gap-y-7" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {shown.map((template) => (
          <TemplateCard key={template.id} template={template} onPick={onPickTemplate} />
        ))}
        {shown.length < columns - 1 && <BlankCard stack={stack} />}
        <ExistingCard onPick={onPickExisting} />
      </div>
    </section>
  )
}

/** Looks like a field, opens search: projects, designs, components, people and commands. */
export function SearchButton({ large, onOpen }: { large?: boolean; onOpen?(): void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex items-center gap-2.5 rounded-xl border bg-card/60 text-left text-muted-foreground outline-none hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring ${
        large ? "h-12 w-full px-4 text-[15px] shadow-[0_8px_30px_-12px_rgb(0_0_0/0.6)]" : "h-9 w-[300px] px-3 text-sm"
      }`}
    >
      <Search className={large ? "size-[18px]" : "size-4"} />
      <span className="flex-1 truncate">
        {large ? "Search projects, designs and people, or paste a repository URL" : "Search projects, designs, people"}
      </span>
      <Kbd>Ctrl K</Kbd>
    </button>
  )
}

/** Opening what's already there: a folder, a project file, or a repository to clone. */
export function OpenMenu({ size = "lg" }: { size?: "lg" | "default" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size}>
          <FolderOpen /> Open <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem>
          <FolderOpen /> Open a folder <DropdownMenuShortcut>Ctrl O</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <FileInput /> Open a project file <DropdownMenuShortcut>Ctrl Shift O</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <GitHubMark size={16} /> Clone from GitHub
        </DropdownMenuItem>
        <DropdownMenuItem>
          <AzureDevOpsMark size={16} /> Clone from Azure DevOps
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function NewProjectButton({ onClick, size = "lg" }: { onClick?(): void; size?: "lg" | "default" }) {
  return (
    <Button size={size} onClick={onClick}>
      <Plus /> New project
    </Button>
  )
}

/** Which organization's projects the page shows, and the way to switch. */
export function OrgSwitcher() {
  const org = organization("buildkit")
  return (
    <button
      type="button"
      className="-ml-1.5 flex w-fit items-center gap-2 rounded-lg px-1.5 py-1 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
    >
      <OrgBadge org={org} size={18} />
      <span className="font-medium text-foreground">{org.name}</span>
      {org.members} members
      <ChevronsUpDown className="size-3.5" />
    </button>
  )
}

const agents: { who: Person; connected: boolean }[] = [
  { who: people.claude, connected: true },
  { who: people.cursor, connected: true },
  { who: { name: "Codex", hue: 160, agent: true }, connected: false }
]

/** What sits at the bottom, close by: which agents can work here, and help. */
export function StartFooter() {
  return (
    <footer className="flex items-center justify-between border-t border-border/60 pt-5 text-xs text-muted-foreground">
      <div className="flex items-center gap-5">
        <span>Agents</span>
        {agents.map(({ who, connected }) => (
          <span key={who.name} className="flex items-center gap-1.5">
            <Avatar person={who} size={18} />
            <span className={connected ? "text-foreground/90" : ""}>{who.name}</span>
            {connected ? (
              <span className="size-1.5 rounded-full bg-[oklch(0.76_0.15_155)]" title="Connected" />
            ) : (
              <button type="button" className="font-medium text-foreground underline-offset-2 hover:underline">
                Connect
              </button>
            )}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-5">
        <button type="button" className="hover:text-foreground">
          What's new in Parity
        </button>
        <button type="button" className="hover:text-foreground">
          Docs
        </button>
        <span className="flex items-center gap-1.5">
          Shortcuts <Kbd>Ctrl /</Kbd>
        </span>
      </div>
    </footer>
  )
}

/** A quiet wash of Parity's colors at the top of the page. */
export function Backdrop({ strength = 1 }: { strength?: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
      style={{
        background: `radial-gradient(45% 60% at 22% 0%, ${accent(220, 0.6, 0.14)} 0%, transparent 70%), radial-gradient(40% 55% at 60% 0%, ${accent(285, 0.55, 0.18)} 0%, transparent 70%)`,
        opacity: 0.11 * strength
      }}
    />
  )
}

/** Home: what needs you, where you left off, your projects, and something new. */
export function HomePage({
  onNewProject,
  onSearch,
  onPickTemplate,
  onPickExisting
}: {
  onNewProject?(): void
  onSearch?(): void
  onPickTemplate?(template: Template): void
  onPickExisting?(): void
}) {
  return (
    <div className="relative h-full overflow-y-auto">
      <Backdrop />
      <div className="relative mx-auto flex max-w-[1180px] flex-col gap-10 px-10 pt-8 pb-12">
        <header className="flex items-end justify-between gap-8">
          <div className="flex flex-col gap-2.5">
            <OrgSwitcher />
            <h1 className="text-[30px] leading-none font-semibold tracking-tight">Good evening, Andrew</h1>
            <p className="text-[15px] text-muted-foreground">
              Cursor is waiting on you, Maya mentioned you, and Priya asked for a review.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SearchButton onOpen={onSearch} />
            <OpenMenu />
            <NewProjectButton onClick={onNewProject} />
          </div>
        </header>
        <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-5">
          <ContinueCard />
          <ForYouPanel />
        </div>
        <RecentProjects skip={lastVisit.project} rows={1} />
        <StartNew onPickTemplate={onPickTemplate} onPickExisting={onPickExisting} />
        <StartFooter />
      </div>
    </div>
  )
}

/** A new tab: one field to go anywhere, your projects, and something new. */
export function NewTabPage({
  onNewProject,
  onSearch,
  onPickTemplate,
  onPickExisting
}: {
  onNewProject?(): void
  onSearch?(): void
  onPickTemplate?(template: Template): void
  onPickExisting?(): void
}) {
  return (
    <div className="relative h-full overflow-y-auto">
      <Backdrop strength={0.7} />
      <div className="relative mx-auto flex max-w-[1180px] flex-col gap-11 px-10 pt-14 pb-12">
        <div className="mx-auto flex w-full max-w-[680px] flex-col items-center gap-4">
          <SearchButton large onOpen={onSearch} />
          <div className="flex items-center gap-2">
            <NewProjectButton onClick={onNewProject} size="default" />
            <OpenMenu size="default" />
          </div>
        </div>
        <RecentProjects rows={2} />
        <StartNew onPickTemplate={onPickTemplate} onPickExisting={onPickExisting} />
        <StartFooter />
      </div>
    </div>
  )
}
