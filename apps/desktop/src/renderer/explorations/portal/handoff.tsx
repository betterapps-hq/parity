/**
 * Handoff, for developers: every board by where it stands between design and code. Parity draws boards from the
 * project's own components, so a board names exactly what it uses: components, tokens, the branch and pull request.
 */
import { Bot, GitBranch, GitPullRequest, TriangleAlert } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { me, type Person, people } from "../explore-data.ts"
import { Avatar } from "../parts.tsx"
import { DesignRender } from "../start/renders.tsx"
import { designOf, event, type Handoff, handoff, portalProject } from "./data.ts"
import { HandoffPill, PortalHeader, PortalPage } from "./parts.tsx"

/** Code, as code: a component, a token, a branch. */
function Code({ children }: { children: ReactNode }) {
  return <span className="rounded-md border bg-background px-1.5 py-0.5 font-mono text-[11px]">{children}</span>
}

/** A row of labelled code tags. */
function Uses({ label, items }: { label: string; items: string[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <span className="w-20 shrink-0">{label}</span>
      {items.map((item) => (
        <Code key={item}>{item}</Code>
      ))}
    </span>
  )
}

interface Board {
  project: string
  design: string
  /** Who approved it or asked for review, and when. */
  by: { who: Person; what: string }
  /** What differs from the code on main, in words. */
  /** A change made after it was approved, for the developer to look at before building. */
  since?: string
  differs: string
  components: string[]
  tokens?: string[]
  /** Where the work is: a branch, and its pull request when there is one. */
  branch?: { name: string; pr?: string; who: Person }
}

const boards: Record<Handoff, Board[]> = {
  "Ready to build": [
    {
      project: "website",
      design: "Pricing",
      by: { who: me, what: "Approved by you yesterday" },
      since: `Maya Chen changed it ${event("maya-change").when}, after you approved it`,
      differs: "The billing toggle moves above the plan cards, and Team keeps its savings badge",
      components: ["PlanCard", "BillingToggle", "PriceTag"]
    },
    {
      project: "spawnkit",
      design: "Level select",
      by: { who: people.jonas, what: "Approved by Jonas Weber today" },
      differs: "Locked tiles get their own state, and stars move under each tile",
      components: ["LevelTile", "StarRating", "PlayButton"],
      tokens: ["tile-locked", "tile-locked-foreground"],
      branch: { name: "feat/level-select", pr: "#151, draft", who: people.sam }
    }
  ],
  "Differs from main": [
    {
      project: "spawnkit",
      design: "In game",
      by: { who: people.jonas, what: "Last approved 2 weeks ago" },
      differs: "#139 moved the health bar to the top on main, after the design was approved",
      components: ["HealthBar", "Hotbar"]
    }
  ],
  "In review": [
    {
      project: "dashboard",
      design: "Billing",
      by: { who: people.claude, what: "Claude Code, for you, asks for your review" },
      differs: "The brand color goes from blue to green",
      components: ["PlanCard", "UsageMeter"],
      tokens: ["brand"],
      branch: { name: "claude/tighten-plan-cards", pr: "#148", who: people.claude }
    },
    {
      project: "dashboard",
      design: "Overview",
      by: { who: people.claude, what: "Claude Code, for you, asks for your review" },
      differs: "The usage chart follows the same brand token",
      components: ["UsageChart"],
      tokens: ["brand"],
      branch: { name: "claude/tighten-plan-cards", pr: "#148", who: people.claude }
    },
    {
      project: "docs",
      design: "Docs home",
      by: { who: people.priya, what: "Priya Raman asks for your review" },
      differs: "A new search field and a getting started section",
      components: ["SearchField", "GuideCard"]
    }
  ],
  "Matches main": []
}

function BoardRow({ board, status }: { board: Board; status: Handoff }) {
  const shown = portalProject(board.project)
  const design = designOf(shown, board.design)
  return (
    <div className="grid grid-cols-[224px_minmax(0,1fr)_auto] gap-5 rounded-xl border bg-card p-4">
      <div className="overflow-hidden rounded-md ring-1 ring-border">
        <DesignRender kind={design.kind} look={shown.look} />
      </div>
      <div className="flex min-w-0 flex-col gap-2.5">
        <span className="flex items-center gap-2">
          <span className="font-medium">{design.name}</span>
          <span className="text-sm text-muted-foreground">in {shown.name}</span>
          <HandoffPill status={status} />
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Avatar person={board.by.who} size={16} />
          {board.by.what}
        </span>
        {board.since && (
          <span className="flex items-center gap-2 text-xs text-[oklch(0.8_0.15_80)]">
            <TriangleAlert className="size-3.5 shrink-0" />
            {board.since}
          </span>
        )}
        <span className="text-sm">{board.differs}</span>
        <Uses label="Components" items={board.components} />
        {board.tokens && <Uses label="Tokens" items={board.tokens} />}
        {board.branch && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-20 shrink-0">Code</span>
            <GitBranch className="size-3.5" />
            <Code>{board.branch.name}</Code>
            {board.branch.pr && (
              <>
                <GitPullRequest className="size-3.5" />
                {board.branch.pr}
              </>
            )}
            <Avatar person={board.branch.who} size={16} />
            {board.branch.who.agent ? board.branch.who.name : `${board.branch.who.name.split(" ")[0]} is building it`}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Button size="sm">Inspect</Button>
        {board.since && (
          <Button size="sm" variant="outline">
            See what changed
          </Button>
        )}
        {status === "Ready to build" && !board.branch && !board.since && (
          <Button size="sm" variant="outline">
            Pick it up
          </Button>
        )}
        {status === "Differs from main" && (
          <Button size="sm" variant="outline">
            Show the difference
          </Button>
        )}
        <Button size="sm" variant="ghost" className="gap-1.5">
          <Bot /> Give to your agent
        </Button>
      </div>
    </div>
  )
}

const order: Handoff[] = ["Ready to build", "Differs from main", "In review"]

export function HandoffPage() {
  const matching = Object.entries(handoff).filter(([, status]) => status === "Matches main")
  return (
    <PortalPage active="handoff" path="kestrel/handoff">
      <div className="mx-auto flex max-w-5xl flex-col gap-7 px-8 py-7">
        <div className="flex flex-col gap-1.5">
          <PortalHeader title="Handoff" />
          <p className="max-w-2xl text-sm text-muted-foreground">
            Every board by where it stands between design and code. Boards are drawn from your own components, so each
            one names what it uses. Inspect shows sizes, tokens and props; Give to your agent hands it to the coding
            agent you connect to Parity.
          </p>
        </div>
        {order.map((status) => (
          <section key={status} className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <HandoffPill status={status} />
              <span className="text-muted-foreground tabular-nums">{boards[status].length}</span>
            </h2>
            {boards[status].map((board) => (
              <BoardRow key={`${board.project}/${board.design}`} board={board} status={status} />
            ))}
          </section>
        ))}
        <section className="flex items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-sm">
          <HandoffPill status="Matches main" />
          <span className="text-muted-foreground">
            {matching.length} boards match main: {matching.map(([key]) => key.split("/")[1]).join(", ")}. Nothing to
            build.
          </span>
        </section>
      </div>
    </PortalPage>
  )
}
