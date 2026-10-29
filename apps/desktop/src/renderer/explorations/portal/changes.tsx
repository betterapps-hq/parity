/**
 * A project opened from the portal on what changed: its canvas in the browser, comparing two versions. The changed
 * boards before and after, numbered where they changed, and each change as code down the side: the token, the
 * components that follow it, the branch and pull request. A notification or "See what changed" opens this; the link
 * names both versions, so it can go in a pull request.
 */
import { Check, ChevronDown, ChevronRight, Clock, GitBranch, GitPullRequest, Link2, Monitor, X } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { agentPalettes } from "../../agent/agent-colors.ts"
import { AgentBadge } from "../../agent/AgentPointer.tsx"
import { ThreadRow } from "../collaboration/comments.tsx"
import { CalloutNumber } from "../collaboration/notes.tsx"
import { me, type Person, people } from "../explore-data.ts"
import { Avatar, AvatarStack, ParityMark } from "../parts.tsx"
import type { Look, RenderKind } from "../start/data.ts"
import { DesignRender } from "../start/renders.tsx"
import { designOf, event, portalProject } from "./data.ts"
import { HandoffPill, PortalWindow } from "./parts.tsx"

const { maya, sam, claude } = people
const violet = "oklch(0.7 0.16 275)"

/** A board on the canvas: its name and version above, then the design, ringed when it changed. */
function Board({
  name,
  note,
  kind,
  look,
  changed,
  children
}: {
  name: string
  note?: string
  kind: RenderKind
  look: Look
  changed?: boolean
  /** Marks drawn over the design, placed by share of its size. */
  children?: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="flex items-center gap-2 text-[11px] font-medium text-white/60">
        {name}
        {note && <span className="text-white/35">{note}</span>}
        {changed && (
          <span
            className="rounded-full px-1.5 py-px text-[10px] font-semibold text-white"
            style={{ background: violet }}
          >
            Changed
          </span>
        )}
      </span>
      <div
        className={`relative rounded-[5px] shadow-[0_16px_40px_-10px_rgb(0_0_0/0.7)] ${changed ? "ring-2" : "ring-1 ring-white/10"}`}
        style={changed ? { ["--tw-ring-color" as string]: violet } : undefined}
      >
        <div className="overflow-hidden rounded-[5px]">
          <DesignRender kind={kind} look={look} />
        </div>
        {children}
      </div>
    </div>
  )
}

/** Where a change is on a board: dashed round the area, with its number at the corner. */
function Changed({
  n,
  left,
  top,
  width,
  height
}: {
  n: number
  left: string
  top: string
  width: string
  height: string
}) {
  return (
    <div
      className="absolute rounded-md border-2 border-dashed"
      style={{ left, top, width, height, borderColor: violet }}
    >
      <span className="absolute -top-2.5 -left-2.5">
        <CalloutNumber n={n} />
      </span>
    </div>
  )
}

/** Code, as code. */
function Code({ children }: { children: ReactNode }) {
  return <span className="rounded border bg-background px-1 py-px font-mono text-[11px]">{children}</span>
}

/** One change in the side list: its number, where it is, what happened, and the code it lives in. */
function Change({ n, where, what, code }: { n: number; where: string; what: string; code: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50">
      <CalloutNumber n={n} />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-[13px] font-medium">{where}</span>
        <span className="text-xs text-muted-foreground">{what}</span>
        <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">{code}</span>
      </span>
    </div>
  )
}

/** Who made a group of changes, and when. */
function By({ who, when, children }: { who: Person; when: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-sm">
        <Avatar person={who} size={22} />
        <span className="flex-1 font-medium">{who.name}</span>
        <span className="text-xs text-muted-foreground">{when}</span>
      </div>
      {children}
    </section>
  )
}

/** The versions on the history bar: who made each, and what it was. */
const versions = [
  { at: "34%", name: "v40", who: me, label: "You were here" },
  { at: "52%", name: "v41", who: sam, label: "#142 merged" },
  { at: "76%", name: "v42", who: claude, label: "Brand token" },
  { at: "90%", name: "v43", who: maya, label: "Comment" }
]

