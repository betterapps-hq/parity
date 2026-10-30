import {
  ArrowLeft,
  AtSign,
  BellOff,
  Check,
  ChevronDown,
  Eye,
  KeyRound,
  type LucideIcon,
  MessageSquare,
  Settings,
  Sparkles,
  X
} from "lucide-react"
import { type ReactNode, useState } from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { me, people, type Person } from "../explore-data.ts"
import { Avatar, ParityMark } from "../parts.tsx"
import type { TrackerId } from "./collab-data.ts"
import { commentBlue, CommentText, Composer } from "./comments.tsx"
import { TrackerMark } from "./issues.tsx"

/** Something that happened that you might want to know about, from any project. */
export interface Notice {
  id: string
  kind: "mention" | "reply" | "proposal" | "agent" | "review" | "access" | "issue" | "resolved"
  who: Person
  project: string
  /** The design, and the layer when there is one. */
  where: string
  /** What they said or did, with `@Full Name` and `{Layer}` as in a comment. */
  text: string
  when: string
  unread?: boolean
  /** For an issue's status: which tracker. */
  tracker?: TrackerId
  /** What you can do from the row itself. */
  action?: string
}

export const notices: Notice[] = [
  {
    id: "n-toggle",
    kind: "mention",
    who: people.maya,
    project: "Website",
    where: "Pricing, Billing toggle",
    text: "@Andrew Craswell can we drop the annual toggle here? It fights with the {Plan cards}.",
    when: "8 min ago",
    unread: true
  },
  {
    id: "n-proposal",
    kind: "proposal",
    who: people.claude,
    project: "Website",
    where: "Pricing, Billing toggle",
    text: "Move the {Billing toggle} above the {Plan cards}, as a segmented control, in a new state.",
    when: "6 min ago",
    unread: true,
    action: "Approve"
  },
  {
    id: "n-agent",
    kind: "agent",
    who: people.claude,
    project: "Website",
    where: "Pricing, Plan name",
    text: "Tried shorter plan names at 360 in a new state, Short names. Every plan name fits on one line.",
    when: "12 min ago",
    unread: true,
    action: "Review"
  },
  {
    id: "n-reply",
    kind: "reply",
    who: people.jonas,
    project: "Website",
    where: "Pricing, Billing toggle",
    text: "+1, and keep the savings badge.",
    when: "2 min ago",
    unread: true
  },
  {
    id: "n-review",
    kind: "review",
    who: people.priya,
    project: "Dashboard",
    where: "Checkout section",
    text: "Ready for a look. The coupon field is below the total now.",
    when: "1 h ago",
    action: "Review"
  },
  {
    id: "n-access",
    kind: "access",
    who: people.lena,
    project: "Website",
    where: "Asked to comment",
    text: "I'd like to leave notes on the checkout flow.",
    when: "3 h ago",
    action: "Allow"
  },
  {
    id: "n-issue",
    kind: "issue",
    who: people.sam,
    project: "Website",
    where: "Pricing, Plan name",
    text: "#447 Plan names wrap on small phones",
    when: "Yesterday",
    tracker: "github",
    action: "Resolve thread"
  },
  {
    id: "n-resolved",
    kind: "resolved",
    who: people.jonas,
    project: "Website",
    where: "Pricing, Footer",
    text: "Resolved Do we need to say which currency?",
    when: "Yesterday"
  }
]

const verbs: Record<Notice["kind"], { verb: string; icon: LucideIcon; color: string }> = {
  mention: { verb: "mentioned you", icon: AtSign, color: commentBlue },
  reply: { verb: "replied", icon: MessageSquare, color: commentBlue },
  proposal: { verb: "wants your approval", icon: Check, color: "oklch(0.8 0.14 75)" },
  agent: { verb: "finished what you asked", icon: Sparkles, color: "oklch(0.7 0.16 300)" },
  review: { verb: "asked you to review", icon: Eye, color: "oklch(0.78 0.14 75)" },
  access: { verb: "asked for access", icon: KeyRound, color: "oklch(0.78 0.14 75)" },
  issue: { verb: "closed an issue from your thread", icon: Check, color: "oklch(0.7 0.16 300)" },
  resolved: { verb: "resolved a thread", icon: Check, color: "oklch(0.72 0.15 160)" }
}

/** Who did it, wearing a mark for what kind of thing it is. */
function NoticeAvatar({ notice }: { notice: Notice }) {
  const { icon: Icon, color } = verbs[notice.kind]
  return (
    <span className="relative h-fit shrink-0">
      <Avatar person={notice.who} size={28} />
      <span
        className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full ring-2 ring-popover"
        style={{ background: notice.tracker ? "var(--popover)" : color }}
      >
        {notice.tracker ? (
          <TrackerMark id={notice.tracker} size={11} />
        ) : (
          <Icon className="size-2.5 text-black/80" strokeWidth={2.5} />
        )}
      </span>
    </span>
  )
}

