/**
 * Handoff, for developers: every board by where it stands between design and code. Statuses come from Parity's own
 * versions, so they work without git: an approval is of one version, and an edit after it shows as Changed since
 * approval wherever the board's status does. Boards are drawn from the project's own components, so each names what
 * it uses: its components and their files, its tokens and their values, its states and sizes. Branches and pull
 * requests show too, where a project has them.
 */
import { Bot, GitBranch, GitPullRequest, Search, TriangleAlert } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { me, type Person, people } from "../explore-data.ts"
import { Avatar } from "../parts.tsx"
import { DesignRender } from "../start/renders.tsx"
import { claudeTask, designOf, event, type Handoff, handoff, portalProject } from "./data.ts"
import { HandoffPill, Pills, PortalHeader, PortalPage } from "./parts.tsx"

const { sam, lena, claude, priya } = people

/** Code, as code: a component, a token, a branch. */
function Code({ children }: { children: ReactNode }) {
  return <span className="rounded-md border bg-background px-1.5 py-0.5 font-mono text-[11px]">{children}</span>
}

/** A labelled line of a board's details. */
function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-col gap-1">{children}</div>
    </div>
  )
}

/** A component a board uses: where it lives, and whether this design adds it or changes its props. */
interface Part {
  name: string
  file: string
  change?: "New" | "New props"
}

interface Board {
  project: string
  design: string
  /** The version this status is about: the one approved, built, or asking for review. */
  version: number
  by: { who: Person; what: string }
  /** A change made after it was approved, for the developer to look at before building. */
  since?: string
  /** What this version asks the code for, in words. */
  asks: string
  parts: Part[]
  tokens?: { name: string; value: string }[]
  states: string[]
  sizes: string[]
  /** Who's building it, with their branch and pull request where the project uses git. */
  building?: { who: Person; branch?: string; pr?: string }
  /** The issue it's tracked in, where the org has a tracker. */
  issue?: string
}

