/**
 * A project opened from the portal on what changed: its canvas in the browser, comparing two versions. Quiet around
 * the edges so the changes are what you see: the changed boards before and after, each change marked and numbered,
 * and the same numbers down the side with what happened and where it lives in code. Hovering a change in either place
 * brings it forward and fades the rest. A notification or "See what changed" opens this; the link names both versions,
 * so it can go in a pull request. Each board has its own versions and is approved on its own, so a comparison shows
 * each board from its last approved version. Three use it: Claude Code's token change across three Cloud console
 * boards, already in a pull request; the versions Maya made of Pricing after you approved v12 and started building it;
 * and In game, where the code moved away from its approved design.
 */
import {
  Check,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Link2,
  MessageSquare,
  Monitor
} from "lucide-react"
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
import type { Look } from "../start/data.ts"
import { DesignRender } from "../start/renders.tsx"
import { type ConsolePart, consoleFiles, deliverable, type PullRequest } from "./boards.ts"
import { claudeTask, designOf, event, portalProject } from "./data.ts"
import { InGameAt } from "./ingame-render.tsx"
import { PortalWindow } from "./parts.tsx"
import { PricingAt, PricingPhoneAt } from "./pricing-render.tsx"

const { maya, sam, claude, jonas, priya } = people
const violet = "oklch(0.7 0.16 275)"

type View = "before" | "both" | "after"

/** A place on a board, by share of the board's size. */
interface Area {
  left: string
  top: string
  width: string
  height: string
}

/** A component a change touched, its file, and how its use changed, as lines of a diff. */
interface Touched {
  name: string
  file: string
  diff?: string[]
}

/**
 * A change: the places on one board that look different, what happened there, and the components and files it comes
 * from. A move is outlined where it was on the before side and where it is now on the after side; a removal is
 * outlined, dashed, where it was on both.
 */
interface Change {
  n: number
  board: string
  /** The version that made it. */
  at: number
  who: Person
  kind?: "Moved" | "Removed"
  /** Where it is now, or for a removal, where it was. */
  areas: Area[]
  /** Where it was, for a move. */
  was?: Area[]
  where: string
  what: string
  parts: Touched[]
  /** Open threads on it. */
  threads?: number
  /** The same change on other boards: the same page at another size. */
  elsewhere?: { board: string; areas: Area[]; was?: Area[] }[]
  /** Put its number to the right of a small place, where the left would cover what changed. */
  numberRight?: boolean
}

/** A change where it shows on one board. */
interface Mark {
  change: Change
  areas: Area[]
  was?: Area[]
}

interface Version {
  n: number
  who: Person
  label: string
  when: string
  /** Not marked ready: edits in between, which move nothing and reach nobody. */
  draft?: boolean
}

/**
 * Who you are to a comparison, which decides what you can do at its foot. A reviewer the designer asked approves it or
 * asks for changes. Whoever's building the version before it keeps building, or asks the designer. Where the code has
 * moved away from the design, either side can give way.
 */
type Viewer =
  | { as: "reviewer"; threads: string; approves: ReactNode; boards?: string[] }
  | { as: "builder"; building: number; reviewer: Person; designer: Person; threads: string; yours: string }
  | { as: "drift"; builder: Person; note: ReactNode }

/** One comparison: its project, versions, boards, changes, and what approving it does. */
export interface Comparison {
  project: string
  slug: string
  /** Newest first. Parity records them itself, whether or not the project uses git, and only a change makes one. */
  versions: Version[]
  from: number
  to: number
  /** What to call a version besides its label: the one you approved, or the one current when you were last here. */
  named: Record<number, string>
  /** Fixed names for the two sides, where they aren't two versions to pick between: a design and its code. */
  sides?: { before: string; after: string }
  /** What the view is called, and the end of its link, when it isn't two versions. */
  title?: string
  compare?: string
  /**
   * The boards, each drawn at a version. A comparison of several boards gives each its own versions, from the one last
   * approved to the one ready for review; a phone board is drawn narrower.
   */
  boards: { name: string; from?: number; to?: number; narrow?: boolean; draw(version: number): ReactNode }[]
  changes: Change[]
  /** The sentence at the top of the side panel, for the changes shown. */
  summary(shown: Change[]): string
  /** Who made the changes, and why. */
  why: ReactNode
  token?: { name: string; was: string; now?: string; note: string }
  /** Other things between the two versions, kept to a line each. */
  also: { at: number; who: Person; text: ReactNode }[]
  /** The code it's in: the branch and pull request, and what they are. */
  code?: { label: string; branch: string; pr: PullRequest }
  you: Viewer
}

