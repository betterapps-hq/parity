import { ExternalLink, Search } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { AzureDevOpsMark, GitHubMark } from "../parts.tsx"
import type { LinkedIssue, ThreadData, TrackerId } from "./collab-data.ts"

/** An issue tracker an org can add: where its issues can go, and the account it's connected as. */
export interface Tracker {
  id: TrackerId
  name: string
  /** What the org connected: a GitHub organization, a Linear workspace or an Azure DevOps organization. */
  account: string
  /** Where an issue can go: repositories, teams or projects. */
  places: string[]
  /** How a new issue's status reads in this tracker. */
  opened: string
}

export const trackers: Record<TrackerId, Tracker> = {
  github: {
    id: "github",
    name: "GitHub",
    account: "kestrel",
    places: ["kestrel/website", "kestrel/app", "kestrel/design-system"],
    opened: "Open"
  },
  linear: {
    id: "linear",
    name: "Linear",
    account: "Kestrel workspace",
    places: ["Website (WEB)", "Growth (GRO)", "Design (DES)"],
    opened: "Todo"
  },
  azure: {
    id: "azure",
    name: "Azure DevOps",
    account: "dev.azure.com/kestrel",
    places: ["Kestrel / Website", "Kestrel / Mobile"],
    opened: "New"
  }
}

/** What the sample org, Kestrel, has added. */
export const orgTrackers: Tracker[] = [trackers.github, trackers.linear]

export function LinearMark({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="currentColor" className={className} aria-label="Linear">
      <path d="M1.2 61.5c-.2-.9.9-1.5 1.6-.9l36.5 36.6c.7.7.1 1.8-.9 1.6C20.1 94.5 5.5 79.9 1.2 61.5ZM0 46.9c0 .3.1.6.3.8l52.1 52c.2.2.5.3.8.3 2.4-.1 4.7-.5 7-.9.8-.2 1-1.1.5-1.7L2.6 39.4c-.6-.5-1.5-.3-1.7.5-.4 2.3-.8 4.6-.9 7ZM4.2 29.7c-.2.4-.1.8.2 1.1l64.8 64.8c.3.3.7.4 1.1.2 1.8-.8 3.5-1.7 5.2-2.7.6-.3.6-1.1.2-1.5L8.4 24.3c-.4-.5-1.2-.4-1.5.2-1 1.7-1.9 3.4-2.7 5.2ZM12.7 18.1c-.4-.4-.4-1 0-1.4C21.8 6.5 35.1 0 50 0c27.6 0 50 22.4 50 50 0 14.9-6.5 28.2-16.7 37.3-.4.4-1 .3-1.4 0L12.7 18.1Z" />
    </svg>
  )
}

/** A tracker's own mark, in its colors where it has them. */
export function TrackerMark({ id, size = 16, className = "" }: { id: TrackerId; size?: number; className?: string }) {
  if (id === "github") return <GitHubMark size={size} className={className} />
  if (id === "azure") return <AzureDevOpsMark size={size} className={className} />
  return <LinearMark size={size} className={`text-[#8b93f8] ${className}`} />
}

/** An issue's status as its tracker words it: grey while open, amber while someone's on it, violet once done. */
function IssueStatus({ status }: { status: LinkedIssue["status"] }) {
  let tone = "bg-muted text-muted-foreground"
  if (status.done) tone = "bg-[oklch(0.62_0.18_300/0.18)] text-[oklch(0.8_0.12_300)]"
  else if (status.active) tone = "bg-[oklch(0.8_0.14_75/0.16)] text-[oklch(0.85_0.12_75)]"
  return <span className={`shrink-0 rounded-full px-1.5 py-px text-[11px] font-medium ${tone}`}>{status.label}</span>
}

/**
 * The issue a thread became, under its header: the tracker, the key, the title and its status, kept up to date. Once
 * the issue is done, the thread offers to resolve too.
 */