const boards: Partial<Record<Handoff, Board[]>> = {
  "Changed since approval": [
    {
      project: "website",
      design: "Pricing",
      version: 12,
      by: { who: me, what: "You approved v12 yesterday" },
      since: `Maya Chen made v14 ${event("maya-change").when}, and her question on the annual toggle is still open`,
      asks: "Team keeps its savings badge, and the plan cards line up at every width",
      parts: [
        { name: "PlanCard", file: "src/components/pricing/plan-card.tsx", change: "New props" },
        { name: "BillingToggle", file: "src/components/pricing/billing-toggle.tsx" },
        { name: "PriceTag", file: "src/components/pricing/price-tag.tsx" }
      ],
      states: ["Monthly", "Yearly"],
      sizes: ["Desktop", "Phone"]
    }
  ],
  "Ready to build": [
    {
      project: "spawnkit",
      design: "Level select",
      version: 8,
      by: { who: me, what: "You approved v8, 20 min ago" },
      asks: "Locked levels get their own tile, and stars move under each tile",
      parts: [
        { name: "LevelTile", file: "src/levels/LevelTile.tsx", change: "New props" },
        { name: "StarRating", file: "src/levels/StarRating.tsx", change: "New" },
        { name: "PlayButton", file: "src/ui/PlayButton.tsx" }
      ],
      tokens: [
        { name: "tile-locked", value: "oklch(0.32 0.03 34)" },
        { name: "tile-locked-foreground", value: "oklch(0.62 0.04 34)" }
      ],
      states: ["Open", "Locked", "Cleared"],
      sizes: ["Phone", "Tablet"],
      building: { who: sam, branch: "feat/level-select", pr: "#151, draft" }
    },
    {
      project: "copilot",
      design: "Inbox",
      version: 21,
      by: { who: lena, what: "Lena Fischer approved v21 yesterday" },
      asks: "Unread threads get a dot, and the reply box stays pinned to the bottom",
      parts: [
        { name: "ThreadRow", file: "src/inbox/ThreadRow.tsx", change: "New props" },
        { name: "Composer", file: "src/inbox/Composer.tsx" }
      ],
      tokens: [{ name: "unread", value: "oklch(0.7 0.15 250)" }],
      states: ["Default", "Unread", "Empty"],
      sizes: ["Desktop"],
      issue: "KES-212 in Linear"
    }
  ],
  "Code differs": [
    {
      project: "spawnkit",
      design: "In game",
      version: 5,
      by: { who: sam, what: "Sam Okafor built v5, 2 weeks ago" },
      asks: "The code moved the health bar to the top after v5 was built, in #139",
      parts: [
        { name: "HealthBar", file: "src/hud/HealthBar.tsx" },
        { name: "Hotbar", file: "src/hud/Hotbar.tsx" }
      ],
      states: ["Playing", "Paused"],
      sizes: ["Phone"]
    }
  ],
  "In review": [
    {
      project: "dashboard",
      design: "Billing",
      version: 43,
      by: { who: claude, what: `Claude Code, for Sam Okafor, asks for your review: “${claudeTask}”` },
      asks: "The brand token goes from blue to green, so 4 places here follow it. Overview and Sign in change the same way, in the same review",
      parts: [
        { name: "SidebarLink", file: "src/app/Sidebar.tsx" },
        { name: "Button", file: "src/ui/Button.tsx" },
        { name: "PlanCard", file: "src/billing/PlanCard.tsx" }
      ],
      tokens: [{ name: "brand", value: "oklch(0.62 0.15 158), was oklch(0.6 0.17 250)" }],
      states: ["Default"],
      sizes: ["Desktop", "Phone"],
      building: { who: claude, branch: "claude/green-brand", pr: "#148" }
    },
    {
      project: "docs",
      design: "Docs home",
      version: 3,
      by: { who: priya, what: "Priya Raman asks for your review" },
      asks: "A search field, and a getting started section",
      parts: [
        { name: "SearchField", file: "src/search/SearchField.tsx", change: "New" },
        { name: "GuideCard", file: "src/guides/GuideCard.tsx", change: "New" }
      ],
      states: ["Default", "Searching", "No results"],
      sizes: ["Desktop", "Phone"]
    }
  ]
}

/** What a developer does first with a board, by where it stands. */
function MainAction({ status, board }: { status: Handoff; board: Board }) {
  if (status === "Changed since approval") return <Button size="sm">See what changed</Button>
  if (status === "Code differs") return <Button size="sm">Show the difference</Button>
  if (status === "In review") return <Button size="sm">Review</Button>
  if (!board.building) return <Button size="sm">Pick it up</Button>
  return null
}