function at(left: number, top: number, width: number, height: number): Area {
  return { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }
}

function fromConsole(name: ConsolePart): Touched {
  return { name, file: consoleFiles[name] }
}

const dashboard = portalProject("dashboard")
/** Before Claude Code's version the brand token was blue. */
const consoleLook = (n: number, to: number): Look => (n < to ? { ...dashboard.look, hue: 250 } : dashboard.look)
const consoleBoards = (["Billing", "Overview", "Sign in"] as const).map((name) => deliverable("dashboard", name))

/** Claude Code's change to the Cloud console, for Sam: one token, measured wherever the boards draw with it. */
export const consoleComparison: Comparison = {
  project: "dashboard",
  slug: "cloud-console",
  compare: "approved...ready",
  versions: [{ n: 1, who: claude, label: "Ready for review", when: event("claude-run").when }],
  from: 0,
  to: 1,
  named: {},
  sides: { before: "Each board as last approved", after: "Ready for review, from Claude Code" },
  boards: consoleBoards.map((board) => ({
    name: board.design,
    from: board.approvedBefore,
    to: board.version,
    draw: (n: number) => (
      <DesignRender kind={designOf(dashboard, board.design).kind} look={consoleLook(n, board.version)} />
    )
  })),
  changes: [
    {
      n: 1,
      board: "Billing",
      at: 1,
      who: claude,
      areas: [at(0.8, 1.6, 3.6, 5), at(0.4, 37.4, 17.2, 6.4)],
      where: "Navigation",
      what: "The logo and the open page",
      parts: [fromConsole("Brand"), fromConsole("SidebarLink")]
    },
    {
      n: 2,
      board: "Billing",
      at: 1,
      who: claude,
      areas: [at(88.6, 13.4, 9.6, 5.6)],
      where: "Change plan",
      what: "The main button",
      parts: [fromConsole("Button")]
    },
    {
      n: 3,
      board: "Billing",
      at: 1,
      who: claude,
      areas: [at(21.8, 22.8, 39.2, 14.6), at(21.8, 57.8, 36.4, 3.8)],
      where: "Plan and usage",
      what: "The plan badge and the meters that aren't near their limit",
      parts: [fromConsole("PlanBadge"), fromConsole("UsageMeter")]
    },
    {
      n: 4,
      board: "Billing",
      at: 1,
      who: claude,
      areas: [at(21.6, 64.6, 76.6, 23.2)],
      where: "Plans",
      what: "The current plan's ring and check, and every plan's ticks",
      parts: [fromConsole("PlanCard")]
    },
    {
      n: 5,
      board: "Overview",
      at: 1,
      who: claude,
      areas: [at(0.8, 1.6, 3.6, 5), at(0.4, 13, 17.2, 6.4)],
      where: "Navigation",
      what: "The logo and the open page",
      parts: [fromConsole("Brand"), fromConsole("SidebarLink")]
    },
    {
      n: 6,
      board: "Overview",
      at: 1,
      who: claude,
      areas: [at(88.8, 13.5, 9.4, 5.6)],
      where: "New app",
      what: "The main button",
      parts: [fromConsole("Button")]
    },
    {
      n: 7,
      board: "Overview",
      at: 1,
      who: claude,
      areas: [at(30.4, 27.4, 66.6, 5)],
      where: "Stats",
      what: "Each stat's sparkline",
      parts: [fromConsole("StatCard")]
    },
    {
      n: 8,
      board: "Overview",
      at: 1,
      who: claude,
      areas: [at(21.8, 36.6, 41.6, 29.6)],
      where: "Usage chart",
      what: "The chart's line, fill and legend",
      parts: [fromConsole("UsageChart")]
    },
    {
      n: 9,
      board: "Overview",
      at: 1,
      who: claude,
      areas: [at(21.8, 94.4, 56.4, 5.4)],
      where: "Apps",
      what: "Each app's icon and request sparkline",
      parts: [fromConsole("AppRow")]
    },
    {
      n: 10,
      board: "Sign in",
      at: 1,
      who: claude,
      areas: [at(0.6, 1, 54.8, 98)],
      where: "Side panel",
      what: "The gradient behind the quote",
      parts: [fromConsole("SignInPanel")]
    },
    {
      n: 11,
      board: "Sign in",
      at: 1,
      who: claude,
      areas: [at(63.4, 18.2, 4.4, 7), at(63.4, 70.2, 29.1, 6.5)],
      where: "Form",
      what: "The logo and the Continue button",
      parts: [fromConsole("Brand"), fromConsole("Button")]
    }
  ],
  summary: (shown) =>
    shown.length
      ? `One token changed, so ${shown.length} places on 3 boards look different. Each is marked, and nothing else changed.`
      : "",
  why: (
    <>
      <span className="text-foreground">Claude Code</span>, {event("claude-run").when}, for Sam Okafor, who asked it to
      “{claudeTask}”.
    </>
  ),
  token: {
    name: "--brand",
    was: "oklch(0.6 0.17 250)",
    now: "oklch(0.62 0.15 158)",
    note: "Every component on these boards that uses it follows it. No component changed."
  },
  also: [
    { at: 1, who: maya, text: <>commented on Billing: “{event("maya-comment").quote}”</> },
    { at: 1, who: sam, text: <>commented on Billing: “{event("sam-comment").quote}”</> }
  ],
  code: { label: "Already in code", branch: "claude/green-brand", pr: { number: 148, state: "open" } },
  you: {
    as: "reviewer",
    threads: "2 open threads on Billing, Maya's and Sam's.",
    approves: <>The code is already in #148, so each board you approve is Built when #148 merges.</>,
    boards: consoleBoards.map((board) => `${board.design}, v${board.version}`)
  }
}