export function IssueLink({
  issue,
  resolved,
  onResolve
}: {
  issue: LinkedIssue
  resolved?: boolean
  onResolve?: () => void
}) {
  const tracker = trackers[issue.tracker]
  return (
    <>
      <div className="flex items-center gap-2 border-b py-1.5 pr-1.5 pl-3 text-xs">
        <TrackerMark id={issue.tracker} size={14} className="shrink-0" />
        <span className="shrink-0 font-medium tabular-nums">{issue.key}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground" title={`${issue.title}, in ${issue.place}`}>
          {issue.title}
        </span>
        <IssueStatus status={issue.status} />
        <Button size="icon-xs" variant="ghost" aria-label={`Open ${issue.key} in ${tracker.name}`}>
          <ExternalLink />
        </Button>
      </div>
      {issue.status.done && !resolved && (
        <div className="flex items-center gap-2 border-b bg-[oklch(0.62_0.18_300/0.08)] py-1.5 pr-1.5 pl-3 text-xs text-muted-foreground">
          <span className="flex-1">
            {issue.key} is {issue.status.label.toLowerCase()} in {tracker.name}. Resolve this thread too?
          </span>
          <Button size="xs" variant="ghost" className="text-foreground" onClick={onResolve}>
            Resolve
          </Button>
        </div>
      )}
    </>
  )
}

/** The issue a thread's first comment suggests: its words, without the markup for mentions and layers. */
function suggestedTitle(thread: ThreadData): string {
  const text = (thread.comments[0]?.text ?? "")
    .replace(/\{([^}]+)\}/g, "$1")
    .replace(/@[A-Z][a-z]+(?: [A-Z][a-z]+)?\s*/g, "")
    .trim()
  const sentence = /^[^.?!]+[.?!]?/.exec(text)?.[0] ?? text
  const title = sentence.charAt(0).toUpperCase() + sentence.slice(1)
  return title.length > 72 ? `${title.slice(0, 71).trimEnd()}…` : title
}

let nextNumber = 142

/** What a tracker calls the place an issue goes. */
function placeLabel(id: TrackerId): string {
  if (id === "github") return "Repository"
  if (id === "linear") return "Team"
  return "Project"
}

function newKey(tracker: Tracker, place: string): string {
  const number = nextNumber++
  if (tracker.id === "linear") return `${/\(([A-Z]+)\)/.exec(place)?.[1] ?? "ISS"}-${number}`
  if (tracker.id === "azure") return `#${1000 + number}`
  return `#${300 + number}`
}

/** Issues already in a tracker, to link a thread to one instead of making another. */
const existing: Record<TrackerId, { key: string; title: string; status: LinkedIssue["status"] }[]> = {
  github: [
    { key: "#418", title: "Pricing toggle layout on small screens", status: { label: "Open" } },
    { key: "#402", title: "Annual savings badge copy", status: { label: "Closed", done: true } }
  ],
  linear: [
    { key: "WEB-131", title: "Rework the billing toggle", status: { label: "In Progress", active: true } },
    { key: "WEB-118", title: "Pricing page accessibility pass", status: { label: "Todo" } }
  ],
  azure: [
    { key: "#1121", title: "Billing toggle on the pricing page", status: { label: "Active", active: true } },
    { key: "#1093", title: "Pricing page refresh", status: { label: "New" } }
  ]
}

/**
 * Making an issue from a thread, or linking it to one that exists. Only the trackers the org has added are offered.
 * The title comes from the first comment, and the issue gets the comments, a snapshot of the frame and a link back to
 * the thread, which then shows the issue and its status.
 */