/**
 * One notification: who, what and where, what they said, and when; unread ones are dotted. Some can be answered from
 * the row, such as reviewing an agent's work or letting someone in. Opening it goes to the thread and marks it read.
 */
export function NoticeRow({ notice, onOpen }: { notice: Notice; onOpen?: () => void }) {
  const { verb } = verbs[notice.kind]
  return (
    <div
      className={`group/notice relative flex gap-3 rounded-lg px-2.5 py-2.5 hover:bg-muted/40 ${notice.unread ? "" : "opacity-80"}`}
    >
      <NoticeAvatar notice={notice} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <button
          type="button"
          onClick={onOpen}
          className="text-left text-xs text-muted-foreground after:absolute after:inset-0"
        >
          <span className="font-medium text-foreground">{notice.who === me ? "You" : notice.who.name}</span> {verb}{" "}
          <span className="text-muted-foreground">in {notice.project}</span>
          <span className="block truncate">{notice.where}</span>
        </button>
        <div className="line-clamp-2 [&_p]:text-[13px]">
          <CommentText text={notice.text} />
        </div>
        <div className="relative flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{notice.when}</span>
          {notice.action && (
            <Button size="xs" variant="outline" className="ml-auto">
              {notice.action}
            </Button>
          )}
        </div>
      </div>
      {notice.unread && (
        <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: commentBlue }}>
          <span className="sr-only">Unread</span>
        </span>
      )}
    </div>
  )
}

type InboxView = "you" | "all" | "agents"

const views: { id: InboxView; title: string; icon: LucideIcon; matches: (notice: Notice) => boolean }[] = [
  {
    id: "you",
    title: "For you",
    icon: AtSign,
    matches: (notice) => notice.kind !== "resolved" && notice.kind !== "agent"
  },
  { id: "all", title: "All", icon: MessageSquare, matches: () => true },
  { id: "agents", title: "Agents", icon: Sparkles, matches: (notice) => notice.kind === "agent" }
]

/**
 * The inbox, from the bell in the title bar on every tab: notifications from every project. For you comes first
 * (mentions, replies, reviews and access requests); agents' work has its own view. Opening one marks it read, Mark all
 * read clears the dots, the gear opens the settings in place, and notifications can be paused for a while.
 */
