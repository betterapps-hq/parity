/**
 * The org's activity: what every team, person and agent in Kestrel did, newest first, with the designs it touched.
 * Filters narrow it to your teams or the people you follow.
 */
import { GitMerge, Package, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { agentPalettes } from "../../agent/agent-colors.ts"
import { AgentBadge } from "../../agent/AgentPointer.tsx"
import { people } from "../explore-data.ts"
import { Avatar } from "../parts.tsx"
import { ActivityRow, OrgBadge } from "../start-page-parts.tsx"
import { CanvasArt } from "../start/page.tsx"
import { portalProject, teams } from "./data.ts"
import { DesignTile, FeedCard, Name, Pills, PortalHeader, PortalPage, SeeAll } from "./parts.tsx"

const { maya, jonas, priya, sam, lena, claude } = people
const noah = { name: "Noah Park", hue: 210 }

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
            <FeedCard
              who={maya}
              line={
                <>
                  <Name>Maya Chen</Name> changed Pricing in <Name>Kestrel website</Name>, on desktop and phone
                </>
              }
              when="12 min ago"
            >
              <div className="grid grid-cols-[1fr_0.42fr_1fr] items-end gap-2">
                <DesignTile project="website" design="Pricing" changed />
                <DesignTile project="website" design="Pricing" mobile changed />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline">
                  See what changed
                </Button>
              </div>
            </FeedCard>
            <FeedCard
              who={claude}
              line={
                <>
                  <Name>Claude Code</Name> changed 2 designs in <Name>Cloud console</Name>, asked by{" "}
                  <Name>Andrew Craswell</Name>
                </>
              }
              when="1 h ago"
            >
              <div className="flex items-center gap-2">
                <AgentBadge
                  palette={agentPalettes[7]}
                  agent="Claude Code"
                  kind="write"
                  label="Tighten the plan cards"
                />
                <span className="text-xs text-muted-foreground">Waiting for Andrew's review</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <DesignTile project="dashboard" design="Billing" changed />
                <DesignTile project="dashboard" design="Overview" changed />
              </div>
            </FeedCard>
            <FeedCard
              who={sam}
              line={
                <>
                  <Name>Sam Okafor</Name> merged #142 Billing settings into main of <Name>Cloud console</Name>
                </>
              }
              when="3 h ago"
            >
              <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-sm">
                <GitMerge className="size-4 text-[oklch(0.7_0.16_300)]" />
                <Tag>feat/billing</Tag>
                <span className="text-muted-foreground">into</span>
                <Tag>main</Tag>
                <span className="ml-auto text-xs text-muted-foreground">Billing and Overview now match the code</span>
              </div>
            </FeedCard>
            <div className="-mx-3">
              <ActivityRow
                item={{
                  id: "jonas-reply",
                  kind: "comment",
                  who: jonas,
                  project: "Ember Caves",
                  design: "Level select",
                  action: "replied on",
                  quote: "Pushed the new tiles. The locked state reads much better now.",
                  when: "25 min ago",
                  day: "Today"
                }}
              />
            </div>
            <h2 className="pt-2 text-sm font-semibold">Yesterday</h2>
            <FeedCard
              who={lena}
              line={
                <>
                  <Name>Lena Fischer</Name> published 3 components in <Name>Kestrel UI</Name>
                </>
              }
              when="Yesterday"
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
            </FeedCard>
            <FeedCard
              who={priya}
              line={
                <>
                  <Name>Priya Raman</Name> added <Name>Noah Park</Name> to Kestrel and the <Name>Web</Name> team
                </>
              }
              when="Yesterday"
            >
              <div className="flex items-center gap-3">
                <Avatar person={noah} size={36} />
                <span className="flex flex-col">
                  <span className="text-sm font-medium">Noah Park</span>
                  <span className="text-xs text-muted-foreground">Viewer, asked for an editor seat</span>
                </span>
                <Button size="sm" variant="outline" className="ml-auto gap-1.5">
                  <UserPlus /> Say hello
                </Button>
              </div>
            </FeedCard>
          </div>
        </main>
        <aside className="flex w-80 shrink-0 flex-col gap-7 border-l bg-neutral-50/50 p-5 dark:bg-[#0d0d0f]">
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">This week in Kestrel</h2>
            <div className="grid grid-cols-2 gap-2">
              <Tally value="46" label="Designs changed" />
              <Tally value="18" label="Threads resolved" />
              <Tally value="7" label="Merges" />
              <Tally value="23" label="Agent runs" />
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
            <h2 className="text-sm font-semibold">Teams</h2>
            {(
              [
                [teams.apps.org, "30 changes"],
                [teams.web.org, "17 changes"],
                [teams.system.org, "8 changes"]
              ] as const
            ).map(([org, detail]) => (
              <div key={org.id} className="flex items-center gap-2.5 text-sm">
                <OrgBadge org={org} size={20} />
                <span className="flex-1">{org.name}</span>
                <span className="text-xs text-muted-foreground">{detail}</span>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </PortalPage>
  )
}
