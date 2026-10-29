/**
 * The portal: Parity on the web, where a team sees what its people and agents are doing, finds what it's been tagged
 * in, and opens designs to see what changed. Opening a project goes straight to its canvas, in the browser or the
 * desktop app, as Figma does; there's no project page in between. Built from the start page's parts.
 */
import {
  Activity,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code,
  Download,
  House,
  Inbox,
  Lock,
  PenLine,
  Plus,
  RotateCw,
  Search,
  Settings,
  Star,
  UserPlus,
  Users,
  X
} from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { me, type Person } from "../explore-data.ts"
import { Avatar, ParityMark } from "../parts.tsx"
import { OrgBadge, OrgSwitcher } from "../start-page-parts.tsx"
import { CanvasArt } from "../start/page.tsx"
import { DesignRender } from "../start/renders.tsx"
import { designOf, type Handoff, handoff, kestrel, needsYou, portalProject, teams, type Whereabouts } from "./data.ts"

/** The browser around the portal: one tab, the address, and the page. */
export function PortalWindow({ path, children }: { path: string; children: ReactNode }) {
  return (
    <div className="flex h-screen min-h-[720px] flex-col bg-background text-foreground">
      <div className="flex h-9 shrink-0 items-end gap-2 bg-neutral-200 px-2 dark:bg-[#1b1b1e]">
        <div className="flex h-7 w-56 items-center gap-2 rounded-t-lg bg-neutral-100 px-3 text-xs dark:bg-[#0f0f11]">
          <ParityMark size={14} />
          <span className="flex-1 truncate">Parity</span>
          <X className="size-3 text-muted-foreground" />
        </div>
        <Plus className="mb-1.5 size-3.5 text-muted-foreground" />
      </div>
      <div className="flex h-10 shrink-0 items-center gap-3 border-b bg-neutral-100 px-3 text-muted-foreground dark:bg-[#0f0f11]">
        <ChevronLeft className="size-4" />
        <ChevronRight className="size-4 opacity-40" />
        <RotateCw className="size-3.5" />
        <div className="flex h-7 flex-1 items-center gap-2 rounded-full bg-background px-3 text-xs">
          <Lock className="size-3" />
          <span className="text-foreground">parity.app</span>
          <span>/{path}</span>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  )
}

