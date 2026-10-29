/**
 * Handoff, for developers: every board by where it stands between design and code, one row each, with the board you
 * pick open at the side. Statuses come from Parity's own versions, so they work without git: an approval is of one
 * version, and an edit after it shows as Changed since approval wherever the board's status does. What each board
 * delivers comes from the same list as Inspect and What changed (`boards.ts`), so they always agree.
 */
import { Bot, ChevronDown, Ellipsis, GitBranch, GitPullRequest, Search, TriangleAlert, X } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Avatar } from "../parts.tsx"
import { DesignRender } from "../start/renders.tsx"
import { type Deliverable, deliverable, deliverables } from "./boards.ts"
import { designOf, type Handoff, handoff, portalProject } from "./data.ts"
import { HandoffPill, Pills, PortalHeader, PortalPage } from "./parts.tsx"

const violet = "oklch(0.72 0.16 290)"

/** Code, as code: a component, a token, a branch. */
function Code({ children }: { children: ReactNode }) {
  return <span className="rounded-md border bg-background px-1.5 py-0.5 font-mono text-[11px]">{children}</span>
}

/** A pull request, as a link to it. */
function PullRequest({ pr }: { pr: { number: number; state: string } }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap">
      <GitPullRequest className="size-3.5 text-muted-foreground" />
      <span className="text-foreground underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground">
        #{pr.number}
      </span>
      {pr.state}
    </span>
  )
}

/** What a developer does first with a board, by where it stands. */
const mainAction: Partial<Record<Handoff, string>> = {
  "Ready to build": "Pick it up",
  Building: "Inspect",
  "Changed since approval": "See what changed",
  "Code differs": "Show the difference",
  "In review": "Review"
}

const order: Handoff[] = ["Ready to build", "Building", "Changed since approval", "Code differs", "In review", "Built"]

/** The board open at the side. */
const picked = "website/Pricing"