export function IssueDialog({
  open,
  onOpenChange,
  thread,
  available,
  initial = { tracker: available[0]?.id ?? "github", mode: "create" },
  onLink
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  thread: ThreadData
  available: Tracker[]
  initial?: { tracker: TrackerId; mode: "create" | "link" }
  onLink: (issue: LinkedIssue) => void
}) {
  const [mode, setMode] = useState(initial.mode)
  const [chosen, setChosen] = useState(initial.tracker)
  const tracker = trackers[chosen]
  const [place, setPlace] = useState(tracker.places[0]!)
  const [title, setTitle] = useState(() => suggestedTitle(thread))
  const [withComments, setWithComments] = useState(true)
  const [query, setQuery] = useState("")
  const choose = (id: TrackerId) => {
    setChosen(id)
    setPlace(trackers[id].places[0]!)
  }
  const create = () => {
    onLink({
      tracker: chosen,
      key: newKey(tracker, place),
      title: title.trim(),
      place,
      status: { label: tracker.opened }
    })
    onOpenChange(false)
  }
  const matches = existing[chosen].filter((issue) =>
    `${issue.key} ${issue.title}`.toLowerCase().includes(query.trim().toLowerCase())
  )
  const comments = thread.comments.length
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <DialogHeader className="gap-1 px-5 pt-5 pb-4">
          <DialogTitle>{mode === "create" ? "Create an issue" : "Link an existing issue"}</DialogTitle>
          <DialogDescription>
            From the thread on {thread.design}
            {thread.layer ? `, ${thread.layer}` : ""}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 px-5 pb-5">
          <div className="flex gap-1 rounded-lg bg-muted p-0.5">
            {(["create", "link"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                onClick={() => setMode(option)}
                className={`flex-1 rounded-md py-1 text-xs font-medium ${mode === option ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {option === "create" ? "New issue" : "Existing issue"}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Tracker</Label>
            <div className="flex gap-1.5">
              {available.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={chosen === option.id}
                  onClick={() => choose(option.id)}
                  className={`flex h-8 flex-1 items-center justify-center gap-2 rounded-md border text-xs font-medium ${chosen === option.id ? "border-ring bg-accent" : "hover:bg-muted/50"}`}
                >
                  <TrackerMark id={option.id} size={14} />
                  {option.name}
                </button>
              ))}
            </div>
          </div>
          {mode === "create" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">{placeLabel(tracker.id)}</Label>
                <Select value={place} onValueChange={setPlace}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tracker.places.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="issue-title" className="text-xs text-muted-foreground">
                  Title
                </Label>
                <Input id="issue-title" value={title} onChange={(event) => setTitle(event.target.value)} />
              </div>
              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-xs">
                  <span className="font-medium">Include the thread</span>
                  <span className="text-muted-foreground">
                    {withComments
                      ? `${comments === 1 ? "The comment" : `All ${comments} comments`}, a snapshot of ${thread.frame ?? "the frame"} and a link back here.`
                      : "Only a link back here."}
                  </span>
                </span>
                <Switch checked={withComments} onCheckedChange={setWithComments} aria-label="Include the thread" />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`Search ${tracker.name} issues`}
                  aria-label={`Search ${tracker.name} issues`}
                  className="pl-8"
                />
              </div>
              <div className="flex flex-col rounded-lg border p-1">
                {matches.map((issue) => (
                  <button
                    key={issue.key}
                    type="button"
                    onClick={() => {
                      onLink({ tracker: chosen, ...issue, place: tracker.places[0]! })
                      onOpenChange(false)
                    }}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
                  >
                    <span className="w-14 shrink-0 font-medium tabular-nums">{issue.key}</span>
                    <span className="min-w-0 flex-1 truncate">{issue.title}</span>
                    <IssueStatus status={issue.status} />
                  </button>
                ))}
                {matches.length === 0 && (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">No issues match “{query}”</p>
                )}
              </div>
            </div>
          )}
        </div>
        {mode === "create" && (
          <DialogFooter className="border-t px-5 py-3">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!title.trim()} onClick={create}>
              Create in {tracker.name}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * The org's issue trackers, in its settings in the portal: what's added, as which account, and Add or Remove for
 * admins. A thread's Create issue lists only these.
 */
export function OrgTrackers({ added, onChange }: { added: Tracker[]; onChange: (added: Tracker[]) => void }) {
  return (
    <div className="flex w-[24rem] flex-col rounded-xl border bg-popover text-popover-foreground">
      <div className="flex flex-col gap-0.5 border-b px-4 py-3">
        <span className="text-sm font-medium">Issue trackers</span>
        <span className="text-xs text-muted-foreground">
          Threads in Kestrel&apos;s projects can become issues in these. Admins add and remove them.
        </span>
      </div>
      <div className="flex flex-col p-1.5">
        {Object.values(trackers).map((tracker) => {
          const on = added.some((candidate) => candidate.id === tracker.id)
          return (
            <div key={tracker.id} className="flex items-center gap-3 rounded-lg px-2.5 py-2">
              <span className="grid size-8 place-items-center rounded-lg border bg-background">
                <TrackerMark id={tracker.id} size={16} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[13px] font-medium">{tracker.name}</span>
                <span className="truncate text-xs text-muted-foreground">{on ? tracker.account : "Not added"}</span>
              </span>
              <Button
                size="sm"
                variant={on ? "ghost" : "outline"}
                onClick={() =>
                  onChange(
                    on
                      ? added.filter((candidate) => candidate.id !== tracker.id)
                      : Object.values(trackers).filter(
                          (candidate) => candidate.id === tracker.id || added.some((other) => other.id === candidate.id)
                        )
                  )
                }
              >
                {on ? "Remove" : "Add"}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
