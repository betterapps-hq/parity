import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Menubar,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  MenubarShortcut,
  DropdownMenuShortcut,
  Kbd
} from "@buildkitgg/shadcn-baseui-kit"
/**
 * The start page's parts: what Home, a new tab and the first run are built from. The design is one page in three
 * contexts, so a person learns it once. It stays quiet: a render of each project and a few words about it, with the
 * rest a click away, and every control does what it says.
 */
import {
  AppWindow,
  ArrowRight,
  Bell,
  BookOpen,
  ChevronDown,
  ChevronsUpDown,
  CopyPlus,
  Ellipsis,
  FileInput,
  FolderOpen,
  KeyRound,
  Keyboard,
  Link,
  LogIn,
  LogOut,
  Plus,
  Search,
  Settings,
  Sparkles,
  Star,
  UserPlus,
  UserRound,
  X
} from "lucide-react"
import { createContext, type CSSProperties, type ReactNode, useContext, useEffect, useRef, useState } from "react"
import { agentPalettes } from "../../agent/agent-colors.ts"
import { AgentBadge, AgentPointer } from "../../agent/AgentPointer.tsx"
import { formatKeys } from "../../chrome/keys.ts"
import { me, people, type Person } from "../explore-data.ts"
import { Avatar, AzureDevOpsMark, ExploreWindow, GitHubMark, type MockTab } from "../parts.tsx"
import { OrgBadge } from "../start-page-parts.tsx"
import {
  type Design,
  type ForYouItem,
  forYou,
  lastVisits,
  organizations,
  type OrgId,
  project as findProject,
  projects,
  type Stack,
  stack as findStack,
  type StartProject,
  type Template,
  type Visit
} from "./data.ts"
import type { NewProjectStart } from "./new-project.tsx"
import { DesignRender } from "./renders.tsx"

/** Parity's own accent, from its mark: hover rings, focus and the odd highlight. */
export const parity = "oklch(0.7 0.16 275)"

/** What the start page's controls do. The stories wire them up; in the app, the workspace will. */
export interface StartActions {
  /** Open a project in a tab, or switch to the tab it's already in. */
  openProject?(id: string): void
  /** Open a project that was just made, cloned or opened from a folder. */
  create?(project: StartProject): void
  newProject?(start?: NewProjectStart): void
  search?: () => void
  /** For you items already dealt with, and the way to deal with them. */
  done?: readonly string[]
  markDone?(...ids: string[]): void
  /** The agents connected to your account, by name, and the way to connect one. */
  agents?: readonly string[]
  connectAgent?(name: string): void
  /** Who's signed in, or null for nobody. Left out, it's someone in Kestrel, as the start page's own stories show. */
  account?: StartAccount | null
  signIn?(): void
  signOut?(): void
  /** Say why signing in lasts only until Parity quits. */
  explainUntilQuit?(): void
}

/** Someone signed in, as the window knows them: no tokens, only who they are and where they belong. */
export interface StartAccount {
  email: string
  /** The organizations they're in. Personal isn't one of WorkOS's: it's what belongs to no organization. */
  orgs: readonly OrgId[]
  /** The system has no keychain, so the sign-in lasts until Parity quits. */
  untilQuit?: boolean
}

/** Someone in Kestrel, as an editor: who the start page's stories are signed in as. */
export const kestrelMember: StartAccount = { email: "andrew@kestrel.dev", orgs: ["kestrel", "personal"] }

/**
 * Who's working in a project right now, as far as you can see: agents on this computer always, and people only once
 * you're signed in, since their presence comes through your organization.
 */
function useLive(project: StartProject): StartProject["live"] {
  const account = useAccount()
  return project.live && (account || project.live.who.agent) ? project.live : undefined
}

/** What's waiting for you and not dealt with: only from the organizations you're in, and nothing signed out. */
function useWaiting(): ForYouItem[] {
  const start = useStart()
  const account = useAccount()
  if (!account) return []
  return forYou.filter((item) => {
    const org = projects.find((candidate) => candidate.name === item.project)?.org
    return !start.done?.includes(item.id) && (!org || account.orgs.includes(org))
  })
}