export function Inbox({ initial = notices, className = "" }: { initial?: Notice[]; className?: string }) {
  const [items, setItems] = useState(initial)
  const [view, setView] = useState<InboxView>("you")
  const [settings, setSettings] = useState(false)
  const [paused, setPaused] = useState<string>()
  const shown = items.filter(views.find((candidate) => candidate.id === view)!.matches)
  const read = (id: string) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, unread: false } : item)))
  return (
    <div
      className={`flex w-[25rem] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl ${className}`}
    >
      {settings ? (
        <>
          <div className="flex items-center gap-1 border-b py-2 pr-3 pl-1.5">
            <Button size="icon-sm" variant="ghost" aria-label="Back to the inbox" onClick={() => setSettings(false)}>
              <ArrowLeft />
            </Button>
            <span className="text-sm font-semibold">Notifications</span>
          </div>
          <NotificationSettings className="max-h-[32rem] overflow-y-auto" />
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 border-b py-2 pr-2 pl-4">
            <span className="text-sm font-semibold">Inbox</span>
            <Button
              size="xs"
              variant="ghost"
              className="ml-auto text-muted-foreground"
              disabled={!items.some((item) => item.unread)}
              onClick={() => setItems((current) => current.map((item) => ({ ...item, unread: false })))}
            >
              Mark all read
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Notification settings" onClick={() => setSettings(true)}>
              <Settings />
            </Button>
          </div>
          <div className="flex gap-1 border-b px-3 py-2">
            {views.map(({ id, title, icon: Icon, matches }) => {
              const unread = items.filter((item) => item.unread && matches(item)).length
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={view === id}
                  onClick={() => setView(id)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${view === id ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon className="size-3.5" /> {title}
                  {unread > 0 && <span className="text-muted-foreground tabular-nums">{unread}</span>}
                </button>
              )
            })}
          </div>
          {paused && (
            <div className="flex items-center gap-2 border-b bg-muted/40 py-1.5 pr-2 pl-4 text-xs text-muted-foreground">
              <BellOff className="size-3.5" />
              <span className="flex-1">Paused {paused}. They&apos;ll be here when you look.</span>
              <Button size="xs" variant="ghost" className="text-foreground" onClick={() => setPaused(undefined)}>
                Resume
              </Button>
            </div>
          )}
          <div className="flex max-h-[28rem] flex-col gap-0.5 overflow-y-auto p-1.5">
            {shown.map((notice) => (
              <NoticeRow key={notice.id} notice={notice} onOpen={() => read(notice.id)} />
            ))}
            {shown.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {view === "agents" ? "No agents have finished anything for you." : "You're all caught up."}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 border-t px-2 py-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="xs" variant="ghost" className="text-muted-foreground">
                  <BellOff /> {paused ? "Paused" : "Pause"} <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {["for an hour", "until tomorrow", "until Monday"].map((until) => (
                  <DropdownMenuItem key={until} onSelect={() => setPaused(until)}>
                    {until.charAt(0).toUpperCase() + until.slice(1)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="ml-auto pr-2 text-xs text-muted-foreground">Email: daily summary at 9:00</span>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * A notification that arrives while you work, for mentions and replies only. Reply answers in place without leaving
 * what you're doing; Open goes to the thread.
 */
export function NoticeToast({ notice, onDismiss }: { notice: Notice; onDismiss?: () => void }) {
  const [replying, setReplying] = useState(false)
  const [sent, setSent] = useState(false)
  let reply: ReactNode
  if (sent)
    reply = (
      <span className="flex items-center gap-1.5 pl-10 text-xs text-muted-foreground">
        <Check className="size-3.5 text-emerald-400" /> Replied
      </span>
    )
  else if (replying)
    reply = (
      <Composer placeholder={`Reply to ${notice.who.name.split(" ")[0]}`} focusOnMount onSend={() => setSent(true)} />
    )
  else
    reply = (
      <div className="flex gap-2 pl-10">
        <Button size="xs" onClick={() => setReplying(true)}>
          Reply
        </Button>
        <Button size="xs" variant="outline">
          Open
        </Button>
      </div>
    )
  return (
    <div className="flex w-[23rem] flex-col gap-2.5 rounded-xl border bg-popover p-3 text-popover-foreground shadow-2xl motion-safe:animate-in motion-safe:slide-in-from-bottom-2 motion-safe:fade-in-0">
      <div className="flex gap-3">
        <NoticeAvatar notice={notice} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{notice.who.name}</span> {verbs[notice.kind].verb} in{" "}
            {notice.project}, {notice.where}
          </span>
          <div className="line-clamp-2 [&_p]:text-[13px]">
            <CommentText text={notice.text} />
          </div>
        </div>
        <Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={onDismiss}>
          <X />
        </Button>
      </div>
      {reply}
    </div>
  )
}

function SettingRow({
  title,
  detail,
  checked,
  onChange
}: {
  title: string
  detail?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted/30">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px]">{title}</span>
        {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="px-2 text-[11px] font-medium text-muted-foreground">{title}</span>
      {children}
    </div>
  )
}

const levels = [
  { id: "all", title: "Everything", detail: "Every comment, change and agent run in the project" },
  { id: "involved", title: "Threads I'm in", detail: "Mentions, replies, and threads you started or joined" },
  { id: "mentions", title: "Only mentions", detail: "When someone @mentions you" },
  { id: "none", title: "Nothing", detail: "Mentions still show in the inbox, without a notification" }
]

interface Preferences {
  level: string
  agents: boolean
  reviews: boolean
  access: boolean
  issues: boolean
  desktop: boolean
  email: string
}

const defaults: Preferences = {
  level: "involved",
  agents: true,
  reviews: true,
  access: true,
  issues: false,
  desktop: true,
  email: "daily"
}

/**
 * What to be told about, and how: a level for comments, switches for agents, reviews, access requests and issues,
 * then desktop notifications and email. Settings for all projects are the default; a project can have its own.
 */
export function NotificationSettings({ className = "" }: { className?: string }) {
  const [scope, setScope] = useState<"everywhere" | "project">("everywhere")
  const [everywhere, setEverywhere] = useState(defaults)
  const [project, setProject] = useState<Preferences>()
  const own = scope === "project" ? project : everywhere
  const shown = own ?? everywhere
  const set = (change: Partial<Preferences>) =>
    scope === "project" ? setProject({ ...shown, ...change }) : setEverywhere({ ...everywhere, ...change })
  return (
    <div className={`flex flex-col gap-4 p-3 text-popover-foreground ${className}`}>
      <div className="flex gap-1 rounded-lg bg-muted p-0.5">
        {(["everywhere", "project"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={scope === option}
            onClick={() => setScope(option)}
            className={`flex-1 rounded-md py-1 text-xs font-medium ${scope === option ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {option === "everywhere" ? "All projects" : "Website"}
          </button>
        ))}
      </div>
      {scope === "project" && !project ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
          Website uses your settings for all projects.
          <Button size="xs" variant="outline" className="text-foreground" onClick={() => setProject(everywhere)}>
            Set its own
          </Button>
        </div>
      ) : (
        <>
          <Section title="Comments">
            <RadioGroup value={shown.level} onValueChange={(level) => set({ level })} className="gap-0">
              {levels.map((level) => (
                <label
                  key={level.id}
                  htmlFor={`notify-${level.id}`}
                  className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted/30"
                >
                  <RadioGroupItem id={`notify-${level.id}`} value={level.id} className="mt-0.5" />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[13px]">{level.title}</span>
                    <span className="text-xs text-muted-foreground">{level.detail}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </Section>
          <Section title="Also tell me when">
            <SettingRow
              title="An agent finishes what I asked"
              detail="Claude Code, Cursor and others you've mentioned"
              checked={shown.agents}
              onChange={(agents) => set({ agents })}
            />
            <SettingRow
              title="Someone asks me to review"
              checked={shown.reviews}
              onChange={(reviews) => set({ reviews })}
            />
            <SettingRow
              title="Someone asks for access"
              detail="On projects you own"
              checked={shown.access}
              onChange={(access) => set({ access })}
            />
            <SettingRow
              title="An issue from my threads changes"
              detail="In GitHub, Linear or Azure DevOps"
              checked={shown.issues}
              onChange={(issues) => set({ issues })}
            />
          </Section>
          <Section title="How">
            <SettingRow
              title="Desktop notifications"
              detail="While Parity is open, even in the background"
              checked={shown.desktop}
              onChange={(desktop) => set({ desktop })}
            />
            <div className="flex items-center gap-3 px-2 py-2">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[13px]">Email</span>
                <span className="text-xs text-muted-foreground">To andrew@buildkit.dev</span>
              </span>
              <Select value={shown.email} onValueChange={(email) => set({ email })}>
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="now">Right away</SelectItem>
                  <SelectItem value="daily">Daily summary</SelectItem>
                  <SelectItem value="weekly">Weekly summary</SelectItem>
                  <SelectItem value="off">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Section>
          {scope === "project" && (
            <Button
              size="xs"
              variant="ghost"
              className="self-start text-muted-foreground"
              onClick={() => setProject(undefined)}
            >
              Use my settings for all projects
            </Button>
          )}
        </>
      )}
    </div>
  )
}

/**
 * The daily summary email: what needs you first, then the rest, grouped by project, each a link to the thread. Sent
 * only on days something happened.
 */
export function EmailDigest() {
  const forYou = notices.filter((notice) => notice.unread || notice.action)
  return (
    <div className="w-[36rem] overflow-hidden rounded-xl bg-white text-neutral-900 shadow-2xl">
      <div className="flex items-center gap-2.5 border-b border-neutral-200 px-8 py-5">
        <ParityMark size={24} />
        <span className="text-sm font-semibold">Parity</span>
        <span className="ml-auto text-xs text-neutral-500">Thursday, 9:00</span>
      </div>
      <div className="flex flex-col gap-6 px-8 py-7">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Good morning, Andrew</h1>
          <p className="text-sm text-neutral-600">
            {forYou.filter((notice) => notice.kind !== "agent").length} things need you across 2 projects, and Claude
            Code finished what you asked.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Needs you</span>
          {forYou.map((notice) => (
            <div key={notice.id} className="flex items-start gap-3 border-b border-neutral-100 py-3 last:border-0">
              <Avatar person={notice.who} size={28} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                <span className="text-neutral-600">
                  <span className="font-medium text-neutral-900">{notice.who.name}</span> {verbs[notice.kind].verb} in{" "}
                  {notice.project}
                </span>
                <span className="line-clamp-2 text-neutral-800">{notice.text.replace(/\{([^}]+)\}/g, "$1")}</span>
              </div>
              <span className="shrink-0 text-sm font-medium text-[oklch(0.5_0.18_255)]">{notice.action ?? "Open"}</span>
            </div>
          ))}
        </div>
        <span className="w-fit rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          Open your inbox
        </span>
      </div>
      <div className="border-t border-neutral-200 bg-neutral-50 px-8 py-4 text-xs leading-relaxed text-neutral-500">
        You get this summary each morning something happens.{" "}
        <span className="text-neutral-700 underline">Change how often</span> or{" "}
        <span className="text-neutral-700 underline">stop these emails</span>.
      </div>
    </div>
  )
}
