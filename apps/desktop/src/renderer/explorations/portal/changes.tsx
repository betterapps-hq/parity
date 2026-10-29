/**
 * A project opened from the portal on what changed: its canvas in the browser, comparing two versions. Quiet around
 * the edges so the changes are what you see: the changed boards before and after, each change marked and numbered,
 * and the same numbers down the side with what happened and where it lives in code. Hovering a change in either place
 * brings it forward and fades the rest. A notification or "See what changed" opens this; the link names both versions,
 * so it can go in a pull request.
 */
import { Check, ChevronDown, ChevronRight, Ellipsis, GitBranch, GitPullRequest, Link2, Monitor } from "lucide-react"
import { type ReactNode, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { me, people, type Person } from "../explore-data.ts"
import { Avatar, ParityMark } from "../parts.tsx"
import type { Look, RenderKind } from "../start/data.ts"
import { DesignRender } from "../start/renders.tsx"
import { designOf, event, portalProject } from "./data.ts"
import { PortalWindow } from "./parts.tsx"

const { maya, sam, claude, jonas } = people
const violet = "oklch(0.7 0.16 275)"

type View = "before" | "both" | "after"

/** Where a change is on a board, by share of the board's size, and what it is. */
interface Change {
  n: number
  board: "Billing" | "Overview"
  area: { left: string; top: string; width: string; height: string }
  where: string
  what: string
  code: string
}

const changes: Change[] = [
  {
    n: 1,
    board: "Billing",
    area: { left: "1%", top: "20%", width: "20%", height: "10%" },
    where: "Navigation",
    what: "The open page follows the brand color",
    code: "SidebarLink"
  },
  {
    n: 2,
    board: "Billing",
    area: { left: "23%", top: "31%", width: "75%", height: "24%" },
    where: "Plan and usage",
    what: "The plan badge and usage meters follow it",
    code: "PlanCard, UsageMeter"
  },
  {
    n: 3,
    board: "Overview",
    area: { left: "22%", top: "36%", width: "76%", height: "30%" },
    where: "Usage chart",
    what: "The chart's line and fill follow it",
    code: "UsageChart"
  }
]

/** A change's number: small, in the comparison's one color. */
function Number({ n, active }: { n: number; active?: boolean }) {
  return (
    <span
      className={`grid size-[18px] shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white tabular-nums transition-opacity ${active === false ? "opacity-40" : ""}`}
      style={{ background: violet }}
    >
      {n}
    </span>
  )
}

/**
 * A board, before or after. After, each change is outlined with its number; before, the change you're looking at is
 * traced faintly so the two can be compared at a glance.
 */
function Board({
  kind,
  look,
  side,
  marks,
  focus,
  onFocus
}: {
  kind: RenderKind
  look: Look
  side: "before" | "after"
  marks: Change[]
  focus?: number
  onFocus(n: number | undefined): void
}) {
  return (
    <div className="relative rounded-[5px] shadow-[0_16px_40px_-12px_rgb(0_0_0/0.6)] ring-1 ring-white/[0.06]">
      <div className="overflow-hidden rounded-[5px]">
        <DesignRender kind={kind} look={look} />
      </div>
      {marks.map((change) => {
        const active = focus === undefined ? undefined : focus === change.n
        if (side === "before")
          return active ? (
            <span
              key={change.n}
              className="pointer-events-none absolute rounded-[4px] border-[1.5px] border-dashed motion-safe:animate-in motion-safe:fade-in-0"
              style={{ ...change.area, borderColor: violet }}
            />
          ) : null
        return (
          <button
            key={change.n}
            type="button"
            aria-label={`Change ${change.n}, ${change.where}`}
            onPointerEnter={() => onFocus(change.n)}
            onPointerLeave={() => onFocus(undefined)}
            onFocus={() => onFocus(change.n)}
            onBlur={() => onFocus(undefined)}
            className={`absolute rounded-[4px] transition-[opacity,box-shadow,background-color] duration-150 ${active === false ? "opacity-30" : ""}`}
            style={{
              ...change.area,
              boxShadow: `0 0 0 ${active ? 2 : 1.5}px ${violet}`,
              background: active ? `color-mix(in oklch, ${violet} 10%, transparent)` : undefined
            }}
          >
            <span className="absolute -top-2 -left-2">
              <Number n={change.n} />
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** The project's overflow: the link, the desktop app, and the branch and pull request this compares. */
function MoreMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label="More">
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem>
          <Link2 /> Copy link to this comparison
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Monitor /> Open in the desktop app
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <GitBranch /> <span className="truncate font-mono text-xs">claude/tighten-plan-cards</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <GitPullRequest /> Pull request #148, open
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The project's versions, newest first: who made each, and what it was. */
const versions: { n: number; who: Person; label: string; when: string }[] = [
  { n: 43, who: maya, label: "Maya commented on Billing", when: event("maya-comment").when },
  { n: 42, who: claude, label: "Claude Code changed the brand token", when: event("claude-run").when },
  { n: 41, who: sam, label: "Sam merged #142", when: event("sam-merge").when },
  { n: 40, who: me, label: "When you were last here", when: "Yesterday" },
  { n: 39, who: jonas, label: "Jonas renamed the Usage page", when: "2 days ago" }
]

/** The brand token changed in v42, so a comparison shows changes only when it spans that version. */
const tokenChanged = 42

function describe(n: number): string {
  if (n === versions[0]!.n) return "now"
  if (n === 40) return "when you were last here"
  return versions.find((version) => version.n === n)!.label
}

/**
 * One side of the comparison, named above its column: the version and what it was. Clicking it picks another, newest
 * first, with who made each; a version that would cross the other side can't be picked.
 */
function VersionPicker({
  side,
  value,
  other,
  onPick
}: {
  side: "before" | "after"
  value: number
  other: number
  onPick(n: number): void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group -mx-1.5 flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-white/40 hover:bg-white/[0.06] hover:text-white/60 data-[state=open]:bg-white/[0.06]"
        >
          <span className="font-medium text-white/70">v{value}</span>, {describe(value)}
          <ChevronDown className="size-3 opacity-50 group-hover:opacity-100" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {side === "before" ? "Compare from" : "Compare to"}
        </DropdownMenuLabel>
        {versions.map((version) => (
          <DropdownMenuItem
            key={version.n}
            disabled={side === "before" ? version.n >= other : version.n <= other}
            onSelect={() => onPick(version.n)}
            className="gap-2.5"
          >
            <Avatar person={version.who} size={18} />
            <span className="w-7 shrink-0 font-medium tabular-nums">v{version.n}</span>
            <span className="min-w-0 flex-1 truncate">{version.label}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{version.when}</span>
            <Check className={`size-3.5 ${version.n === value ? "" : "invisible"}`} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Something else since you were last here, kept to one line. */
function Also({ who, children }: { who: (typeof people)[keyof typeof people]; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5 text-xs text-muted-foreground">
      <Avatar person={who} size={18} />
      <span className="min-w-0 flex-1 leading-relaxed">{children}</span>
    </div>
  )
}

export function ChangesPage() {
  const project = portalProject("dashboard")
  const billing = designOf(project, "Billing")
  const overview = designOf(project, "Overview")
  const [from, setFrom] = useState(40)
  const [to, setTo] = useState(43)
  // Before v42 the brand token was still blue.
  const lookAt = (n: number): Look => (n < tokenChanged ? { ...project.look, hue: 250 } : project.look)
  const changed = from < tokenChanged && to >= tokenChanged
  const also = [
    { at: 43, who: maya, text: <>on Billing: “{event("maya-comment").quote}”</> },
    { at: 41, who: sam, text: <>merged #142 Billing settings, before this change</> }
  ].filter((item) => item.at > from && item.at <= to)
  const [view, setView] = useState<View>("both")
  const [focus, setFocus] = useState<number>()
  const [more, setMore] = useState(false)
  const boards = [
    { name: "Billing" as const, kind: billing.kind },
    { name: "Overview" as const, kind: overview.kind }
  ]
  const sides = view === "both" ? (["before", "after"] as const) : ([view] as const)
  return (
    <PortalWindow path={`kestrel/cloud-console/compare/v${from}...v${to}`}>
      <div className="flex h-full flex-col">
        <header className="flex h-11 shrink-0 items-center gap-2.5 border-b bg-background px-3 text-sm whitespace-nowrap">
          <ParityMark size={20} />
          <span className="font-medium">{project.name}</span>
          <ChevronRight className="size-3.5 text-muted-foreground/60" />
          <span className="text-muted-foreground">What changed</span>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost">
              Share
            </Button>
            <MoreMenu />
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1 overflow-auto bg-[#0f0f12]">
            <div className="flex items-center justify-between px-12 pt-5 pb-4">
              <div className={`grid flex-1 gap-x-10 ${sides.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                {sides.map((side) => (
                  <VersionPicker
                    key={side}
                    side={side}
                    value={side === "before" ? from : to}
                    other={side === "before" ? to : from}
                    onPick={side === "before" ? setFrom : setTo}
                  />
                ))}
              </div>
              <div className="ml-6 flex rounded-md bg-white/[0.06] p-0.5 text-[11px]">
                {(["before", "both", "after"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={view === option}
                    onClick={() => setView(option)}
                    className={`rounded-[5px] px-2 py-0.5 ${view === option ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80"}`}
                  >
                    {option === "before" ? "Before" : option === "after" ? "After" : "Side by side"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-8 px-12 pb-10">
              {boards.map((board) => (
                <section key={board.name} className="flex flex-col gap-2">
                  <span className="text-[11px] font-medium text-white/50">{board.name}</span>
                  <div
                    className={`grid gap-x-10 ${sides.length === 2 ? "grid-cols-2" : "mx-auto w-full max-w-3xl grid-cols-1"}`}
                  >
                    {sides.map((side) => (
                      <Board
                        key={side}
                        kind={board.kind}
                        look={lookAt(side === "before" ? from : to)}
                        side={side}
                        marks={changed ? changes.filter((change) => change.board === board.name) : []}
                        focus={focus}
                        onFocus={setFocus}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
          <aside className="flex w-[21rem] shrink-0 flex-col border-l bg-background">
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
              <div className="flex flex-col gap-1.5">
                <h2 className="text-sm font-semibold">What changed</h2>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {changed
                    ? "One token changed, so 3 places on 2 boards look different. Nothing else did."
                    : `Nothing on these boards changed between v${from} and v${to}.`}
                </p>
              </div>
              {changed && (
                <>
                  <div className="flex items-center gap-2.5 rounded-lg bg-muted/40 px-3 py-2.5">
                    <span className="font-mono text-xs">--brand</span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <span
                        className="size-4 rounded-[4px] ring-1 ring-white/10"
                        style={{ background: "oklch(0.6 0.17 250)" }}
                      />
                      <ChevronRight className="size-3 text-muted-foreground" />
                      <span
                        className="size-4 rounded-[4px] ring-1 ring-white/10"
                        style={{ background: "oklch(0.62 0.15 158)" }}
                      />
                    </span>
                  </div>
                  <ol className="-mx-2 flex flex-col">
                    {changes.map((change) => {
                      const active = focus === undefined ? undefined : focus === change.n
                      return (
                        <li key={change.n}>
                          <button
                            type="button"
                            onPointerEnter={() => setFocus(change.n)}
                            onPointerLeave={() => setFocus(undefined)}
                            onFocus={() => setFocus(change.n)}
                            onBlur={() => setFocus(undefined)}
                            className={`flex w-full gap-3 rounded-lg px-2 py-2.5 text-left transition-opacity duration-150 ${active ? "bg-muted/50" : ""} ${active === false ? "opacity-50" : ""}`}
                          >
                            <Number n={change.n} />
                            <span className="flex min-w-0 flex-col gap-0.5">
                              <span className="text-[13px] font-medium">
                                {change.board}, {change.where}
                              </span>
                              <span className="text-xs text-muted-foreground">{change.what}</span>
                              <span className="font-mono text-[11px] text-muted-foreground/70">{change.code}</span>
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ol>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Avatar person={claude} size={18} />
                    <span>Claude Code, for you, {event("claude-run").when.toLowerCase()}</span>
                  </div>
                </>
              )}
              {also.length > 0 && (
                <div className="border-t pt-3">
                  <button
                    type="button"
                    aria-expanded={more}
                    onClick={() => setMore(!more)}
                    className="flex w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ChevronRight className={`size-3.5 transition-transform ${more ? "rotate-90" : ""}`} />
                    Also between v{from} and v{to}: {also.length === 1 ? "1 more" : `${also.length} more`}
                  </button>
                  {more && (
                    <div className="flex flex-col pt-2 pl-5 motion-safe:animate-in motion-safe:fade-in-0">
                      {also.map((item) => (
                        <Also key={item.at} who={item.who}>
                          <span className="text-foreground">{item.who.name.split(" ")[0]}</span> {item.text}
                        </Also>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {changed && (
              <div className="flex flex-col gap-2 border-t px-5 py-4">
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 gap-1.5">
                    <Check /> Approve
                  </Button>
                  <Button size="sm" variant="ghost" className="flex-1">
                    Ask for changes
                  </Button>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Approves #148 and marks both boards ready to build.
                </span>
              </div>
            )}
          </aside>
        </div>
      </div>
    </PortalWindow>
  )
}