/** Who's signed in, with the start page stories' Kestrel member when no one said. */
export function useAccount(): StartAccount | null {
  const { account } = useStart()
  return account === undefined ? kestrelMember : account
}

/** The agents Parity can connect to. */
export const agentChoices: Person[] = [people.claude, people.cursor, { name: "Codex", hue: 160, agent: true }]

const StartContext = createContext<StartActions>({})

export const StartActionsProvider = StartContext.Provider

export function useStart(): StartActions {
  return useContext(StartContext)
}

/** The window around a start page: tabs and menus that work, and the inbox and your account in the title bar. */
export function StartWindow({
  tabs,
  active,
  canvas,
  inbox = true,
  onSelect,
  onClose,
  onNew,
  children
}: {
  tabs: MockTab[]
  active: string
  /** The active tab is a project's canvas, so the canvas's menu items apply. */
  canvas?: boolean
  /** Show what's waiting in the inbox; off before there's anything to wait for. */
  inbox?: boolean
  onSelect?: (id: string) => void
  onClose?: (id: string) => void
  onNew?: () => void
  children: ReactNode
}) {
  const account = useAccount()
  return (
    <ExploreWindow
      tabs={tabs}
      active={active}
      menus={
        <StartMenus
          canvas={canvas}
          onNewTab={onNew}
          onCloseTab={active === "home" ? undefined : () => onClose?.(active)}
          onHome={() => onSelect?.("home")}
        />
      }
      actions={
        <>
          {/* What waits for you comes from your organization, so there's no inbox until you sign in. */}
          {account && <Inbox enabled={inbox} />}
          <AccountMenu />
        </>
      }
      onSelect={onSelect}
      onClose={onClose}
      onNew={onNew}
    >
      <style>{liveStyles}</style>
      {children}
    </ExploreWindow>
  )
}

const menuTrigger =
  "h-auto rounded-md px-2 py-1 text-[13px] font-normal text-muted-foreground focus:bg-black/5 aria-expanded:bg-black/5 aria-expanded:text-foreground dark:focus:bg-white/5 dark:aria-expanded:bg-white/5"

/** The app's menus, as far as the start page goes: what arranges boards waits for a project's canvas. */
function StartMenus({
  canvas,
  onNewTab,
  onCloseTab,
  onHome
}: {
  canvas?: boolean
  onNewTab?: () => void
  onCloseTab?: () => void
  onHome?: () => void
}) {
  const start = useStart()
  return (
    <Menubar className="h-auto gap-0 rounded-none border-0 bg-transparent p-0 shadow-none">
      <MenubarMenu>
        <MenubarTrigger className={menuTrigger}>File</MenubarTrigger>
        <MenubarContent className="w-60">
          <MenubarItem onClick={() => start.newProject?.()}>
            New project <MenubarShortcut>{formatKeys("Ctrl N")}</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={onNewTab}>
            New tab <MenubarShortcut>{formatKeys("Ctrl T")}</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => start.newProject?.({ tab: "existing", source: "folder" })}>
            Open a folder <MenubarShortcut>{formatKeys("Ctrl O")}</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => start.newProject?.({ tab: "existing", source: "github" })}>
            Clone a repository
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem disabled={!onCloseTab} onClick={onCloseTab}>
            Close tab <MenubarShortcut>{formatKeys("Ctrl W")}</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className={menuTrigger}>Edit</MenubarTrigger>
        <MenubarContent className="w-60">
          <MenubarItem disabled={!canvas}>
            Undo <MenubarShortcut>{formatKeys("Ctrl Z")}</MenubarShortcut>
          </MenubarItem>
          <MenubarItem disabled={!canvas}>
            Redo <MenubarShortcut>{formatKeys("Ctrl Y")}</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => start.search?.()}>
            Search <MenubarShortcut>{formatKeys("Ctrl K")}</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className={menuTrigger}>View</MenubarTrigger>
        <MenubarContent className="w-60">
          <MenubarItem onClick={onHome}>
            Home <MenubarShortcut>{formatKeys("Ctrl Shift H")}</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem disabled={!canvas}>
            Zoom in <MenubarShortcut>{formatKeys("Ctrl =")}</MenubarShortcut>
          </MenubarItem>
          <MenubarItem disabled={!canvas}>
            Zoom out <MenubarShortcut>{formatKeys("Ctrl -")}</MenubarShortcut>
          </MenubarItem>
          <MenubarItem disabled={!canvas}>
            Zoom to fit <MenubarShortcut>{formatKeys("Shift 1")}</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className={menuTrigger}>Arrange</MenubarTrigger>
        <MenubarContent className="w-60">
          {!canvas && (
            <MenubarGroup>
              <MenubarLabel className="text-xs font-normal text-muted-foreground">
                Open a project to arrange its boards
              </MenubarLabel>
            </MenubarGroup>
          )}
          <MenubarItem disabled={!canvas}>Bring to front</MenubarItem>
          <MenubarItem disabled={!canvas}>Send to back</MenubarItem>
          <MenubarSeparator />
          <MenubarItem disabled={!canvas}>Align</MenubarItem>
          <MenubarItem disabled={!canvas}>Distribute</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}

