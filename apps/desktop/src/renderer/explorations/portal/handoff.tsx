/**
 * Handoff, for developers: every board by where it stands between design and code, one row each, with the board you
 * pick open at the side. Statuses come from Parity's own versions, so they work without git: an approval is of one
 * version, and an edit after it shows as Changed since approval wherever the board's status does. Each row says who
 * approved it and who's writing its code, under headers that mean the same thing on every row. What each board
 * delivers comes from the same list as Inspect and What changed (`boards.ts`), so they always agree.
 */
import { Bot, ChevronDown, Ellipsis, GitBranch, Search, TriangleAlert, X } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { me } from "../explore-data.ts"
import { Avatar } from "../parts.tsx"
import type { Look } from "../start/data.ts"
import { DesignRender } from "../start/renders.tsx"
import { type Deliverable, deliverable, deliverables } from "./boards.ts"
import { designOf, type Handoff, handoff, portalProject, workingNow } from "./data.ts"
import { HandoffPill, Pills, PortalHeader, PortalPage, PullRequestLink } from "./parts.tsx"
import { PricingAt } from "./pricing-render.tsx"

/** Boards that can be drawn at an earlier version, so the side shows the version that was approved. */
const versioned: Record<string, (look: Look, version: number) => ReactNode> = {
  "website/Pricing": (look, version) => <PricingAt look={look} version={version} />
}

/** Who's editing a board now: their edits are drafts until they mark a version ready, so the status doesn't move. */
function editing(board: Deliverable) {
  return workingNow.find((where) => where.project === board.project && where.design === board.design && !where.away)
}

const violet = "oklch(0.72 0.16 290)"

/** Code, as code: a component, a token, a branch. */
function Code({ children }: { children: ReactNode }) {
  return <span className="rounded-md border bg-background px-1.5 py-0.5 font-mono text-[11px]">{children}</span>
}

