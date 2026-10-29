/**
 * The org's activity: what every team, person and agent in Kestrel did, newest first, with the designs it touched.
 * Filters narrow it to your teams or the people you follow. Things only for you (mentions, review requests, seat
 * requests) stay in your inbox.
 */
import { Download, GitMerge, Package, UserPlus } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { agentPalettes } from "../../agent/agent-colors.ts"
import { AgentBadge } from "../../agent/AgentPointer.tsx"
import { Avatar } from "../parts.tsx"
import { ActivityRow, OrgBadge } from "../start-page-parts.tsx"
import { CanvasArt } from "../start/page.tsx"
import { claudeTask, event, noah, portalProject, type PortalEvent, readyToBuild, teams } from "./data.ts"
import { DesignTile, FeedCard, Name, Pills, PortalHeader, PortalPage, SeeAll } from "./parts.tsx"

/** A count for the week, big, with what it counts under it. */
function Tally({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border bg-background/60 p-3">
      <span className="text-xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

/** A label in a card: a component, a branch, a team. */
function Tag({ children }: { children: string }) {
  return <span className="rounded-md border bg-background px-1.5 py-0.5 font-mono text-[11px]">{children}</span>
}

/** An event as a card, with what it touched under its line. */
function Card({ item, line, children }: { item: PortalEvent; line?: ReactNode; children?: ReactNode }) {
  return (
    <FeedCard
      who={item.who}
      when={item.when}
      line={
        line ?? (
          <>
            <Name>{item.who.name}</Name> {item.action} {item.design && <Name>{item.design}</Name>}
            {item.design ? " in " : " "}
            <Name>{item.project}</Name>
          </>
        )
      }
    >
      {children}
    </FeedCard>
  )
}

/** An event as a plain row, for replies and other small things. */
function Row({ id }: { id: string }) {
  return (
    <div className="-mx-3">
      <ActivityRow item={{ ...event(id), unread: false }} compact />
    </div>
  )
}

export function ActivityPage() {
  return (
    <PortalPage active="activity" path="kestrel/activity">
      <div className="flex min-h-full">
        <main className="min-w-0 flex-1">
          <div className="mx-auto flex max-w-2xl flex-col gap-6 px-8 py-7">
            <PortalHeader title="Activity" />
            <div className="flex items-center justify-between">
              <Pills options={["Everyone", "Your teams", "People you follow"]} />
              <Pills options={["All", "Designs", "Code", "People"]} />
            </div>
            <h2 className="text-sm font-semibold">Today</h2>
            <Card
              item={event("maya-change")}
              line={
                <>
                  <Name>Maya Chen</Name> changed <Name>Pricing</Name> in <Name>Kestrel website</Name>, on desktop and
                  phone
                </>
              }
            >
              <div className="grid grid-cols-[1fr_0.42fr_1fr] items-end gap-2">
                <DesignTile project="website" design="Pricing" changed />
                <DesignTile project="website" design="Pricing" mobile changed />
              </div>
              <div>
                <Button size="sm" variant="outline">
                  See what changed
                </Button>
              </div>
            </Card>
            <Row id="jonas-reply" />
            <Row id="maya-comment" />
            <Card
              item={event("claude-run")}
              line={
                <>
                  <Name>Claude Code</Name> changed 3 designs in <Name>Cloud console</Name>, for <Name>Sam Okafor</Name>
                </>
              }
            >
              <div>
                <AgentBadge palette={agentPalettes[7]} agent="Claude Code" kind="write" label={claudeTask} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <DesignTile project="dashboard" design="Billing" changed />
                <DesignTile project="dashboard" design="Overview" changed />
                <DesignTile project="dashboard" design="Sign in" changed />
              </div>
            </Card>
            <Card item={event("sam-merge")}>
              <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-sm">
                <GitMerge className="size-4 text-[oklch(0.7_0.16_300)]" />
                <Tag>feat/billing</Tag>
                <span className="text-muted-foreground">into</span>
                <Tag>main</Tag>
                <span className="ml-auto text-xs text-muted-foreground">Billing was built as designed</span>
              </div>
            </Card>
            <h2 className="pt-2 text-sm font-semibold">Yesterday</h2>
            <Card
              item={event("lena-publish")}
              line={
                <>
                  <Name>Lena Fischer</Name> published 3 components in <Name>Kestrel UI</Name>
                </>
              }
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Package className="size-4 text-muted-foreground" />
                <Tag>Button</Tag>
                <Tag>Toggle</Tag>
                <Tag>Menu</Tag>
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2.5 text-sm">
                <span>
                  Used in 5 projects. <span className="text-muted-foreground">2 still use the old Toggle.</span>
                </span>
                <SeeAll>See where</SeeAll>
              </div>
            </Card>
            <Card
              item={event("priya-adds-noah")}
              line={
                <>
                  <Name>Priya Raman</Name> added <Name>Noah Park</Name> to Kestrel and the <Name>Web</Name> team
                </>
              }
            >
              <div className="flex items-center gap-3">
                <Avatar person={noah} size={36} />
                <span className="flex flex-col">
                  <span className="text-sm font-medium">Noah Park</span>
                  <span className="text-xs text-muted-foreground">Viewer for now, and asked for an editor seat</span>
                </span>
                <Button size="sm" variant="outline" className="ml-auto gap-1.5">
                  <UserPlus /> Say hello
                </Button>
              </div>
            </Card>
            <Row id="lena-resolve" />
          </div>
        </main>
        <aside className="flex w-80 shrink-0 flex-col gap-7 border-l bg-neutral-50/50 p-5 dark:bg-[#0d0d0f]">
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">This week in Kestrel</h2>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Download className="size-3" /> Export
              </span>
            </div>
            <span className="-mt-2 text-xs text-muted-foreground">October 26 to November 1, up to today</span>
            <div className="grid grid-cols-2 gap-2">
              <Tally value="54" label="Changes to designs" />
              <Tally value="18" label="Threads resolved" />
              <Tally value="7" label="Boards built" />
              <Tally value={`${readyToBuild}`} label="Ready to build" />
            </div>
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">Busiest projects</h2>
            {(
              [
                ["dashboard", "21 changes, 4 people"],
                ["website", "14 changes, 3 people"],
                ["spawnkit", "9 changes, 2 people"]
              ] as const
            ).map(([id, detail]) => {
              const shown = portalProject(id)
              return (
                <div key={id} className="flex items-center gap-3">
                  <CanvasArt
                    project={shown}
                    design={shown.designs[0]!}
                    live={false}
                    className="w-20 shrink-0 rounded-md"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{shown.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{detail}</span>
                  </span>
                </div>
              )
            })}
          </section>
          <section className="flex flex-col gap-2.5">
            <h2 className="text-sm font-semibold">Changes to designs, by team</h2>
            {(
              [
                [teams.apps.org, 32],
                [teams.web.org, 17],
                [teams.system.org, 5]
              ] as const
            ).map(([org, count]) => (
              <div key={org.id} className="flex items-center gap-2.5 text-sm">
                <OrgBadge org={org} size={20} />
                <span className="flex-1">{org.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </PortalPage>
  )
}