/** The inbox in the title bar: everything waiting for you, across every project. */
function Inbox({ enabled }: { enabled: boolean }) {
  const start = useStart()
  const [open, setOpen] = useState(false)
  const all = useWaiting()
  const waiting = enabled ? all : []
  const unread = waiting.filter((item) => item.unread).length
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={unread ? `Inbox, ${unread} unread` : "Inbox"}
            className="relative grid size-7 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-accent aria-expanded:text-foreground"
          >
            <Bell className="size-4" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[oklch(0.65_0.21_25)] px-1 text-[9px] font-semibold text-white">
                {unread}
              </span>
            )}
          </button>
        }
      />
      <PopoverContent align="end" sideOffset={6} className="w-[380px] gap-0 p-0">
        <header className="flex h-11 items-center justify-between border-b px-4">
          <span className="text-sm font-semibold">Inbox</span>
          {waiting.length > 0 && (
            <button
              type="button"
              onClick={() => start.markDone?.(...waiting.map((item) => item.id))}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Mark all done
            </button>
          )}
        </header>
        {waiting.length > 0 ? (
          <ul className="flex flex-col px-3 py-2">
            {waiting.map((item) => (
              <ForYouRow key={item.id} item={item} onOpen={() => setOpen(false)} />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing needs you right now.</p>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Nobody's avatar: an outline of a person, where yours goes once you sign in. */
function NobodyAvatar({ size }: { size: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground"
      style={{ width: size, height: size }}
    >
      <UserRound style={{ width: size * 0.58, height: size * 0.58 }} />
    </span>
  )
}

/**
 * Your account: who you are and where, the agents that can work in your projects, settings and help. Signed out, it
 * offers Sign in in your name's place and keeps the rest, since settings and help don't need an account.
 */
export function AccountMenu() {
  const start = useStart()
  const account = useAccount()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={account ? "Your account" : "Sign in, settings and help"}
            className="ml-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {account ? <Avatar person={me} size={24} /> : <NobodyAvatar size={24} />}
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-64">
        {account ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-2.5 py-2 font-normal">
              <Avatar person={me} size={28} />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium text-foreground">{me.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {/* Someone in no organization yet has no role to show, so their email says which account it is. */}
                  {account.orgs.includes("kestrel") ? "Kestrel, editor" : account.email}
                </span>
              </span>
            </DropdownMenuLabel>
            {account.untilQuit && (
              <DropdownMenuItem onClick={() => start.explainUntilQuit?.()} className="text-xs text-muted-foreground">
                <KeyRound /> Signed in until you quit Parity
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        ) : (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-2.5 py-2 font-normal">
              <NobodyAvatar size={28} />
              <span className="flex flex-col">
                <span className="text-sm font-medium text-foreground">Not signed in</span>
                <span className="text-xs text-muted-foreground">Projects on this computer still work</span>
              </span>
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => start.signIn?.()}>
              <LogIn /> Sign in
            </DropdownMenuItem>
          </DropdownMenuGroup>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Agents</DropdownMenuLabel>
          {agentChoices.map((agent) => {
            const on = !!start.agents?.includes(agent.name)
            return (
              <DropdownMenuItem
                key={agent.name}
                closeOnClick={on}
                onClick={() => {
                  if (!on) start.connectAgent?.(agent.name)
                }}
              >
                <Avatar person={agent} size={18} /> {agent.name}
                <span className={`ml-auto text-xs ${on ? "text-muted-foreground" : "font-medium text-foreground"}`}>
                  {on ? "Connected" : "Connect"}
                </span>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Settings /> Settings <DropdownMenuShortcut>{formatKeys("Ctrl ,")}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Keyboard /> Keyboard shortcuts <DropdownMenuShortcut>{formatKeys("Ctrl /")}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <BookOpen /> Docs
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Sparkles /> What&apos;s new
        </DropdownMenuItem>
        {account && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => start.signOut?.()}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
      className={`${/\b(absolute|fixed)\b/.test(className) ? "" : "relative"} overflow-hidden bg-[#0f0f12] ${className}`}
      style={fill ? undefined : { aspectRatio: "16 / 10" }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(70% 60% at 30% 25%, oklch(0.55 0.14 ${look.hue} / 0.18), transparent 70%), radial-gradient(50% 50% at 90% 100%, oklch(0.55 0.12 ${look.hue + 60} / 0.1), transparent 70%)`
        }}
      />
      {/* The boards keep the canvas's proportions, centered when the box is taller. */}
      <div className="absolute inset-x-0 top-1/2 aspect-[16/10] -translate-y-1/2">
        <div
          className={frame}
          style={
            design.mobile
              ? { left: labels ? "5%" : "6%", top: labels ? "16%" : "9%", width: labels ? "69%" : "72%" }
              : { left: "8%", top: labels ? "12%" : "8%", width: "84%" }
          }
        >
          {labels && <span className={label}>{design.name}</span>}
          <DesignRender kind={design.kind} look={look} className="rounded-[5px]" />
        </div>
        {/* With labels, the phone stands clear of the desktop frame so its name reads on the canvas. */}
        {design.mobile && (
          <div
            className={`${frame} rounded-[9px]`}
            style={{ right: labels ? "5%" : "6%", top: labels ? "18%" : "22%", width: "19%" }}
          >
            {labels && <span className={label}>Phone</span>}
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
    </div>
  )
}

/** A project's tab, standing in for its canvas: the board you were on, with whoever is there. */
export function ProjectTab({ project }: { project: StartProject }) {
  const visit = Object.values(lastVisits).find((candidate) => candidate.project === project.id)
  const design = project.designs.find((item) => item.name === visit?.design) ?? project.designs[0]
  if (!design)
    return (
      <div className="absolute inset-0 grid place-items-center bg-[#0f0f12] text-sm text-muted-foreground">
        <p className="max-w-[340px] text-center text-pretty">
          {project.name} has no boards yet. Parity found its components; drag one onto the canvas to start a design.
        </p>
      </div>
    )
  return (
    <CanvasArt project={project} design={design} labels pins={!!project.comments} fill className="absolute inset-0" />
  )
}

function firstName(person: Person): string {
  return person.agent ? person.name : person.name.split(" ")[0]!
}

/** "Edited 12 min ago by Maya", or "edited yesterday by you". */
function editedBy(project: StartProject): string {
  const who = project.editedBy === me ? "you" : firstName(project.editedBy)
  const when = /^\d/.test(project.edited) ? project.edited : project.edited.toLowerCase()
  return `Edited ${when} by ${who}`
}

/** "a, b and c". */
function listed(items: string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`
}

/** Someone in a project right now: their avatar, with a dot. */
function Here({ who, className = "" }: { who: Person; className?: string }) {
  const label = who.agent ? `${who.name} is working here` : `${firstName(who)} is here`
  return (
    <span className={`relative flex ${className}`} title={label}>
      <Avatar person={who} size={22} />
      <span className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full bg-[oklch(0.76_0.15_155)] ring-2 ring-background" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** What you can do with a project from the start page. */
function ProjectMenu({
  project,
  starred,
  onStar,
  onRemove,
  className = ""
}: {
  project: StartProject
  starred?: boolean
  onStar?: () => void
  onRemove?: () => void
  className?: string
}) {
  const start = useStart()
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
        <DropdownMenuItem onClick={() => start.openProject?.(project.id)}>
          <AppWindow /> Open
        </DropdownMenuItem>
        {onStar && (
          <DropdownMenuItem onClick={onStar}>
            <Star /> {starred ? "Unstar" : "Star"}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={() => start.newProject?.({ tab: "existing", source: "projects", project: project.id })}
        >
          <CopyPlus /> New project from this
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => void navigator.clipboard?.writeText(`parity://${project.id}`).catch(() => undefined)}
        >
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

/**
 * A project: a render of its canvas, its name and when it was last touched, and who's there right now. Moving the
 * pointer across the picture flips through its designs.
 */
export function ProjectCard({
  project,
  showOrg,
  starred = project.starred,
  onStar,
  onRemove
}: {
  project: StartProject
  showOrg?: boolean
  starred?: boolean
  onStar?: () => void
  /** Take it off the list it's on. */
  onRemove?: () => void
}) {
  const start = useStart()
  const live = useLive(project)
  const art = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const design = project.designs[index]!
  const many = project.designs.length > 1
  return (
    <article
      className="group/card relative flex flex-col gap-2.5"
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
        className="relative overflow-hidden rounded-lg ring-1 ring-white/[0.07] transition-shadow duration-150 group-hover/card:ring-2 group-hover/card:ring-(--parity)"
        style={{ ["--parity" as string]: parity }}
      >
        <CanvasArt project={project} design={design} live={false} />
        {many && (
          <div
            className={`absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pt-6 pb-2.5 transition-opacity duration-150 ${
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
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="text-sm font-medium">
            <button
              type="button"
              onClick={() => start.openProject?.(project.id)}
              className="block max-w-full truncate text-left outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              {project.name}
            </button>
          </h3>
          <span className="truncate text-xs text-muted-foreground">
            {showOrg ? `${organizations[project.org].name}, ` : ""}
            {editedBy(project)}
          </span>
        </div>
        <span className="relative z-10 grid size-7 shrink-0 place-items-center">
          {live && (
            <Here
              who={live.who}
              className="transition-opacity group-hover/card:opacity-0 group-has-aria-expanded/card:opacity-0"
            />
          )}
          <ProjectMenu
            project={project}
            starred={starred}
            onStar={onStar}
            onRemove={onRemove}
            className="absolute inset-0 opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
          />
        </span>
      </div>
    </article>
  )
}

/** The project you were last in, as you left it, and what happened there since. Enter resumes it. */
export function ContinueCard({ visit }: { visit: Visit }) {
  const start = useStart()
  const project = findProject(visit.project)
  const live = useLive(project)
  // Signed out, what people did comes through no organization, but what agents did on this computer still shows.
  const signedIn = !!useAccount()
  const since = visit.since.filter((item) => signedIn || item.who.agent)
  const design = project.designs.find((item) => item.name === visit.design) ?? project.designs[0]!
  const resume = () => start.openProject?.(project.id)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" && event.target === document.body) resume()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })
  return (
    <section
      className="group/continue relative grid grid-cols-[minmax(0,400px)_minmax(0,1fr)] items-center gap-7"
      style={{ ["--parity" as string]: parity }}
    >
      <div className="overflow-hidden rounded-lg ring-1 ring-white/[0.07] transition-shadow duration-150 group-hover/continue:ring-2 group-hover/continue:ring-(--parity)">
        <CanvasArt project={project} design={design} labels live={false} />
      </div>
      <div className="flex flex-col items-start gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Continue where you left off</span>
          <h2 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
            <button
              type="button"
              onClick={resume}
              className="text-left outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              {project.name}
            </button>
            {live && <Here who={live.who} />}
          </h2>
        </div>
        <p className="text-sm text-pretty text-muted-foreground">
          You were on {visit.design} {visit.when[0]!.toLowerCase() + visit.when.slice(1)}.
          {since.length > 0 && ` Since then, ${listed(since.map((item) => `${firstName(item.who)} ${item.text}`))}.`}
        </p>
        <Button onClick={resume} className="relative z-10 mt-1 gap-2">
          Resume <Kbd className="bg-primary-foreground/10 text-primary-foreground/70">{formatKeys("Enter")}</Kbd>
        </Button>
      </div>
    </section>
  )
}

/** One thing waiting for you. The row opens it; the button does the one thing it asks and clears it. */
function ForYouRow({ item, onOpen }: { item: ForYouItem; onOpen?: () => void }) {
  const start = useStart()
  const target = projects.find((candidate) => candidate.name === item.project)
  const open = () => {
    if (target) start.openProject?.(target.id)
    onOpen?.()
  }
  return (
    <li className="group/row relative -mx-2 flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-muted/40">
      <Avatar person={item.who} size={22} className="shrink-0" />
      <span className="min-w-0 flex-1 text-[13px] leading-snug text-muted-foreground">
        <button
          type="button"
          onClick={open}
          title={item.quote}
          className="text-left outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          <span className="text-foreground">{item.who.name}</span> {item.action}{" "}
          {item.design && (
            <>
              <span className="text-foreground">{item.design}</span> in{" "}
            </>
          )}
          <span className="text-foreground">{item.project}</span>
        </button>
      </span>
      <span className="mt-0.5 shrink-0 text-xs text-muted-foreground group-focus-within/row:invisible group-hover/row:invisible">
        {item.when.replace(" ago", "")}
      </span>
      <Button
        size="xs"
        variant="outline"
        onClick={() => {
          start.markDone?.(item.id)
          open()
        }}
        className="absolute top-1.5 right-2 z-10 opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100"
      >
        {item.act}
      </Button>
    </li>
  )
}

/** What needs you across every project: an agent waiting on an answer, a mention, a review. */
export function ForYouPanel({ limit = 4 }: { limit?: number }) {
  const start = useStart()
  const account = useAccount()
  const waiting = useWaiting()
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="flex items-baseline gap-2 text-sm font-semibold">
        For you
        {waiting.length > 0 && <span className="font-normal text-muted-foreground">{waiting.length}</span>}
      </h2>
      {!account && (
        <p className="py-2 text-sm text-pretty text-muted-foreground">
          <button
            type="button"
            onClick={() => start.signIn?.()}
            className="rounded-sm font-medium text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Sign in
          </button>{" "}
          to see comments, mentions and reviews that need you.
        </p>
      )}
      {account && waiting.length > 0 && (
        <ul className="flex flex-col">
          {waiting.slice(0, limit).map((item) => (
            <ForYouRow key={item.id} item={item} />
          ))}
        </ul>
      )}
      {account && waiting.length === 0 && (
        <p className="py-2 text-sm text-muted-foreground">Nothing needs you right now.</p>
      )}
    </section>
  )
}

/** Tabs as words, for switching what a section lists. */
export function TextTabs<T extends string>({
  options,
  value,
  onChange
}: {
  options: { id: NoInfer<T>; label: ReactNode }[]
  value: T
  onChange: (value: NoInfer<T>) => void
}) {
  return (
    <span className="flex items-center gap-4 text-sm">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
          className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-pressed:font-medium aria-pressed:text-foreground"
        >
          {option.label}
        </button>
      ))}
    </span>
  )
}

/** Tabs on a muted track, for choices that sit inside a panel. */
export function Segmented<T extends string>({
  options,
  value,
  onChange
}: {
  options: { id: NoInfer<T>; label: ReactNode }[]
  value: T
  onChange: (value: NoInfer<T>) => void
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

type Scope = "recent" | "starred" | "shared" | "all"

const scopes: { id: Scope; label: string }[] = [
  { id: "recent", label: "Recent" },
  { id: "starred", label: "Starred" },
  { id: "shared", label: "Shared with you" },
  { id: "all", label: "All projects" }
]

const emptyScope: Record<Scope, string> = {
  recent: "Projects you open show up here.",
  starred: "Nothing starred yet. Star a project from its menu to keep it here.",
  shared: "Nothing has been shared with you yet.",
  all: "No projects yet."
}

/** Your projects, as renders: recent first, or starred, shared or all of them. */
export function RecentProjects({ org, skip, rows = 1 }: { org?: OrgId; skip?: string; rows?: number }) {
  const [scope, setScope] = useState<Scope>("recent")
  const [more, setMore] = useState(false)
  const [starred, setStarred] = useState(() => projects.filter((project) => project.starred).map(({ id }) => id))
  const [removed, setRemoved] = useState<string[]>([])
  const listed = projects.filter((project) => {
    if (org && project.org !== org) return false
    if (scope === "starred") return starred.includes(project.id)
    if (scope === "shared") return !!project.shared
    if (scope === "recent") return project.id !== skip && !removed.includes(project.id)
    return true
  })
  const shown = more ? listed : listed.slice(0, rows * 4)
  return (
    <section className="flex flex-col gap-4">
      <h2 className="sr-only">Projects</h2>
      <div className="flex items-center justify-between">
        <TextTabs
          options={scopes}
          value={scope}
          onChange={(next) => {
            setScope(next)
            setMore(false)
          }}
        />
        {listed.length > rows * 4 && (
          <button
            type="button"
            onClick={() => setMore(!more)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {more ? "Show less" : `Show ${listed.length - shown.length} more`}
          </button>
        )}
      </div>
      {shown.length > 0 ? (
        <div className="grid grid-cols-4 gap-x-5 gap-y-7">
          {shown.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              showOrg={!org && scope === "shared"}
              starred={starred.includes(project.id)}
              onStar={() =>
                setStarred((current) =>
                  current.includes(project.id) ? current.filter((id) => id !== project.id) : [...current, project.id]
                )
              }
              onRemove={scope === "recent" ? () => setRemoved((current) => [...current, project.id]) : undefined}
            />
          ))}
        </div>
      ) : (
        <p className="py-8 text-sm text-muted-foreground">{emptyScope[scope]}</p>
      )}
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

/** A template: its first design, drawn in the template's own look, then its name and the stack it's on. */
export function TemplateCard({ template, onPick }: { template: Template; onPick?: (template: Template) => void }) {
  const start = useStart()
  return (
    <button
      type="button"
      onClick={() =>
        onPick
          ? onPick(template)
          : start.newProject?.({ tab: "template", stack: template.stack, template: template.id })
      }
      className="group/template flex flex-col gap-2.5 text-left outline-none"
      style={{ ["--parity" as string]: parity }}
    >
      <span className="relative block overflow-hidden rounded-lg ring-1 ring-white/[0.07] transition-shadow duration-150 group-hover/template:ring-2 group-hover/template:ring-(--parity) group-focus-visible/template:ring-2 group-focus-visible/template:ring-ring">
        <DesignRender kind={template.designs[0]!.kind} look={template.look} />
        <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white opacity-0 backdrop-blur transition-opacity group-hover/template:opacity-100">
          Use template <ArrowRight className="size-3" />
        </span>
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{template.name}</span>
        <span className="text-xs text-muted-foreground">{findStack(template.stack).name}</span>
      </span>
    </button>
  )
}

/** Looks like a field, opens search: projects, designs, components, people and commands. */
export function SearchButton({ large, onOpen }: { large?: boolean; onOpen?: () => void }) {
  const start = useStart()
  return (
    <button
      type="button"
      onClick={onOpen ?? start.search}
      className={`flex items-center gap-2.5 rounded-lg border bg-card/60 text-left text-muted-foreground outline-none hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring ${
        large
          ? "h-12 w-full rounded-xl px-4 text-[15px] shadow-[0_8px_30px_-12px_rgb(0_0_0/0.6)]"
          : "h-9 w-[280px] px-3 text-sm"
      }`}
    >
      <Search className={large ? "size-[18px]" : "size-4"} />
      <span className="flex-1 truncate">
        {large ? "Search projects, designs and people, or paste a repository URL" : "Search"}
      </span>
      <Kbd>{formatKeys("Ctrl K")}</Kbd>
    </button>
  )
}

/** Opening what's already there: a folder, a project file, or a repository to clone. */
export function OpenMenu({ size = "lg" }: { size?: "lg" | "default" }) {
  const start = useStart()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size={size}>
            <FolderOpen /> Open <ChevronDown className="opacity-60" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onClick={() => start.newProject?.({ tab: "existing", source: "folder" })}>
          <FolderOpen /> Open a folder <DropdownMenuShortcut>{formatKeys("Ctrl O")}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => start.newProject?.({ tab: "existing", source: "folder" })}>
          <FileInput /> Open a project file <DropdownMenuShortcut>{formatKeys("Ctrl Shift O")}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => start.newProject?.({ tab: "existing", source: "github" })}>
          <GitHubMark size={16} /> Clone from GitHub
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => start.newProject?.({ tab: "existing", source: "azure" })}>
          <AzureDevOpsMark size={16} /> Clone from Azure DevOps
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function NewProjectButton({ onClick, size = "lg" }: { onClick?: () => void; size?: "lg" | "default" }) {
  const start = useStart()
  return (
    <Button size={size} onClick={onClick ?? (() => start.newProject?.())}>
      <Plus /> New project
    </Button>
  )
}

/**
 * Which organization's projects the page shows, and the way to switch. Signed out, or in no organization yet, it's
 * Personal alone, and the menu offers the way to more: signing in, or making an organization.
 */
export function OrgSwitcher({ value = "kestrel", onChange }: { value?: OrgId; onChange?: (org: OrgId) => void }) {
  const start = useStart()
  const account = useAccount()
  const org = organizations[value]
  const choices = account ? account.orgs.map((id) => organizations[id]) : [organizations.personal]
  const inOne = choices.some((candidate) => candidate.id !== "personal")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="-ml-1.5 flex w-fit items-center gap-2 rounded-lg px-1.5 py-1 text-sm outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted/50"
          >
            <OrgBadge org={org} size={20} />
            <span className="font-medium">{org.name}</span>
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange?.(next as OrgId)}>
          {choices.map((candidate) => (
            <DropdownMenuRadioItem key={candidate.id} value={candidate.id}>
              <OrgBadge org={candidate} size={18} /> {candidate.name}
              <span className="ml-auto text-xs text-muted-foreground">
                {candidate.members === 1 ? "Just you" : `${candidate.members} members`}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {!account ? (
          <DropdownMenuItem onClick={() => start.signIn?.()}>
            <LogIn /> Sign in to see your organizations
          </DropdownMenuItem>
        ) : (
          <>
            {/* Inviting needs an organization to invite people to. */}
            {inOne && (
              <DropdownMenuItem>
                <UserPlus /> Invite people
              </DropdownMenuItem>
            )}
            <DropdownMenuItem>
              <Plus /> New organization
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Home: where you left off and what needs you, then your projects. New project starts something new. */
export function HomePage() {
  const account = useAccount()
  const [org, setOrg] = useState<OrgId>(account?.orgs[0] ?? "personal")
  const visit = lastVisits[org]
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-11 px-10 pt-6 pb-14">
        <header className="flex items-center justify-between gap-6">
          <OrgSwitcher value={org} onChange={setOrg} />
          <div className="flex items-center gap-2">
            <SearchButton />
            <OpenMenu size="default" />
            <NewProjectButton size="default" />
          </div>
        </header>
        <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-12">
          <ContinueCard visit={visit} />
          <ForYouPanel />
        </div>
        {/* Signed out, Parity can't tell which organization a folder belongs to, so Personal lists every one. */}
        <RecentProjects key={org} org={account ? org : undefined} skip={visit.project} rows={2} />
      </div>
    </div>
  )
}

/** A new tab: one field to go anywhere, then your projects. */
export function NewTabPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-11 px-10 pt-16 pb-14">
        <div className="mx-auto flex w-full max-w-[640px] flex-col items-center gap-3">
          <SearchButton large />
          <div className="flex items-center gap-2">
            <NewProjectButton size="default" />
            <OpenMenu size="default" />
          </div>
        </div>
        <RecentProjects rows={2} />
      </div>
    </div>
  )
}