function BoardRow({ board, status }: { board: Board; status: Handoff }) {
  const shown = portalProject(board.project)
  const design = designOf(shown, board.design)
  return (
    <div className="grid grid-cols-[224px_minmax(0,1fr)_auto] gap-5 rounded-xl border bg-card p-4">
      <div className="h-fit overflow-hidden rounded-md ring-1 ring-border">
        <DesignRender kind={design.kind} look={shown.look} />
      </div>
      <div className="flex min-w-0 flex-col gap-2.5">
        <span className="flex items-center gap-2">
          <span className="font-medium">{design.name}</span>
          <span className="text-sm text-muted-foreground">in {shown.name}</span>
          <span className="rounded-md bg-muted px-1.5 py-px text-[11px] font-medium tabular-nums">
            v{board.version}
          </span>
          <HandoffPill status={status} />
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Avatar person={board.by.who} size={16} />
          {board.by.what}
        </span>
        {board.since && (
          <span className="flex items-center gap-2 text-xs text-[oklch(0.72_0.16_290)]">
            <TriangleAlert className="size-3.5 shrink-0" />
            {board.since}
          </span>
        )}
        <span className="text-sm">{board.asks}</span>
        <div className="flex flex-col gap-1.5 pt-0.5">
          <Detail label="Components">
            {board.parts.map((part) => (
              <span key={part.name} className="flex items-center gap-2">
                <Code>{part.name}</Code>
                {part.change && (
                  <span className="text-[11px] text-[oklch(0.72_0.16_290)]">{part.change.toLowerCase()}</span>
                )}
                <span className="truncate font-mono text-[11px] text-muted-foreground">{part.file}</span>
              </span>
            ))}
          </Detail>
          {board.tokens && (
            <Detail label="Tokens">
              {board.tokens.map((token) => (
                <span key={token.name} className="flex items-center gap-2">
                  <Code>{token.name}</Code>
                  <span className="truncate font-mono text-[11px] text-muted-foreground">{token.value}</span>
                </span>
              ))}
            </Detail>
          )}
          <Detail label="States">
            <span>
              {board.states.join(", ")}
              <span className="text-muted-foreground">, on {board.sizes.join(" and ").toLowerCase()}</span>
            </span>
          </Detail>
          {board.building && (
            <Detail label="Building">
              <span className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                <Avatar person={board.building.who} size={16} />
                <span className="text-foreground">{board.building.who.name}</span>
                {board.building.branch && (
                  <>
                    <GitBranch className="ml-1 size-3.5" />
                    <Code>{board.building.branch}</Code>
                  </>
                )}
                {board.building.pr && (
                  <>
                    <GitPullRequest className="ml-1 size-3.5" />
                    {board.building.pr}
                  </>
                )}
              </span>
              {!board.building.who.agent && (
                <span className="text-muted-foreground">
                  {board.building.who.name.split(" ")[0]} hears about any change to v{board.version} here and in the
                  inbox.
                </span>
              )}
            </Detail>
          )}
          {board.issue && (
            <Detail label="Tracked in">
              <span>{board.issue}</span>
            </Detail>
          )}
        </div>
      </div>
      <div className="flex w-44 flex-col gap-2">
        <MainAction status={status} board={board} />
        {status === "Changed since approval" && (
          <Button size="sm" variant="outline">
            Build v{board.version}, as approved
          </Button>
        )}
        <Button size="sm" variant="outline" className="gap-1.5">
          <Search /> Inspect
        </Button>
        <Button size="sm" variant="ghost" className="gap-1.5">
          <Bot /> Give to your agent
        </Button>
      </div>
    </div>
  )
}

const order: Handoff[] = ["Ready to build", "Changed since approval", "Code differs", "In review"]

export function HandoffPage() {
  const built = Object.entries(handoff).filter(([, status]) => status === "Built")
  return (
    <PortalPage active="handoff" path="kestrel/handoff">
      <div className="mx-auto flex max-w-5xl flex-col gap-7 px-8 py-7">
        <div className="flex flex-col gap-1.5">
          <PortalHeader title="Handoff" />
          <p className="max-w-2xl text-sm text-muted-foreground">
            Every board by where it stands between design and code. Approving a board approves one version, so anything
            changed after it shows here before you build. Inspect shows sizes, tokens, props and states; Give to your
            agent hands it to the coding agent you connect to Parity.
          </p>
        </div>
        <div className="flex items-center justify-between">
          <Pills options={["Everything", "Yours", "Your teams"]} />
          <span className="text-xs text-muted-foreground">
            <span className="text-foreground">Yours</span> is what you're building and what you approved
          </span>
        </div>
        {order.map((status) => (
          <section key={status} className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <HandoffPill status={status} />
              <span className="text-muted-foreground tabular-nums">{boards[status]?.length ?? 0}</span>
            </h2>
            {boards[status]?.map((board) => (
              <BoardRow key={`${board.project}/${board.design}`} board={board} status={status} />
            ))}
          </section>
        ))}
        <section className="flex items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-sm">
          <HandoffPill status="Built" />
          <span className="text-muted-foreground">
            {built.length} boards are built as approved: {built.map(([key]) => key.split("/")[1]).join(" and ")}.
            Nothing to do.
          </span>
        </section>
      </div>
    </PortalPage>
  )
}
