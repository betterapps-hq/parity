/**
 * A project opened from the portal on what changed: its canvas in the browser, with the changed boards before and
 * after, numbered where they changed, and who changed what down the side. A notification or "See what changed" opens
 * this; closing the comparison leaves you on the canvas as usual.
 */
import { Check, ChevronRight, Clock, GitBranch, GitMerge, Monitor, X } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { agentPalettes } from "../../agent/agent-colors.ts"
import { AgentBadge } from "../../agent/AgentPointer.tsx"
import { ThreadRow } from "../collaboration/comments.tsx"
import { CalloutNumber } from "../collaboration/notes.tsx"
import { PersonCursor } from "../collaboration/presence.tsx"
import { me, type Person, people } from "../explore-data.ts"
import { Avatar, AvatarStack, ParityMark } from "../parts.tsx"
import type { Look, RenderKind } from "../start/data.ts"
import { DesignRender } from "../start/renders.tsx"
import { designOf, portalProject } from "./data.ts"
import { PortalWindow } from "./parts.tsx"

const { maya, sam, claude } = people
const violet = "oklch(0.7 0.16 275)"

/** A board on the canvas: its name above, then the design, ringed when it changed. */
function Board({
  name,
  note,
  kind,
  look,
  changed,
  faded,
  children
}: {
  name: string
  note?: string
  kind: RenderKind
  look: Look
  changed?: boolean
  faded?: boolean
  /** Marks drawn over the design, placed by share of its size. */
  children?: ReactNode
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-2 ${faded ? "opacity-40" : ""}`}>
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

/** One change in the side list: its number, where it is, and what happened. */
function Change({ n, where, what }: { n: number; where: string; what: string }) {
  return (
    <div className="flex gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50">
      <CalloutNumber n={n} />
      <span className="flex min-w-0 flex-col">
        <span className="text-[13px] font-medium">{where}</span>
        <span className="text-xs text-muted-foreground">{what}</span>
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

export function ChangesPage() {
  const project = portalProject("dashboard")
  const billing = designOf(project, "Billing")
  const overview = designOf(project, "Overview")
  const signIn = designOf(project, "Sign in")
  // Before the change the plan cards were in the old blue.
  const before: Look = { ...project.look, hue: 250 }
  return (
    <PortalWindow path="kestrel/cloud-console?since=last-visit">
      <div className="flex h-full flex-col">
        <header className="flex h-11 shrink-0 items-center gap-2.5 border-b bg-background px-3 text-sm">
          <ParityMark size={22} />
          <span className="text-muted-foreground">Kestrel</span>
          <ChevronRight className="size-3.5 text-muted-foreground" />
          <span className="font-medium">{project.name}</span>
          <span className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px]">
            <GitBranch className="size-3" />
            {project.source.branch}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <AvatarStack people={[claude, sam, me]} size={24} max={3} />
            <Button size="sm" variant="outline" className="gap-1.5">
              <Monitor /> Open in the desktop app
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
                  What changed since <span className="font-medium text-white">Tuesday, 6:40 PM</span>
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
            <div className="relative flex flex-col gap-10 px-12 pt-8">
              <div className="grid grid-cols-2 gap-10">
                <Board name="Billing" note="Tuesday" kind={billing.kind} look={before} />
                <Board name="Billing" note="Now" kind={billing.kind} look={project.look} changed>
                  <Changed n={1} left="23%" top="58%" width="75%" height="35%" />
                  <Changed n={2} left="70%" top="6%" width="28%" height="9%" />
                  <div className="absolute" style={{ left: "52%", top: "74%" }}>
                    <PersonCursor person={sam} />
                  </div>
                </Board>
              </div>
              <div className="grid grid-cols-[1fr_1fr_1fr] gap-10">
                <Board name="Overview" note="Now" kind={overview.kind} look={project.look} changed>
                  <Changed n={3} left="22%" top="36%" width="76%" height="30%" />
                </Board>
                <Board name="Sign in" note="No changes" kind={signIn.kind} look={project.look} faded />
              </div>
            </div>
          </div>
          <aside className="flex w-80 shrink-0 flex-col border-l bg-background">
            <div className="flex flex-col gap-1 border-b p-4">
              <h2 className="text-sm font-semibold">What changed</h2>
              <span className="text-xs text-muted-foreground">
                Since you were last here, Tuesday at 6:40 PM: 3 changes on 2 boards
              </span>
            </div>
            <div className="flex flex-col gap-6 overflow-y-auto p-4">
              <By who={claude} when="1 h ago">
                <AgentBadge
                  palette={agentPalettes[7]}
                  agent="Claude Code"
                  kind="write"
                  label="Tighten the plan cards"
                />
                <div className="-mx-2 flex flex-col">
                  <Change n={1} where="Billing, Plan cards" what="Brand green instead of blue, tighter padding" />
                  <Change n={2} where="Billing, Header actions" what="Manage plan moved beside Invoices" />
                  <Change n={3} where="Overview, Usage chart" what="The same green, so the two pages match" />
                </div>
                <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
                  <span className="text-xs text-muted-foreground">You asked for this. Is it right?</span>
                  <div className="flex gap-2">
                    <Button size="sm" className="gap-1.5">
                      <Check /> Approve
                    </Button>
                    <Button size="sm" variant="outline">
                      Ask for changes
                    </Button>
                  </div>
                </div>
              </By>
              <By who={sam} when="3 h ago">
                <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs">
                  <GitMerge className="size-3.5 text-[oklch(0.7_0.16_300)]" />
                  <span>Merged #142 Billing settings into main. Billing matches the code again.</span>
                </div>
              </By>
              <By who={maya} when="40 min ago">
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
                          when: "40 min ago",
                          text: "Love the green. Can the Team card keep its Most popular badge?"
                        }
                      ]
                    }}
                  />
                </div>
              </By>
            </div>
          </aside>
        </div>
        <footer className="flex h-11 shrink-0 items-center gap-3 border-t bg-background px-4 text-xs text-muted-foreground">
          <Clock className="size-3.5" />
          <span>Tuesday, 6:40 PM</span>
          <div className="relative h-1.5 flex-1 rounded-full bg-muted">
            <div
              className="absolute inset-y-0 right-0 left-[34%] rounded-full"
              style={{ background: violet, opacity: 0.45 }}
            />
            {[
              { at: "52%", who: sam },
              { at: "78%", who: claude },
              { at: "86%", who: maya }
            ].map((mark) => (
              <span
                key={mark.at}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ left: mark.at }}
              >
                <Avatar person={mark.who} size={16} className="ring-2 ring-background" />
              </span>
            ))}
          </div>
          <span>Now</span>
        </footer>
      </div>
    </PortalWindow>
  )
}