const website = portalProject("website")
const pricing = deliverable("website", "Pricing")
const pricingFiles = Object.fromEntries(pricing.parts.map((part) => [part.name, part.file]))

/** Where the changes sit on the phone board, measured from its render as the desktop ones are. */
const phoneBadge = [at(11.6, 34.6, 21.7, 4.7)]
const phoneSaving = [at(59.1, 28.5, 16.6, 3.7)]
const phoneTeam = [at(4.1, 34.6, 91.7, 42.3)]

/**
 * Maya's versions of Pricing after you approved v12 and started building it. Outlines are measured from the render:
 * `data-mark` elements, as shares of the 1280 by 800 board.
 */
export const pricingComparison: Comparison = {
  project: "website",
  slug: "kestrel-website/pricing",
  versions: [
    { n: 14, who: maya, label: "Maya made Team Most popular", when: event("maya-change").when },
    { n: 13, who: maya, label: "Maya moved Save 20% into the toggle", when: "40 min ago", draft: true },
    { n: 12, who: maya, label: "Maya lined up the plan cards", when: "Yesterday" },
    { n: 11, who: maya, label: "Maya's first pass at three plans", when: "2 days ago" }
  ],
  from: 12,
  to: 14,
  named: { 12: "you approved it", 14: "ready for review" },
  boards: [
    { name: "Pricing", draw: (n) => <PricingAt look={website.look} version={n} /> },
    { name: "Pricing, phone", narrow: true, draw: (n) => <PricingPhoneAt look={website.look} version={n} /> }
  ],
  changes: [
    {
      n: 1,
      board: "Pricing",
      at: 13,
      who: maya,
      kind: "Moved",
      was: [at(38.7, 45.4, 7, 4.7)],
      areas: [at(52.6, 37, 5.5, 3.7)],
      where: "Save 20%",
      what: "From Team's card into the toggle's Yearly option",
      numberRight: true,
      elsewhere: [{ board: "Pricing, phone", was: phoneBadge, areas: phoneSaving }],
      parts: [
        { name: "PlanCard", file: pricingFiles.PlanCard!, diff: ['- badge="Save 20%"'] },
        { name: "BillingToggle", file: pricingFiles.BillingToggle!, diff: ['+ saving="20%"'] }
      ],
      threads: 1
    },
    {
      n: 2,
      board: "Pricing",
      at: 14,
      who: maya,
      areas: [at(36.6, 45.4, 26.8, 46.2)],
      where: "Team's card",
      what: "Most popular, with a ring, a glow and a filled button",
      elsewhere: [{ board: "Pricing, phone", areas: phoneTeam }],
      parts: [{ name: "PlanCard", file: pricingFiles.PlanCard!, diff: ["+ popular"] }]
    },
    {
      n: 3,
      board: "Pricing",
      at: 14,
      who: maya,
      kind: "Removed",
      areas: [at(43.8, 94.1, 12.3, 4.2)],
      where: "Compare all plans",
      what: "Taken out from under the cards",
      parts: [{ name: "ComparePlansLink", file: pricing.page, diff: ["- <ComparePlansLink />"] }]
    }
  ],
  summary: (shown) =>
    shown.length
      ? `${shown.length === 1 ? "1 change" : `${shown.length} changes`} on Pricing since the version you approved: one moved, one changed and one taken out.`
      : "",
  why: (
    <>
      <span className="text-foreground">Maya Chen</span>, in v13 and v14: “Save 20% reads better next to Yearly, and
      Team should look like the plan we want people on.”
    </>
  ),
  token: {
    name: "--savings",
    was: "oklch(0.72 0.15 162)",
    note: "Only Team's old badge used it, so it's no longer used. Save 20% in the toggle follows --brand."
  },
  also: [],
  code: { label: "You're building v12", branch: "pricing-plans", pr: { number: 150, state: "draft" } },
  you: {
    as: "builder",
    building: 12,
    reviewer: priya,
    designer: maya,
    threads: "1 open thread, Jonas's on the toggle",
    yours: "#150 builds all 3 components this changes, and adds the ComparePlansLink v14 takes out."
  }
}

