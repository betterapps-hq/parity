import {
  AtSign,
  Bell,
  ChevronsUpDown,
  Component,
  Eye,
  GitMerge,
  MessageSquare,
  Search,
  Sparkles,
  UserPlus
} from "lucide-react"
import type { ReactNode } from "react"
import { Kbd } from "@/components/ui/kbd"
import {
  type Activity,
  type ActivityKind,
  me,
  organization,
  type Organization,
  type Project,
  type Template
} from "./explore-data.ts"
import { accent, Avatar, AvatarStack, ProjectThumb, SourceIcon, TemplateArt } from "./parts.tsx"

/** The org's initial on its color. */
export function OrgBadge({ org, size = 20 }: { org: Organization; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-md font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.5, background: accent(org.hue, 0.55, 0.14) }}
    >
      {org.name[0]}
    </span>
  )
}

/** Which organization's projects show, and the way to switch. */
export function OrgSwitcher({ org, className = "" }: { org: Organization; className?: string }) {
  return (
    <button
      type="button"
      className={`flex items-center gap-2 rounded-lg border bg-background/60 px-2 py-1.5 text-sm hover:bg-muted/60 ${className}`}
    >
      <OrgBadge org={org} />
      <span className="min-w-0 flex-1 truncate text-left font-medium">{org.name}</span>
      <ChevronsUpDown className="size-3.5 text-muted-foreground" />
    </button>
  )
}

/** One field for everything: projects, templates, people, or a repository's URL to open. */
export function CommandBar({ placeholder }: { placeholder?: string }) {
  return (
    <div className="flex h-12 items-center gap-3 rounded-xl border bg-card px-4 shadow-sm">
      <Search className="size-4 text-muted-foreground" />
      <span className="flex-1 text-sm text-muted-foreground">
        {placeholder ?? "Search projects, templates and people, or paste a repository URL"}
      </span>
      <Kbd>Ctrl K</Kbd>
    </div>
  )
}

/** Account and inbox, at the end of the title bar. */
export function TitleBarActions({ unread = 3 }: { unread?: number }) {
  return (
    <>
      <span className="relative grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent">
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[oklch(0.65_0.21_25)] px-1 text-[9px] font-semibold text-white">
            {unread}
          </span>
        )}
      </span>
      <Avatar person={me} size={24} className="ml-1" />
    </>
  )
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-sm font-semibold">{title}</h2>
      {action && <span className="text-xs text-muted-foreground hover:text-foreground">{action}</span>}
    </div>
  )
}

/** A project's thumbnail, then its name, where it lives and who touched it last. */
export function ProjectCard({ project, showOrg }: { project: Project; showOrg?: boolean }) {
  return (
    <div className="group flex flex-col gap-2.5">
      <div className="relative">
        <ProjectThumb
          project={project}
          className="ring-1 ring-border transition group-hover:ring-2 group-hover:ring-[oklch(0.65_0.15_275)]"
        />
        <div className="absolute top-2 left-2 flex gap-1.5">
          {project.agents && (
            <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white backdrop-blur">
              <span className="size-1.5 animate-pulse rounded-full bg-[oklch(0.75_0.17_162)]" />
              {project.agents[0]!.name} is working
            </span>
          )}
          {project.open && (
            <span className="rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white backdrop-blur">
              Open in a tab
            </span>
          )}
        </div>
      </div>
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{project.name}</span>
          <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <SourceIcon type={project.source.type} className="size-3 shrink-0" />
            {showOrg ? `${organization(project.org).name}, ` : ""}
            {project.edited} by {project.editedBy === me ? "you" : project.editedBy.name.split(" ")[0]}
          </span>
        </div>
        <AvatarStack people={project.people} size={20} max={3} />
      </div>
    </div>
  )
}

/** A Scaffolder template: its screen, name, and what it's for. */
export function TemplateCard({ template, stack }: { template: Template; stack?: boolean }) {
  return (
    <div className="group flex flex-col gap-2">
      <TemplateArt
        kind={template.kind}
        hue={template.hue}
        className="ring-1 ring-border transition group-hover:ring-2 group-hover:ring-[oklch(0.65_0.15_275)]"
      />
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{template.name}</span>
        <span className="text-xs text-muted-foreground">{template.blurb}</span>
      </div>
      {stack && (
        <div className="flex flex-wrap gap-1">
          {template.stack.map((item) => (
            <span key={item} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const kindIcons: Record<ActivityKind, typeof AtSign> = {
  mention: AtSign,
  comment: MessageSquare,
  agent: Sparkles,
  review: Eye,
  merge: GitMerge,
  publish: Component,
  invite: UserPlus
}

/** What happened, as a sentence: who, what, on which design, in which project. */
export function ActivityText({ item }: { item: Activity }) {
  return (
    <span>
      <span className="font-medium text-foreground">{item.who.name}</span> {item.action}{" "}
      {item.design && (
        <>
          <span className="font-medium text-foreground">{item.design}</span> in{" "}
        </>
      )}
      <span className="font-medium text-foreground">{item.project}</span>
    </span>
  )
}

/** An activity in a list: the person with what kind of thing it was, the sentence, the quote and when. */
export function ActivityRow({ item, compact }: { item: Activity; compact?: boolean }) {
  const Icon = kindIcons[item.kind]
  return (
    <div className={`relative flex gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/40 ${item.unread ? "" : "opacity-80"}`}>
      <span className="relative h-fit">
        <Avatar person={item.who} size={28} />
        <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-background ring-1 ring-border">
          <Icon className="size-2.5 text-muted-foreground" />
        </span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] leading-snug text-muted-foreground">
        <ActivityText item={item} />
        {item.quote && !compact && (
          <span className="line-clamp-2 rounded-md border-l-2 border-border pl-2 text-foreground/80">{item.quote}</span>
        )}
        <span className="text-xs">{item.when}</span>
      </div>
      {item.unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[oklch(0.65_0.18_250)]" />}
    </div>
  )
}
