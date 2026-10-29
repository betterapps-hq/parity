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
import { people, type Person } from "../explore-data.ts"
import { Avatar, ParityMark } from "../parts.tsx"
import type { Look, RenderKind } from "../start/data.ts"
import { DesignRender } from "../start/renders.tsx"
import { claudeTask, designOf, event, portalProject } from "./data.ts"
import { PortalWindow } from "./parts.tsx"

const { maya, sam, claude, jonas, lena } = people
const violet = "oklch(0.7 0.16 275)"

type View = "before" | "both" | "after"

/** A place on a board, by share of the board's size. */
interface Area {
  left: string
  top: string
  width: string
  height: string
}

/**
 * A change: the places on one board that look different, what happened there, and the component and file it comes
 * from. The places are every element the render draws with the changed token, measured from the render itself.
 */
interface Change {
  n: number
  board: BoardName
  areas: Area[]
  where: string
  what: string
  code: string
  file: string
}

type BoardName = "Billing" | "Overview" | "Sign in"

function at(left: number, top: number, width: number, height: number): Area {
  return { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }
}

const changes: Change[] = [
  {
    n: 1,
    board: "Billing",
    areas: [at(0.8, 1.6, 3.6, 5), at(0.4, 37.4, 17.2, 6.4)],
    where: "Navigation",
    what: "The logo and the open page",
    code: "Brand, SidebarLink",
    file: "src/app/Sidebar.tsx"
  },
  {
    n: 2,
    board: "Billing",
    areas: [at(88.6, 13.4, 9.6, 5.6)],
    where: "Change plan",
    what: "The main button",
    code: "Button",
    file: "src/ui/Button.tsx"
  },
  {
    n: 3,
    board: "Billing",
    areas: [at(21.8, 22.8, 39.2, 14.6), at(21.8, 57.8, 36.4, 3.8)],
    where: "Plan and usage",
    what: "The plan badge and the meters that aren't near their limit",
    code: "PlanBadge, UsageMeter",
    file: "src/billing"
  },
  {
    n: 4,
    board: "Billing",
    areas: [at(21.6, 64.6, 76.6, 23.2)],
    where: "Plans",
    what: "The current plan's ring and check, and every plan's ticks",
    code: "PlanCard",
    file: "src/billing/PlanCard.tsx"
  },
  {
    n: 5,
    board: "Overview",
    areas: [at(0.8, 1.6, 3.6, 5), at(0.4, 13, 17.2, 6.4)],
    where: "Navigation",
    what: "The logo and the open page",
    code: "Brand, SidebarLink",
    file: "src/app/Sidebar.tsx"
  },
  {
    n: 6,
    board: "Overview",
    areas: [at(88.8, 13.5, 9.4, 5.6)],
    where: "New app",
    what: "The main button",
    code: "Button",
    file: "src/ui/Button.tsx"
  },
  {
    n: 7,
    board: "Overview",
    areas: [at(30.4, 27.4, 66.6, 5)],
    where: "Stats",
    what: "Each stat's sparkline",
    code: "StatCard",
    file: "src/overview/StatCard.tsx"
  },
  {
    n: 8,
    board: "Overview",
    areas: [at(21.8, 36.6, 41.6, 29.6)],
    where: "Usage chart",
    what: "The chart's line, fill and legend",
    code: "UsageChart",
    file: "src/overview/UsageChart.tsx"
  },
  {
    n: 9,
    board: "Overview",
    areas: [at(21.8, 94.4, 56.4, 5.4)],
    where: "Apps",
    what: "Each app's icon and request sparkline",
    code: "AppRow",
    file: "src/overview/AppRow.tsx"
  },
  {
    n: 10,
    board: "Sign in",
    areas: [at(0.6, 1, 54.8, 98)],
    where: "Side panel",
    what: "The gradient behind the quote",
    code: "SignInPanel",
    file: "src/auth/SignInPanel.tsx"
  },
  {
    n: 11,
    board: "Sign in",
    areas: [at(63.4, 18.2, 4.4, 7), at(63.4, 70.2, 29.1, 6.5)],
    where: "Form",
    what: "The logo and the Continue button",
    code: "Brand, Button",
    file: "src/auth/SignIn.tsx"
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
      {marks.flatMap((change) => {
        const active = focus === undefined ? undefined : focus === change.n
        return change.areas.map((area, index) => {
          const key = `${change.n}-${index}`
          if (side === "before")
            return active ? (
              <span
                key={key}
                className="pointer-events-none absolute rounded-[4px] border-[1.5px] border-dashed motion-safe:animate-in motion-safe:fade-in-0"
                style={{ ...area, borderColor: violet }}
              />
            ) : null
          return (
            <button
              key={key}
              type="button"
              aria-label={`Change ${change.n}, ${change.where}`}
              onPointerEnter={() => onFocus(change.n)}
              onPointerLeave={() => onFocus(undefined)}
              onFocus={() => onFocus(change.n)}
              onBlur={() => onFocus(undefined)}
              className={`absolute rounded-[4px] transition-[opacity,box-shadow,background-color] duration-150 ${active === false ? "opacity-30" : ""}`}
              style={{
                ...area,
                boxShadow: `0 0 0 ${active ? 2 : 1.5}px ${violet}`,
                background: active ? `color-mix(in oklch, ${violet} 10%, transparent)` : undefined
              }}
            >
              {/* A change in several places is numbered once, at its first. */}
              {index === 0 && (
                <span className="absolute -top-2 -left-2">
                  <Number n={change.n} />
                </span>
              )}
            </button>
          )
        })
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
          <GitBranch /> <span className="truncate font-mono text-xs">claude/green-brand</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <GitPullRequest /> Pull request #148, open
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The project's versions, newest first: who made each, and what it was. Parity records them itself, whether or not
 * the project uses git, and only a change makes one: comments don't.
 */
const versions: { n: number; who: Person; label: string; when: string }[] = [
  { n: 43, who: claude, label: "Claude Code changed the brand token", when: event("claude-run").when },
  { n: 42, who: lena, label: "Kestrel UI 2.4, with the new Toggle", when: event("lena-publish").when },
  { n: 41, who: sam, label: "Sam tidied the deploys table", when: "Yesterday" },
  { n: 40, who: jonas, label: "Jonas renamed the Usage page", when: "2 days ago" }
]

/** The brand token changed in v43, so a comparison shows changes only when it spans that version. */
const tokenChanged = 43

/** The version that was current when you were last here. */
const lastHere = 41

function describe(n: number): string {
  if (n === versions[0]!.n) return "now"
  if (n === lastHere) return "when you were last here"
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
          <span>
            <span className="font-medium text-white/70">v{value}</span>, {describe(value)}
          </span>
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
  const [from, setFrom] = useState(lastHere)
  const [to, setTo] = useState(43)
  // Before v43 the brand token was still blue.
  const lookAt = (n: number): Look => (n < tokenChanged ? { ...project.look, hue: 250 } : project.look)
  const changed = from < tokenChanged && to >= tokenChanged
  const also = [
    { at: 42, who: lena, text: <>moved the project to Kestrel UI 2.4. Nothing on these boards looks different.</> },
    { at: 43, who: maya, text: <>commented on Billing: “{event("maya-comment").quote}”</> }
  ].filter((item) => item.at > from && item.at <= to)
  const [view, setView] = useState<View>("both")
  const [focus, setFocus] = useState<number>()
  const [more, setMore] = useState(false)
  const boards = (["Billing", "Overview", "Sign in"] as const).map((name) => ({
    name,
    kind: designOf(project, name).kind
  }))
  const places = changes.length
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
                    ? `One token changed, so ${places} places on ${boards.length} boards look different. Each is marked, and nothing else changed.`
                    : `Nothing on these boards changed between v${from} and v${to}.`}
                </p>
              </div>
              {changed && (
                <>
                  <div className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
                    <Avatar person={claude} size={18} />
                    <span>
                      <span className="text-foreground">Claude Code</span>, {event("claude-run").when}, for Sam Okafor,
                      who asked it to “{claudeTask}”.
                    </span>
                  </div>
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
                              <span className="text-[11px] text-muted-foreground/70">
                                <span className="font-mono">{change.code}</span> in{" "}
                                <span className="font-mono">{change.file}</span>
                              </span>
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ol>
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
                  Approves the design at v{to} and marks the {boards.length} boards ready to build. The pull request is
                  still reviewed on GitHub.
                </span>
              </div>
            )}
          </aside>
        </div>
      </div>
    </PortalWindow>
  )
}