const caves = portalProject("spawnkit")

/**
 * In game, where the code moved away from the design after it was built: v5, as approved and built in #128, against
 * main after #139. Outlines are measured from the render, as shares of the 1280 by 800 board.
 */
export const inGameComparison: Comparison = {
  project: "spawnkit",
  slug: "ember-caves/in-game",
  title: "Code against design",
  compare: "v5...main",
  versions: [
    { n: 6, who: sam, label: "main, after #139", when: "9 days ago" },
    { n: 5, who: jonas, label: "v5, approved and built", when: "3 weeks ago" }
  ],
  from: 5,
  to: 6,
  named: {},
  sides: { before: "v5, as approved and built in #128", after: "main now, after #139" },
  boards: [{ name: "In game", draw: (n) => <InGameAt look={caves.look} as={n === 5 ? "design" : "code"} /> }],
  changes: [
    {
      n: 1,
      board: "In game",
      at: 6,
      who: sam,
      kind: "Moved",
      was: [at(2, 90.4, 10.7, 7.2)],
      areas: [at(2, 2.4, 9.4, 5.2)],
      where: "Hearts",
      what: "From a bar at the bottom to the top left",
      parts: [
        {
          name: "HealthBar",
          file: "src/routes/play.tsx",
          diff: ['- <HealthBar placement="bottom" />', '+ <HealthBar placement="top" />']
        }
      ]
    },
    {
      n: 2,
      board: "In game",
      at: 6,
      who: sam,
      kind: "Moved",
      was: [at(2, 2.4, 13.3, 4.6)],
      areas: [at(2, 7.4, 13.3, 4.6)],
      where: "Score",
      what: "Down, under the hearts",
      parts: [{ name: "GameHud", file: "src/hud/GameHud.tsx" }]
    }
  ],
  summary: () =>
    "The code draws 2 things differently from v5, the version that was approved and built. Nothing else differs.",
  why: (
    <>
      <span className="text-foreground">Sam Okafor</span>, in #139, merged 9 days ago: “Hearts at the bottom sat under
      players' thumbs.” Nobody changed the design to match.
    </>
  ),
  also: [],
  code: { label: "Changed in", branch: "main", pr: { number: 139, state: "merged" } },
  you: {
    as: "drift",
    builder: sam,
    note: (
      <>
        Updating makes a new version from what main draws, for Lena or Jonas to approve. Asking Sam opens a thread on
        #139.
      </>
    )
  }
}

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
 * A board, before or after. After, each change is outlined with its number; a removal is dashed where it was. Before,
 * moves and removals are dashed where they were, and the change you're looking at is traced faintly so the two can be
 * compared at a glance.
 */