function BoardRow({ board, status }: { board: Deliverable; status: Handoff }) {
  const shown = portalProject(board.project)
  const design = designOf(shown, board.design)
  const key = `${board.project}/${board.design}`
  const action = mainAction[status]
  const latest = board.since?.at(-1)?.version
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_150px_150px_auto] items-center gap-4 rounded-lg px-2 py-2 ${key === picked ? "bg-muted/60 ring-1 ring-border" : "hover:bg-muted/30"} ${status === "Built" ? "opacity-60" : ""}`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="w-14 shrink-0 overflow-hidden rounded-[3px] ring-1 ring-border">
          <DesignRender kind={design.kind} look={shown.look} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{design.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {shown.name}, v{board.version}
            {latest && <span style={{ color: violet }}>, now v{latest}</span>}
          </span>
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <Avatar person={board.by.who} size={18} />
        <span className="truncate">{board.by.short}</span>
      </span>
      <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        {board.building ? (
          <>
            <Avatar person={board.building.who} size={18} />
            {board.building.pr ? <PullRequest pr={board.building.pr} /> : board.building.who.name}
          </>
        ) : status === "Built" ? (
          "Built"
        ) : (
          "Nobody yet"
        )}
      </span>
      <span className="flex items-center justify-end gap-1">
        {action && (
          <Button size="sm" variant={status === "Building" ? "outline" : "default"} className="h-7 text-xs">
            {action}
          </Button>
        )}
        <Button size="icon-sm" variant="ghost" aria-label={`More for ${design.name}`}>
          <Ellipsis />
        </Button>
      </span>
    </div>
  )
}

/** A labelled part of the side panel. */
function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b px-5 py-4 last:border-0">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

/** The picked board in full: what changed since it was approved, what it asks for, and what it's made of. */
function Detail({ board }: { board: Deliverable }) {
  const shown = portalProject(board.project)
  const design = designOf(shown, board.design)
  const status = handoff[`${board.project}/${board.design}`]!
  const changed = board.parts.filter((part) => part.change)
  const also = board.parts.filter((part) => !part.change)
  return (
    <aside className="flex w-[24rem] shrink-0 flex-col border-l bg-background">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex flex-col gap-3 px-5 pt-5 pb-4">
          <div className="flex items-start gap-2">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">{design.name}</span>
              <span className="text-xs text-muted-foreground">in {shown.name}</span>
            </span>
            <HandoffPill status={status} />
            <Button size="icon-xs" variant="ghost" aria-label="Close">
              <X />
            </Button>
          </div>
          <div className="overflow-hidden rounded-md ring-1 ring-border">
            <DesignRender kind={design.kind} look={shown.look} />
          </div>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Avatar person={board.by.who} size={16} />
            {board.by.what}
          </span>
        </div>
        {board.since && (
          <Part title={`Changed since v${board.version}`}>
            <div
              className="flex flex-col gap-2.5 rounded-lg p-3"
              style={{ background: `color-mix(in oklch, ${violet} 10%, transparent)` }}
            >
              {board.since.map((change) => (
                <span key={change.version} className="flex items-start gap-2 text-xs">
                  <Avatar person={change.who} size={16} />
                  <span className="flex flex-col gap-0.5">
                    <span>{change.what}</span>
                    <span className="text-muted-foreground">
                      v{change.version}, {change.when}
                    </span>
                  </span>
                </span>
              ))}
              <span className="flex items-center gap-2 text-xs" style={{ color: violet }}>
                <TriangleAlert className="size-3.5 shrink-0" />
                Maya's question on the annual toggle is still open
              </span>
              <Button size="sm" variant="outline" className="w-fit">
                See what changed, v{board.version} to v{board.since.at(-1)!.version}
              </Button>
            </div>
          </Part>
        )}
        <Part title={`What v${board.version} asks for`}>
          <span className="text-sm">{board.asks}</span>
          <span className="text-xs text-muted-foreground">
            {board.states.join(", ")}, on {board.sizes.join(" and ").toLowerCase()}
          </span>
        </Part>
        <Part title="Components">
          {[...changed, ...also].map((part) => (
            <span key={part.name} className="flex flex-col gap-1 text-xs">
              <span className="flex items-center gap-2">
                <Code>{part.name}</Code>
                {part.change && <span style={{ color: violet }}>{part.change.toLowerCase()}</span>}
              </span>
              <span className="truncate font-mono text-[11px] text-muted-foreground">{part.file}</span>
            </span>
          ))}
        </Part>
        {board.tokens.length > 0 && (
          <Part title="Tokens">
            {board.tokens.map((token) => (
              <span key={token.name} className="flex items-center gap-2 text-xs">
                <span
                  className="size-3.5 shrink-0 rounded-[3px] ring-1 ring-white/10"
                  style={{ background: token.value }}
                />
                <span className="font-mono">{token.name}</span>
                {token.added && <span style={{ color: violet }}>new</span>}
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">{token.value}</span>
              </span>
            ))}
          </Part>
        )}
        <Part title="Who's building it">
          <span className="text-xs text-muted-foreground">
            Nobody yet. Whoever picks it up hears when someone makes a newer version, opens a thread on it, or withdraws
            the approval, here and in their inbox.
          </span>
        </Part>
      </div>
      <div className="flex flex-col gap-2 border-t px-5 py-4">
        <Button size="sm">Build v{board.version}, as approved</Button>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1 gap-1.5">
            <Search /> Inspect v{board.version}
          </Button>
          <Button size="sm" variant="ghost" className="flex-1 gap-1.5">
            <Bot /> Give to your agent
          </Button>
        </div>
      </div>
    </aside>
  )
}

export function HandoffPage() {
  const rows = Object.values(deliverables)
  const statusOf = (board: Deliverable) => handoff[`${board.project}/${board.design}`]!
  return (
    <PortalPage active="handoff" path="kestrel/handoff/kestrel-website/pricing">
      <div className="flex h-full">
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-5 px-8 py-7">
            <div className="flex flex-col gap-1">
              <PortalHeader title="Handoff" />
              <span className="text-sm text-muted-foreground">
                Every board by where it stands between design and code, at the version that was approved.
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Pills options={["Everything", "Yours", "Your teams"]} />
              <span className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                All projects <ChevronDown className="size-3 text-muted-foreground" />
              </span>
              <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                <GitBranch className="size-3.5" /> Branches and pull requests show where a project has them
              </span>
            </div>
            <div className="flex flex-col gap-4">
              {order.map((status) => {
                const group = rows.filter((board) => statusOf(board) === status)
                if (!group.length) return null
                return (
                  <section key={status} className="flex flex-col gap-1">
                    <h2 className="flex items-center gap-2 px-2 pb-1 text-sm font-semibold">
                      <HandoffPill status={status} />
                      <span className="text-muted-foreground tabular-nums">{group.length}</span>
                    </h2>
                    {group.map((board) => (
                      <BoardRow key={`${board.project}/${board.design}`} board={board} status={status} />
                    ))}
                  </section>
                )
              })}
            </div>
          </div>
        </main>
        <Detail board={deliverable("website", "Pricing")} />
      </div>
    </PortalPage>
  )
}