export function ChangesPage() {
  const project = portalProject("dashboard")
  const billing = designOf(project, "Billing")
  const overview = designOf(project, "Overview")
  // At v40 the brand token was still blue.
  const before: Look = { ...project.look, hue: 250 }
  return (
    <PortalWindow path="kestrel/cloud-console/compare/v40...v43">
      <div className="flex h-full flex-col">
        <header className="flex h-11 shrink-0 items-center gap-2.5 border-b bg-background px-3 text-sm whitespace-nowrap">
          <ParityMark size={22} />
          <span className="text-muted-foreground">Kestrel</span>
          <ChevronRight className="size-3.5 text-muted-foreground" />
          <span className="font-medium">{project.name}</span>
          <span className="flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px]">
            <GitBranch className="size-3" />
            claude/tighten-plan-cards
            <span className="font-sans text-muted-foreground">compared with main</span>
            <ChevronDown className="size-3 text-muted-foreground" />
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <GitPullRequest className="size-3.5" /> #148, open
          </span>
          <div className="ml-auto flex items-center gap-2">
            <AvatarStack people={[sam, me]} size={24} max={3} />
            <Button size="sm" variant="ghost" className="gap-1.5">
              <Link2 /> Copy link
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5">
              <Monitor /> Desktop app
            </Button>
            <Button size="sm">Share</Button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1 overflow-hidden bg-[#0f0f12]">
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: `radial-gradient(60% 50% at 30% 15%, oklch(0.55 0.14 ${project.look.hue} / 0.14), transparent 70%)`
              }}
            />
            <div className="relative flex justify-center pt-4">
              <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/60 py-1 pr-1.5 pl-4 text-xs text-white/80 shadow-lg backdrop-blur">
                <span>
                  <span className="font-medium text-white">v40</span>, when you were last here, against{" "}
                  <span className="font-medium text-white">v43</span>, now
                </span>
                <span className="flex rounded-full bg-white/10 p-0.5">
                  {["Before", "After", "Side by side"].map((option) => (
                    <span
                      key={option}
                      className={`rounded-full px-2.5 py-0.5 ${option === "Side by side" ? "bg-white text-black" : "text-white/70"}`}
                    >
                      {option}
                    </span>
                  ))}
                </span>
                <X className="size-3.5 text-white/60" />
              </div>
            </div>
            <div className="relative grid grid-cols-2 gap-x-10 gap-y-7 px-12 pt-6">
              <Board name="Billing" note="v40" kind={billing.kind} look={before} />
              <Board name="Billing" note="v43" kind={billing.kind} look={project.look} changed>
                <Changed n={1} left="1%" top="20%" width="20%" height="10%" />
                <Changed n={2} left="23%" top="31%" width="75%" height="24%" />
              </Board>
              <Board name="Overview" note="v40" kind={overview.kind} look={before} />
              <Board name="Overview" note="v43" kind={overview.kind} look={project.look} changed>
                <Changed n={3} left="22%" top="36%" width="76%" height="30%" />
              </Board>
            </div>
          </div>
          <aside className="flex w-[22rem] shrink-0 flex-col border-l bg-background">
            <div className="flex flex-col gap-1 border-b p-4">
              <h2 className="text-sm font-semibold">What changed</h2>
              <span className="text-xs text-muted-foreground">
                1 token, so 3 places on 2 boards, newest first. Sign in doesn't use it and is unchanged.
              </span>
            </div>
            <div className="flex flex-col gap-6 overflow-y-auto p-4">
              <section className="flex flex-col gap-2.5">
                <h3 className="text-xs font-medium text-muted-foreground">Comments since v40</h3>
                <div className="-mx-2.5">
                  <ThreadRow
                    thread={{
                      id: "team-badge",
                      design: "Billing",
                      layer: "Plan cards",
                      unread: true,
                      comments: [
                        {
                          id: "team-badge-1",
                          author: maya,
                          when: event("maya-comment").when,
                          text: event("maya-comment").quote!
                        }
                      ]
                    }}
                  />
                </div>
              </section>
              <By who={claude} when={event("claude-run").when}>
                <AgentBadge
                  palette={agentPalettes[7]}
                  agent="Claude Code"
                  kind="write"
                  label="Tighten the plan cards"
                />
                <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-3 font-mono text-[11px]">
                  <span className="text-muted-foreground">src/styles/tokens.css</span>
                  <span className="text-[oklch(0.7_0.19_25)]">- --brand: oklch(0.6 0.17 250);</span>
                  <span className="text-[oklch(0.75_0.17_162)]">+ --brand: oklch(0.62 0.15 158);</span>
                </div>
                <div className="-mx-2 flex flex-col">
                  <Change
                    n={1}
                    where="Billing, Navigation"
                    what="The open page follows the brand color"
                    code={
                      <>
                        <Code>SidebarLink</Code> in src/app/Sidebar.tsx
                      </>
                    }
                  />
                  <Change
                    n={2}
                    where="Billing, Plan and usage"
                    what="The plan badge and usage meters follow it"
                    code={
                      <>
                        <Code>PlanCard</Code> <Code>UsageMeter</Code> in src/billing
                      </>
                    }
                  />
                  <Change
                    n={3}
                    where="Overview, Usage chart"
                    what="The chart's line and fill follow it"
                    code={
                      <>
                        <Code>UsageChart</Code> in src/overview/UsageChart.tsx
                      </>
                    }
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  No component changed: every difference comes from the token, with no overrides.
                </span>
                <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <HandoffPill status="In review" />
                    You asked for this
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" className="gap-1.5">
                      <Check /> Approve
                    </Button>
                    <Button size="sm" variant="outline">
                      Ask for changes
                    </Button>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Approving marks both boards Ready to build and approves #148 on GitHub.
                  </span>
                </div>
              </By>
              <By who={sam} when={event("sam-merge").when}>
                <span className="text-xs text-muted-foreground">
                  Merged #142 Billing settings into main, before Claude Code's change. Billing matched main then.
                </span>
              </By>
            </div>
          </aside>
        </div>
        <footer className="flex h-14 shrink-0 items-center gap-3 border-t bg-background px-4 text-xs text-muted-foreground">
          <Clock className="size-3.5" />
          <span>Yesterday</span>
          <div className="relative mb-3 h-1.5 flex-1 rounded-full bg-muted">
            <div
              className="absolute inset-y-0 right-0 left-[34%] rounded-full"
              style={{ background: violet, opacity: 0.45 }}
            />
            {versions.map((version) => (
              <span
                key={version.name}
                className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: version.at }}
              >
                <Avatar person={version.who} size={16} className="ring-2 ring-background" />
                <span className="absolute top-5 text-[10px] whitespace-nowrap">
                  {version.name}, {version.label}
                </span>
              </span>
            ))}
          </div>
          <span>Now</span>
        </footer>
      </div>
    </PortalWindow>
  )
}