function Board({
  children,
  side,
  marks,
  focus,
  onFocus
}: {
  children: ReactNode
  side: "before" | "after"
  marks: Mark[]
  focus?: number
  onFocus(n: number | undefined): void
}) {
  return (
    <div className="relative rounded-[5px] shadow-[0_16px_40px_-12px_rgb(0_0_0/0.6)] ring-1 ring-white/[0.06]">
      <div className="overflow-hidden rounded-[5px]">{children}</div>
      {marks.flatMap(({ change, areas: now, was }) => {
        const active = focus === undefined ? undefined : focus === change.n
        const before = side === "before"
        const areas = before ? (was ?? now) : now
        // The before side marks only what isn't where it was: moves and removals, or the change you're looking at.
        const shown = before ? Boolean(change.kind) || active : true
        if (!shown) return []
        const dashed = before || change.kind === "Removed"
        return areas.map((area, index) => {
          const key = `${change.n}-${index}`
          return (
            <button
              key={key}
              type="button"
              aria-label={`Change ${change.n}, ${change.where}`}
              onPointerEnter={() => onFocus(change.n)}
              onPointerLeave={() => onFocus(undefined)}
              onFocus={() => onFocus(change.n)}
              onBlur={() => onFocus(undefined)}
              className={`absolute rounded-[4px] transition-[opacity,box-shadow,background-color] duration-150 ${dashed ? "border-[1.5px] border-dashed" : ""} ${active === false ? "opacity-30" : ""}`}
              style={{
                ...area,
                borderColor: dashed ? violet : undefined,
                boxShadow: dashed ? undefined : `0 0 0 ${active ? 2 : 1.5}px ${violet}`,
                background: active ? `color-mix(in oklch, ${violet} 10%, transparent)` : undefined
              }}
            >
              {/* A change in several places is numbered once, at its first. */}
              {/* A small place gets its number beside it, so the number doesn't cover what changed. */}
              {index === 0 && (!before || change.kind) && (
                <span
                  className={`absolute ${change.numberRight ? "top-1/2 left-full ml-1 -translate-y-1/2" : parseFloat(area.width) >= 15 ? "-top-2 -left-2" : "top-1/2 right-full mr-1 -translate-y-1/2"}`}
                >
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

/**
 * The project's overflow, kept in a menu so the comparison stays quiet: the link, the canvas at the newer version, the
 * desktop app, and the branch and pull request the change is in.
 */
function MoreMenu({ code, to }: { code: Comparison["code"]; to: number }) {
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
          <ExternalLink /> Open the canvas at v{to}
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Monitor /> Open in the desktop app
        </DropdownMenuItem>
        {code && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{code.label}</DropdownMenuLabel>
            <DropdownMenuItem>
              <GitBranch /> <span className="truncate font-mono text-xs">{code.branch}</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <GitPullRequest /> Pull request #{code.pr.number}, {code.pr.state}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * One side of the comparison, named above its column: the version and what it was. Clicking it picks another, newest
 * first, with who made each; a version that would cross the other side can't be picked.
 */
function VersionPicker({
  comparison,
  side,
  value,
  other,
  onPick
}: {
  comparison: Comparison
  side: "before" | "after"
  value: number
  other: number
  onPick(n: number): void
}) {
  const { versions, named } = comparison
  const describe = (n: number) =>
    named[n] ?? (n === versions[0]!.n ? "now" : versions.find((version) => version.n === n)!.label)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group -mx-1.5 flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-white/55 hover:bg-white/[0.06] hover:text-white/75 data-[state=open]:bg-white/[0.06]"
        >
          <span>
            <span className="font-medium text-white/85">v{value}</span>, {describe(value)}
          </span>
          <ChevronDown className="size-3 opacity-60 group-hover:opacity-100" />
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
            <span className="min-w-0 flex-1 truncate">
              {version.label}
              {version.draft && <span className="text-muted-foreground">, a draft</span>}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{version.when}</span>
            <Check className={`size-3.5 ${version.n === value ? "" : "invisible"}`} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Something else between the two versions, kept to one line. */
function Also({ who, children }: { who: Person; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5 text-xs text-muted-foreground">
      <Avatar person={who} size={18} />
      <span className="min-w-0 flex-1 leading-relaxed">{children}</span>
    </div>
  )
}

/** A component a change touched, its file, and its diff, red for what went and green for what came. */
function TouchedPart({ part }: { part: Touched }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 text-[11px]">
      <span className="font-mono text-foreground/80">{part.name}</span>
      <span className="flex min-w-0 items-center gap-1 font-mono text-muted-foreground/80">
        <span className="truncate underline decoration-muted-foreground/40 underline-offset-2">{part.file}</span>
        <ExternalLink className="size-3 shrink-0 opacity-60" aria-label="Opens on GitHub" />
      </span>
      {part.diff?.map((line) => (
        <span
          key={line}
          className={`w-fit rounded-[3px] px-1 font-mono ${line.startsWith("-") ? "bg-[oklch(0.65_0.2_25)]/15 text-[oklch(0.78_0.12_25)]" : "bg-[oklch(0.7_0.15_150)]/15 text-[oklch(0.8_0.13_150)]"}`}
        >
          {line}
        </span>
      ))}
    </span>
  )
}

/** A token before and after, with its values. */
function TokenChange({ token }: { token: NonNullable<Comparison["token"]> }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/40 px-3 py-2.5">
      <span className="flex items-center gap-2.5">
        <span className="font-mono text-xs">{token.name}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="size-4 rounded-[4px] ring-1 ring-white/10" style={{ background: token.was }} />
          <ChevronRight className="size-3 text-muted-foreground" />
          {token.now ? (
            <span className="size-4 rounded-[4px] ring-1 ring-white/10" style={{ background: token.now }} />
          ) : (
            <span className="text-[11px] text-muted-foreground">unused</span>
          )}
        </span>
      </span>
      <span className="font-mono text-[11px] text-muted-foreground">
        {token.was}
        {token.now && (
          <>
            <br />
            {token.now}
          </>
        )}
      </span>
      <span className="text-[11px] text-muted-foreground">{token.note}</span>
    </div>
  )
}

export function ChangesPage({ comparison }: { comparison: Comparison }) {
  const project = portalProject(comparison.project)
  const [from, setFrom] = useState(comparison.from)
  const [to, setTo] = useState(comparison.to)
  const shown = comparison.sides
    ? comparison.changes
    : comparison.changes.filter((change) => change.at > from && change.at <= to)
  const marksOn = (board: string): Mark[] =>
    shown.flatMap((change) =>
      change.board === board
        ? [{ change, areas: change.areas, was: change.was } as Mark]
        : (change.elsewhere ?? [])
            .filter((place) => place.board === board)
            .map((place): Mark => ({ change, areas: place.areas, was: place.was }))
    )
  const versionsShown = new Set(shown.map((change) => change.at)).size > 1
  const also = comparison.also.filter((item) => item.at > from && item.at <= to)
  const [view, setView] = useState<View>("both")
  const [focus, setFocus] = useState<number>()
  const [more, setMore] = useState(false)
  const [asking, setAsking] = useState(false)
  const boards = comparison.boards.filter((board) => marksOn(board.name).length)
  const sides = view === "both" ? (["before", "after"] as const) : ([view] as const)
  return (
    <PortalWindow path={`kestrel/${comparison.slug}/compare/${comparison.compare ?? `v${from}...v${to}`}`}>
      <div className="flex h-full flex-col">
        <header className="flex h-11 shrink-0 items-center gap-2.5 border-b bg-background px-3 text-sm whitespace-nowrap">
          <ParityMark size={20} />
          <span className="font-medium">{project.name}</span>
          <ChevronRight className="size-3.5 text-muted-foreground/60" />
          <span className="text-muted-foreground">{comparison.title ?? "What changed"}</span>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost">
              Share
            </Button>
            <MoreMenu code={comparison.code} to={to} />
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1 overflow-auto bg-[#0f0f12]">
            <div className="flex items-center justify-between px-12 pt-5 pb-4">
              <div className={`grid flex-1 gap-x-10 ${sides.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                {sides.map((side) =>
                  comparison.sides ? (
                    <span key={side} className="text-xs text-white/55">
                      {comparison.sides[side]}
                    </span>
                  ) : (
                    <VersionPicker
                      key={side}
                      comparison={comparison}
                      side={side}
                      value={side === "before" ? from : to}
                      other={side === "before" ? to : from}
                      onPick={side === "before" ? setFrom : setTo}
                    />
                  )
                )}
              </div>
              <div className="ml-6 flex rounded-md bg-white/[0.06] p-0.5 text-xs">
                {(["before", "both", "after"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={view === option}
                    onClick={() => setView(option)}
                    className={`rounded-[5px] px-2 py-0.5 ${view === option ? "bg-white/15 text-white" : "text-white/55 hover:text-white/80"}`}
                  >
                    {option === "before" ? "Before" : option === "after" ? "After" : "Side by side"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-8 px-12 pb-10">
              {(boards.length ? boards : comparison.boards).map((board) => (
                <section key={board.name} className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-white/55">
                    {board.name}
                    {board.from !== undefined && (
                      <span className="font-normal text-white/40">
                        {" "}
                        v{board.from}, approved, and v{board.to}
                      </span>
                    )}
                  </span>
                  <div
                    className={`grid gap-x-10 ${sides.length === 2 ? "grid-cols-2" : "mx-auto w-full max-w-3xl grid-cols-1"}`}
                  >
                    {sides.map((side) => (
                      <div key={side} className={board.narrow ? "mx-auto w-[200px]" : ""}>
                        <Board side={side} marks={marksOn(board.name)} focus={focus} onFocus={setFocus}>
                          {board.draw(side === "before" ? (board.from ?? from) : (board.to ?? to))}
                        </Board>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
          <aside className="flex w-[22rem] shrink-0 flex-col border-l bg-background">
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
              <div className="flex flex-col gap-1.5">
                <h2 className="text-sm font-semibold">What changed</h2>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {shown.length
                    ? comparison.summary(shown)
                    : `Nothing on these boards changed between v${from} and v${to}.`}
                </p>
              </div>
              {shown.length > 0 && (
                <>
                  <div className="text-xs leading-relaxed text-muted-foreground">{comparison.why}</div>
                  {comparison.token && <TokenChange token={comparison.token} />}
                  <ol className="-mx-2 flex flex-col">
                    {shown.map((change) => {
                      const active = focus === undefined ? undefined : focus === change.n
                      return (
                        <li key={change.n} className="group relative">
                          <button
                            type="button"
                            onPointerEnter={() => setFocus(change.n)}
                            onPointerLeave={() => setFocus(undefined)}
                            onFocus={() => setFocus(change.n)}
                            onBlur={() => setFocus(undefined)}
                            className={`flex w-full gap-3 rounded-lg px-2 py-2.5 pr-12 text-left transition-opacity duration-150 ${active ? "bg-muted/50" : ""} ${active === false ? "opacity-50" : ""}`}
                          >
                            <Number n={change.n} />
                            <span className="flex min-w-0 flex-col gap-1">
                              <span className="flex items-center gap-2 text-[13px] font-medium">
                                {change.board}, {change.where}
                                {change.kind && (
                                  <span className="rounded-[4px] border px-1 text-[10px] font-normal text-muted-foreground">
                                    {change.kind}
                                  </span>
                                )}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {change.what}
                                {versionsShown && `, in v${change.at} by ${change.who.name.split(" ")[0]}`}
                              </span>
                              {change.parts.map((part) => (
                                <TouchedPart key={part.name} part={part} />
                              ))}
                            </span>
                          </button>
                          {/* Comment on a change: it pins to the change on the board, at the newer version. */}
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`Comment on change ${change.n}`}
                            className={`absolute top-2 right-1 gap-1 text-muted-foreground ${change.threads ? "w-auto px-1.5" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
                          >
                            <MessageSquare />
                            {change.threads && <span className="text-[11px] tabular-nums">{change.threads}</span>}
                          </Button>
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
                    {comparison.sides ? "Also on these boards" : `Also between v${from} and v${to}`}:{" "}
                    {also.length === 1 ? "1 more" : `${also.length} more`}
                  </button>
                  {more && (
                    <div className="flex flex-col pt-2 pl-5 motion-safe:animate-in motion-safe:fade-in-0">
                      {also.map((item) => (
                        <Also key={item.who.name} who={item.who}>
                          <span className="text-foreground">{item.who.name.split(" ")[0]}</span> {item.text}
                        </Also>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {shown.length > 0 && (
              <div className="flex flex-col gap-2 border-t px-5 py-4">
                <Foot you={comparison.you} to={to} changes={shown.length} asking={asking} onAsk={setAsking} />
              </div>
            )}
          </aside>
        </div>
      </div>
    </PortalWindow>
  )
}

/** What you can do at the foot of a comparison, by who you are to it, with a note box for asking. */
function Foot({
  you,
  to,
  changes,
  asking,
  onAsk
}: {
  you: Viewer
  to: number
  changes: number
  asking: boolean
  onAsk(asking: boolean): void
}) {
  const ask =
    you.as === "reviewer"
      ? "Ask for changes"
      : you.as === "builder"
        ? `Ask ${first(you.designer)}`
        : `Ask ${first(you.builder)}`
  const placeholder =
    you.as === "reviewer"
      ? "What should change? It goes to everyone who made these versions."
      : you.as === "builder"
        ? `Ask ${first(you.designer)} about these changes`
        : `What should ${first(you.builder)} change back?`
  return (
    <>
      {you.as !== "drift" && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MessageSquare className="size-3.5 shrink-0" />
          {you.as === "builder" ? `v${to} waits on ${you.reviewer.name}'s review, with ${you.threads}.` : you.threads}
        </span>
      )}
      {you.as === "builder" && <span className="text-xs text-muted-foreground">{you.yours}</span>}
      {you.as === "reviewer" && you.boards && !asking && (
        <div className="flex flex-col gap-1">
          {you.boards.map((board) => (
            <label key={board} className="flex items-center gap-2 text-xs">
              <input type="checkbox" defaultChecked className="size-3.5 accent-foreground" />
              {board}
            </label>
          ))}
        </div>
      )}
      {asking ? (
        <>
          <textarea
            aria-label={ask}
            placeholder={placeholder}
            className="min-h-20 resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1">
              Send
            </Button>
            <Button size="sm" variant="ghost" className="flex-1" onClick={() => onAsk(false)}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 gap-1.5">
            {you.as === "reviewer" ? (
              <>
                <Check /> {you.boards ? `Approve ${you.boards.length} boards` : `Approve v${to}`}
              </>
            ) : you.as === "builder" ? (
              `Keep building v${you.building}`
            ) : (
              "Update the design"
            )}
          </Button>
          <Button size="sm" variant="ghost" className="flex-1" onClick={() => onAsk(true)}>
            {ask}
          </Button>
        </div>
      )}
      <span className="text-[11px] leading-relaxed text-muted-foreground">
        {you.as === "reviewer"
          ? you.approves
          : you.as === "builder"
            ? `When ${first(you.reviewer)} approves v${to}, your build moves to it with these ${changes} changes. Until then, v${you.building} is the approved version.`
            : you.note}
      </span>
    </>
  )
}

function first(person: Person): string {
  return person.name.split(" ")[0]!
}