function NavItem({
  icon,
  label,
  active,
  count,
  dot
}: {
  icon: ReactNode
  label: string
  active?: boolean
  count?: number
  /** Something unread: the count is drawn as a badge. */
  dot?: boolean
}) {
  return (
    <span
      className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm ${
        active
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      }`}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined &&
        (dot ? (
          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[oklch(0.62_0.19_256)] px-1 text-[10px] font-semibold text-white">
            {count}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
        ))}
    </span>
  )
}

function NavHeading({ children }: { children: ReactNode }) {
  return <span className="px-2.5 pt-4 pb-1 text-xs font-medium text-muted-foreground">{children}</span>
}

export type PortalPlace =
  | "home"
  | "inbox"
  | "activity"
  | "handoff"
  | "recents"
  | "starred"
  | "shared"
  | "drafts"
  | "apps"
  | "web"
  | "settings"

const readyToBuild = Object.values(handoff).filter((status) => status === "Ready to build").length

/** The places down the side: you, the org's projects, your teams, the org's settings, and you. */
export function PortalNav({ active }: { active: PortalPlace }) {
  return (
    <nav className="flex w-60 shrink-0 flex-col gap-0.5 border-r bg-neutral-50/50 p-3 dark:bg-[#0d0d0f]">
      <div className="mb-2 flex items-center gap-2">
        <ParityMark size={26} />
        <OrgSwitcher org={kestrel} className="min-w-0 flex-1" />
      </div>
      <div className="mb-2 flex gap-1.5">
        <div className="flex h-8 flex-1 items-center gap-2 rounded-md border bg-background/60 px-2.5 text-sm text-muted-foreground">
          <Search className="size-3.5" />
          <span className="flex-1">Search</span>
          <Kbd>Ctrl K</Kbd>
        </div>
        <Button size="icon-sm" aria-label="New project">
          <Plus />
        </Button>
      </div>
      <NavItem icon={<House className="size-4" />} label="For you" active={active === "home"} />
      <NavItem
        icon={<Inbox className="size-4" />}
        label="Inbox"
        count={needsYou.length}
        dot
        active={active === "inbox"}
      />
      <NavItem icon={<Activity className="size-4" />} label="Activity" active={active === "activity"} />
      <NavItem icon={<Code className="size-4" />} label="Handoff" count={readyToBuild} active={active === "handoff"} />
      <NavHeading>Projects</NavHeading>
      <NavItem icon={<Clock className="size-4" />} label="Recents" active={active === "recents"} />
      <NavItem icon={<Star className="size-4" />} label="Starred" count={3} active={active === "starred"} />
      <NavItem icon={<Users className="size-4" />} label="Shared with you" count={2} active={active === "shared"} />
      <NavItem icon={<PenLine className="size-4" />} label="Drafts" count={2} active={active === "drafts"} />
      <NavHeading>Your teams</NavHeading>
      <NavItem icon={<OrgBadge org={teams.apps.org} size={16} />} label="Apps" active={active === "apps"} />
      <NavItem icon={<OrgBadge org={teams.web.org} size={16} />} label="Web" active={active === "web"} />
      <NavItem icon={<Plus className="size-4" />} label="Browse teams" />
      <div className="mt-auto flex flex-col gap-0.5">
        <NavItem icon={<UserPlus className="size-4" />} label="Invite teammates" />
        <NavItem icon={<Settings className="size-4" />} label="Kestrel settings" active={active === "settings"} />
        <div className="mt-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <Avatar person={me} size={26} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm">{me.name}</span>
            <span className="truncate text-[11px] text-muted-foreground">Admin</span>
          </span>
          <span title="Parity for desktop" className="text-muted-foreground">
            <Download className="size-4" aria-label="Get Parity for desktop" />
          </span>
        </div>
      </div>
    </nav>
  )
}

/** A portal page: the browser, the places down the side, and the page itself. */
export function PortalPage({ active, path, children }: { active: PortalPlace; path: string; children: ReactNode }) {
  return (
    <PortalWindow path={path}>
      <div className="flex h-full">
        <PortalNav active={active} />
        <div className="relative min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </PortalWindow>
  )
}

/** The page's top line: its title, then whatever the page puts beside it. */
export function PortalHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {children}
    </div>
  )
}

/** Filters as pills, the first one picked. */
export function Pills({ options, picked = 0 }: { options: string[]; picked?: number }) {
  return (
    <div className="flex items-center gap-1 text-sm">
      {options.map((option, index) => (
        <span
          key={option}
          className={`rounded-full px-3 py-1 ${index === picked ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
        >
          {option}
        </span>
      ))}
    </div>
  )
}

/** Someone's avatar with a dot: green while they're in a project, none once they've left. */
export function HereAvatar({ person, size = 28, away }: { person: Person; size?: number; away?: boolean }) {
  return (
    <span className="relative shrink-0">
      <Avatar person={person} size={size} className={away ? "opacity-50" : ""} />
      {!away && (
        <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-[oklch(0.75_0.17_162)] ring-2 ring-background" />
      )}
    </span>
  )
}

/** Where someone is, in a few words: the board and project, who an agent works for, or when they left. */
function whereabouts(where: Whereabouts): string {
  const name = portalProject(where.project).name
  if (where.away) return `Left ${where.design} in ${name}, ${where.away}`
  const forWhom = where.for ? `, for ${where.for === me ? "you" : where.for.name.split(" ")[0]}` : ""
  return `${where.design} in ${name}${forWhom}`
}

/** Joining a person follows them on the canvas; an agent is watched, since it can't be followed into a conversation. */
function joinLabel(where: Whereabouts): string {
  return where.who.agent ? "Watch" : "Join"
}

/** A teammate in the side list: where they are, and a way to join them on the canvas. */
export function WhereaboutsRow({ where }: { where: Whereabouts }) {
  return (
    <div className="group/row flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50">
      <HereAvatar person={where.who} away={!!where.away} />
      <span className="flex min-w-0 flex-1 flex-col text-sm">
        <span className="truncate">{where.who.name}</span>
        <span className="truncate text-xs text-muted-foreground">{whereabouts(where)}</span>
      </span>
      {!where.away && (
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
          {joinLabel(where)}
        </Button>
      )}
    </div>
  )
}

/**
 * A teammate as the team page shows them: the canvas they're on with their cursor in it, and a way to join them there.
 * Joining opens that canvas and follows them.
 */