/** You, or someone's first name. */
function who(person: { name: string }): string {
  return person === me ? "you" : person.name.split(" ")[0]!
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
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

const columns = "grid grid-cols-[minmax(0,1fr)_150px_150px_140px] items-center gap-4"

/** A cell of two lines: what it is, then when or where. */
function Cell({ avatar, top, bottom }: { avatar?: { name: string; hue: number }; top: ReactNode; bottom: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-xs">
      {avatar ? <Avatar person={avatar} size={20} /> : <span className="size-5 shrink-0" />}
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{top}</span>
        <span className="truncate text-muted-foreground">{bottom}</span>
      </span>
    </span>
  )
}

/** Who approved the version, or who asked for a review while there's no approval yet. */
function Approval({ board }: { board: Deliverable }) {
  if (board.approved)
    return (
      <Cell avatar={board.approved.who} top={`Approved by ${who(board.approved.who)}`} bottom={board.approved.when} />
    )
  const asked = board.review!
  return (
    <Cell
      avatar={asked.who}
      top={`Asked by ${asked.who.name.split(" ")[0]}`}
      bottom={`${asked.for ? `for ${asked.for.name.split(" ")[0]}, ` : ""}${asked.when}`}
    />
  )
}

/** Who's writing the code: building it, built it, or made it with the design, with the pull request. */
function CodeCell({ board }: { board: Deliverable }) {
  const code = board.code
  if (!code)
    return (
      <Cell top={<span className="text-muted-foreground">Nobody yet</span>} bottom={board.issue ?? "Not tracked"} />
    )
  const top =
    code.doing === "Building"
      ? code.who === me
        ? "You're building it"
        : `${who(code.who)} is building it`
      : code.doing === "Built"
        ? `Built by ${who(code.who)}`
        : "Already in code"
  return <Cell avatar={code.who} top={top} bottom={code.pr ? <PullRequestLink pr={code.pr} /> : code.when} />
}

function BoardRow({ board, status }: { board: Deliverable; status: Handoff }) {
  const shown = portalProject(board.project)
  const design = designOf(shown, board.design)
  const key = `${board.project}/${board.design}`
  const action = mainAction[status]
  const latest = board.since?.at(-1)?.version
  const selected = key === picked
  const now = editing(board)
  return (
    <div
      className={`${columns} rounded-lg px-2 py-2 ${selected ? "bg-muted/60 ring-1 ring-border" : "hover:bg-muted/30"} ${status === "Built" ? "opacity-60" : ""}`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="w-14 shrink-0 overflow-hidden rounded-[3px] ring-1 ring-border">
          <DesignRender kind={design.kind} look={shown.look} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{design.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {shown.name}, v{board.version}
            {latest && <span style={{ color: violet }}>, v{latest} ready</span>}
          </span>
          {now && (
            <span className="truncate text-[11px] text-muted-foreground/80">
              {now.who.agent ? `${now.who.name}, for ${who(now.for!)},` : now.who.name.split(" ")[0]} is working on it
            </span>
          )}
        </span>
      </span>
      <Approval board={board} />
      <CodeCell board={board} />
      <span className="flex items-center justify-end gap-1">
        {action && (
          <Button size="sm" variant={selected ? "default" : "ghost"} className="h-7 text-xs">
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
  const latest = board.since?.at(-1)?.version
  const yours = board.code?.doing === "Building" && board.code.who === me
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
            {versioned[`${board.project}/${board.design}`]?.(shown.look, board.version) ?? (
              <DesignRender kind={design.kind} look={shown.look} />
            )}
          </div>
          {board.approved && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Avatar person={board.approved.who} size={16} />
              {capital(who(board.approved.who))} approved v{board.version}, as it's drawn here, {board.approved.when}
            </span>
          )}
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
                      v{change.version}, {change.when},{" "}
                      {change.ready ? `ready for review by ${change.ready.reviewer.name}` : "a draft"}
                    </span>
                  </span>
                </span>
              ))}
              <span className="flex items-center gap-2 text-xs" style={{ color: violet }}>
                <TriangleAlert className="size-3.5 shrink-0" />
                Jonas's question on the toggle, on phones, is still open
              </span>
              <Button size="sm" variant="outline" className="w-fit">
                See what changed, v{board.version} to v{latest}
              </Button>
            </div>
          </Part>
        )}
        <Part title={`What v${board.version} asks for`}>
          <span className="text-sm">{board.asks}</span>
          <span className="text-xs text-muted-foreground">
            {board.states.join(", ")}, on {board.sizes.join(" and ").toLowerCase()}
          </span>
          <span className="truncate font-mono text-[11px] text-muted-foreground">{board.page}</span>
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
              <span key={token.name} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-xs">
                <span
                  className="mt-px size-3.5 rounded-[3px] ring-1 ring-white/10"
                  style={{ background: token.value }}
                />
                <span className="flex items-center gap-2">
                  <span className="font-mono">{token.name}</span>
                  {token.added && <span style={{ color: violet }}>new</span>}
                </span>
                <span className="col-start-2 font-mono text-[11px] text-muted-foreground">
                  {token.value}, in {token.usedBy.join(", ")}
                </span>
              </span>
            ))}
          </Part>
        )}
        <Part title="Code">
          {board.code ? (
            <span className="flex items-start gap-2 text-xs text-muted-foreground">
              <Avatar person={board.code.who} size={16} />
              <span className="flex flex-col gap-1">
                <span>
                  {yours ? "You've been building" : `${board.code.who.name} has been building`} v{board.version} since{" "}
                  {board.code.when}, on <span className="font-mono text-foreground">{board.code.branch}</span>.
                </span>
                {board.code.pr && <PullRequestLink pr={board.code.pr} />}
                {latest && (
                  <span>
                    Keep building v{board.version} as approved, or wait for v{latest}:{" "}
                    {board.since?.at(-1)?.ready?.reviewer.name} reviews it, and you hear when it's approved. Drafts
                    don't reach you; versions marked ready do.
                  </span>
                )}
              </span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Nobody yet. Whoever picks it up hears when a newer version is marked ready, someone opens a thread on it,
              or the approval is withdrawn, here and in their inbox.
            </span>
          )}
        </Part>
      </div>
      <div className="flex flex-col gap-2 border-t px-5 py-4">
        <Button size="sm">{yours ? `Keep building v${board.version}` : `Build v${board.version}, as approved`}</Button>
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
                Every board by where it stands between design and code, at the version that was approved. Drafts don't
                move a board; a version its designer marks ready does.
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
              <div className={`${columns} border-b px-2 pb-2 text-xs text-muted-foreground`}>
                <span>Board</span>
                <span className="pl-7">Approval</span>
                <span className="pl-7">Code</span>
                <span />
              </div>
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