export function TeammateCard({ where }: { where: Whereabouts }) {
  const shown = portalProject(where.project)
  const live = where.away ? undefined : { who: where.who, doing: where.doing }
  return (
    <article className="group/card flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-xl ring-1 ring-white/[0.08] transition-shadow group-hover/card:ring-2 group-hover/card:ring-[oklch(0.7_0.16_275)]">
        <CanvasArt
          project={{ ...shown, live }}
          design={designOf(shown, where.design)}
          className={where.away ? "opacity-60 grayscale-[0.4]" : ""}
        />
      </div>
      <div className="flex items-center gap-3">
        <HereAvatar person={where.who} size={32} away={!!where.away} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{where.who.name}</span>
          <span className="truncate text-xs text-muted-foreground">{whereabouts(where)}</span>
        </span>
        {!where.away && (
          <Button size="sm" variant="outline">
            {joinLabel(where)}
          </Button>
        )}
      </div>
    </article>
  )
}

const handoffColors: Record<Handoff, string> = {
  "In review": "oklch(0.8 0.15 80)",
  "Ready to build": "oklch(0.72 0.16 275)",
  "Matches main": "oklch(0.75 0.17 162)",
  "Differs from main": "oklch(0.7 0.19 30)"
}

/** Where a board stands between design and code, as a small colored label. */
export function HandoffPill({ status }: { status: Handoff }) {
  const color = handoffColors[status]
  return (
    <span
      className="inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{ color, background: `color-mix(in oklch, ${color} 14%, transparent)` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {status}
    </span>
  )
}

/** A design as its app draws it, with its name and where it stands under it, framed like a board on the canvas. */
export function DesignTile({
  project: id,
  design,
  mobile,
  changed,
  className = ""
}: {
  project: string
  design: string
  /** Its phone mode. */
  mobile?: boolean
  /** Marked as changed since you last looked. */
  changed?: boolean
  className?: string
}) {
  const shown = portalProject(id)
  const picked = designOf(shown, design)
  const status = handoff[`${id}/${picked.name}`]
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div
        className={`overflow-hidden rounded-md ${changed ? "ring-2 ring-[oklch(0.7_0.16_275)]" : "ring-1 ring-border"}`}
      >
        <DesignRender kind={picked.kind} look={shown.look} mobile={mobile} />
      </div>
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {changed && <span className="size-1.5 rounded-full bg-[oklch(0.7_0.16_275)]" />}
        <span className="min-w-0 flex-1 truncate">{mobile ? `${picked.name}, phone` : picked.name}</span>
        {status && !mobile && <HandoffPill status={status} />}
      </span>
    </div>
  )
}

/** A card in a feed: who, what happened and when on top, then whatever the card shows. */
export function FeedCard({
  who,
  children,
  line,
  when
}: {
  who: Person
  line: ReactNode
  when: string
  children?: ReactNode
}) {
  return (
    <div className="flex gap-3">
      <Avatar person={who} size={32} />
      <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-xl border bg-card p-4">
        <div className="flex items-baseline gap-2 text-sm text-muted-foreground">
          <span className="min-w-0 flex-1">{line}</span>
          <span className="shrink-0 text-xs">{when}</span>
        </div>
        {children}
      </div>
    </div>
  )
}

/** A name in a feed line. */
export function Name({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>
}

/** A quiet "See all" link for a section's end. */
export function SeeAll({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
      {children} <ArrowRight className="size-3" />
    </span>
  )
}

const settingsTabs = ["General", "Members", "Teams", "Billing", "Security", "Integrations"] as const

/** The org's settings: a row of tabs for its parts, then the part picked. Only admins see them. */
export function SettingsPage({ tab, children }: { tab: (typeof settingsTabs)[number]; children: ReactNode }) {
  return (
    <PortalPage active="settings" path={`kestrel/settings/${tab.toLowerCase()}`}>
      <div className="flex flex-col gap-6 px-8 py-7">
        <PortalHeader title="Kestrel settings" />
        <div className="-mt-2 flex gap-5 border-b text-sm">
          {settingsTabs.map((name) => (
            <span
              key={name}
              className={`-mb-px border-b-2 pb-2.5 ${name === tab ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground"}`}
            >
              {name}
            </span>
          ))}
        </div>
        {children}
      </div>
    </PortalPage>
  )
}
