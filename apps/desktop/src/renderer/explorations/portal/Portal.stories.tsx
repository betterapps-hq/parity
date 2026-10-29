import type { Meta, StoryObj } from "@storybook/react-vite"
import { FolderOpen, LayoutGrid, List, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { agentPalettes } from "../../agent/agent-colors.ts"
import { AgentBadge } from "../../agent/AgentPointer.tsx"
import { type Activity as ActivityItem, people } from "../explore-data.ts"
import { AvatarStack } from "../parts.tsx"
import { ActivityRow, OrgBadge } from "../start-page-parts.tsx"
import { CanvasArt, ProjectCard } from "../start/page.tsx"
import { ActivityPage } from "./activity.tsx"
import { AddSeatsPage, BillingPage, MembersPage } from "./admin.tsx"
import { ChangesPage } from "./changes.tsx"
import { orgProjects, portalProject, teams, type Whereabouts, workingNow } from "./data.ts"
import { InboxPage } from "./inbox.tsx"
import {
  DesignTile,
  FeedCard,
  Name,
  Pills,
  PortalHeader,
  PortalPage,
  SeeAll,
  TeammateCard,
  WhereaboutsRow
} from "./parts.tsx"

/**
 * The portal: Parity on the web, for a whole org. It's where people find what they've been tagged in, see what their
 * teammates and agents are doing, and open designs to see what changed. A project opens straight into its canvas.
 * The org is Kestrel, a made-up customer.
 */
const meta = {
  title: "Parity/Explorations/Portal",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const { maya, jonas, priya, sam, lena, claude } = people

/** What happened in Kestrel lately, as activity rows. */
const lately: ActivityItem[] = [
  {
    id: "jonas-reply",
    kind: "comment",
    who: jonas,
    project: "Ember Caves",
    design: "Level select",
    action: "replied on",
    quote: "Pushed the new tiles. The locked state reads much better now.",
    when: "25 min ago",
    day: "Today",
    unread: true
  },
  {
    id: "sam-merge",
    kind: "merge",
    who: sam,
    project: "Cloud console",
    action: "merged #142 Billing settings into main of",
    when: "3 h ago",
    day: "Today"
  },
  {
    id: "lena-publish",
    kind: "publish",
    who: lena,
    project: "Kestrel UI",
    action: "published Button, Toggle and Menu in",
    when: "Yesterday",
    day: "Yesterday"
  }
]

/** For you: what needs you first, then what changed in your projects, with your teammates at the side. */
function ForYou() {
  return (
    <PortalPage active="home" path="kestrel">
      <div className="flex min-h-full">
        <main className="min-w-0 flex-1">
          <div className="mx-auto flex max-w-2xl flex-col gap-6 px-8 py-8">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[26px] leading-tight font-semibold tracking-tight">Good morning, Andrew</h1>
              <p className="text-sm text-muted-foreground">
                Maya mentioned you, Claude Code wants your review, and 9 designs changed since you were last here.
              </p>
            </div>
            <h2 className="text-sm font-semibold">Needs you</h2>
            <FeedCard
              who={maya}
              line={
                <>
                  <Name>Maya Chen</Name> mentioned you on <Name>Pricing</Name> in <Name>Kestrel website</Name>
                </>
              }
              when="8 min ago"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_168px] gap-4">
                <div className="flex flex-col gap-3">
                  <p className="text-sm">@Andrew can we drop the annual toggle? It fights with the plan cards.</p>
                  <div className="mt-auto flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
                    <span className="flex-1">Reply to Maya</span>
                    <span className="text-xs">Open in Pricing</span>
                  </div>
                </div>
                <DesignTile project="website" design="Pricing" />
              </div>
            </FeedCard>
            <FeedCard
              who={claude}
              line={
                <>
                  <Name>Claude Code</Name> changed 2 designs in <Name>Cloud console</Name> and asked for your review
                </>
              }
              when="1 h ago"
            >
              <div>
                <AgentBadge
                  palette={agentPalettes[7]}
                  agent="Claude Code"
                  kind="write"
                  label="Tighten the plan cards"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <DesignTile project="dashboard" design="Billing" changed />
                <DesignTile project="dashboard" design="Overview" changed />
                <DesignTile project="dashboard" design="Sign in" />
              </div>
              <div className="flex gap-2">
                <Button size="sm">See what changed</Button>
                <Button size="sm" variant="ghost">
                  Later
                </Button>
              </div>
            </FeedCard>
            <FeedCard
              who={priya}
              line={
                <>
                  <Name>Priya Raman</Name> asked you to review <Name>Docs home</Name> in <Name>Help center</Name>
                </>
              }
              when="2 h ago"
            >
              <div className="flex gap-2">
                <Button size="sm">Review</Button>
                <Button size="sm" variant="ghost">
                  Later
                </Button>
              </div>
            </FeedCard>
            <div className="flex items-center justify-between pt-2">
              <h2 className="text-sm font-semibold">Since you were last here</h2>
              <SeeAll>All activity</SeeAll>
            </div>
            <div className="-mx-3 flex flex-col gap-1">
              {lately.map((item) => (
                <ActivityRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        </main>
        <aside className="flex w-80 shrink-0 flex-col gap-7 border-l bg-neutral-50/50 p-5 dark:bg-[#0d0d0f]">
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Working now</h2>
              <SeeAll>Your teams</SeeAll>
            </div>
            <div className="-mx-2 flex flex-col">
              {workingNow.map((where) => (
                <WhereaboutsRow key={where.who.name} where={where} />
              ))}
            </div>
          </section>
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Jump back in</h2>
              <SeeAll>Recents</SeeAll>
            </div>
            {["website", "dashboard", "spawnkit"].map((id) => {
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
                    <span className="truncate text-xs text-muted-foreground">Edited {shown.edited}</span>
                  </span>
                </div>
              )
            })}
          </section>
        </aside>
      </div>
    </PortalPage>
  )
}

/**
 * For you: mentions, reviews and agents waiting on you, each with the design it's about, then what changed since you
 * were last here. Down the side, who on your teams is working where, with Join.
 */
export const Home: Story = { render: () => <ForYou /> }

/** Recents, as Figma's file browser: every project you've been in, as its canvas. Opening one opens its canvas. */
function Library() {
  return (
    <PortalPage active="recents" path="kestrel/recents">
      <div className="flex flex-col gap-6 px-8 py-7">
        <PortalHeader title="Recents">
          <Pills options={["All", "Yours", "Shared with you", "Agents working"]} />
          <div className="ml-auto flex items-center gap-2">
            <div className="flex rounded-lg border p-0.5">
              <span className="grid size-7 place-items-center rounded-md bg-muted">
                <LayoutGrid className="size-4" />
              </span>
              <span className="grid size-7 place-items-center rounded-md text-muted-foreground">
                <List className="size-4" />
              </span>
            </div>
            <Button variant="outline" className="gap-1.5">
              <FolderOpen /> Import
            </Button>
          </div>
        </PortalHeader>
        <div className="grid grid-cols-4 gap-x-5 gap-y-8">
          {orgProjects.map((shown) => (
            <ProjectCard key={shown.id} project={shown} />
          ))}
        </div>
      </div>
    </PortalPage>
  )
}

export const Recents: Story = { render: () => <Library /> }

/** Your team's people and agents, each on the canvas they're in now. */
const appsNow: Whereabouts[] = [
  workingNow[2]!,
  workingNow[1]!,
  workingNow[3]!,
  { who: lena, project: "library", design: "Components", doing: "", away: "yesterday" }
]

/** A team: who's working where right now, the team's projects, and its week. */
function TeamPage() {
  const { apps } = teams
  return (
    <PortalPage active="apps" path="kestrel/teams/apps">
      <div className="flex flex-col gap-8 px-8 py-7">
        <div className="flex items-center gap-4">
          <OrgBadge org={apps.org} size={44} />
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">Apps</h1>
            <span className="text-sm text-muted-foreground">
              {apps.people.length} people and Claude Code, on {apps.projects.length} projects
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <AvatarStack people={apps.people} size={28} max={4} />
            <Button variant="outline" className="gap-1.5">
              <UserPlus /> Invite
            </Button>
          </div>
        </div>
        <Pills options={["Now", "Projects", "Activity", "People"]} />
        <section className="flex flex-col gap-4">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[15px] font-semibold">Working now</h2>
            <span className="text-xs text-muted-foreground">3 here, 1 away</span>
          </div>
          <div className="grid grid-cols-4 gap-5">
            {appsNow.map((where) => (
              <TeammateCard key={where.who.name} where={where} />
            ))}
          </div>
        </section>
        <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-8">
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">Projects</h2>
              <SeeAll>All 3</SeeAll>
            </div>
            <div className="grid grid-cols-2 gap-5">
              {apps.projects.slice(0, 2).map((id) => (
                <ProjectCard key={id} project={portalProject(id)} />
              ))}
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">This week</h2>
              <SeeAll>Activity</SeeAll>
            </div>
            <div className="-mx-3 flex flex-col">
              {lately.slice(0, 2).map((item) => (
                <ActivityRow key={item.id} item={item} compact />
              ))}
              <ActivityRow
                compact
                item={{
                  id: "claude-run",
                  kind: "agent",
                  who: claude,
                  project: "Cloud console",
                  design: "Billing",
                  action: "changed 2 designs in",
                  when: "1 h ago",
                  day: "Today"
                }}
              />
            </div>
          </section>
        </div>
      </div>
    </PortalPage>
  )
}

/**
 * A team's page opens on Now: each teammate and agent on the canvas they're in, cursor and all, with Join to follow
 * them there. Then the team's projects and its week.
 */
export const Team: Story = { render: () => <TeamPage /> }

/**
 * The inbox: mentions, reviews, replies and agents waiting on you, across every project. The open one shows beside a
 * preview of its board, pins and all, with its thread, and opens on the canvas or in the desktop app.
 */
export const Inbox: Story = { render: () => <InboxPage /> }

/**
 * The org's activity: what every team, person and agent did, with the designs it touched, merges, published
 * components and new people. The week in numbers, the busiest projects and the teams down the side.
 */
export const Activity: Story = { render: () => <ActivityPage /> }

/**
 * What a notification or "See what changed" opens: the project's canvas in the browser, the changed boards before and
 * after, numbered where they changed, who changed what down the side, and the history along the bottom.
 */
export const WhatChanged: Story = { render: () => <ChangesPage /> }

/**
 * Members and seats: who has an editor seat, who views for free, who asked for a seat, and pending invites. The open
 * questions about seats sit on the page as a sticky note.
 */
export const Members: Story = { render: () => <MembersPage /> }

/** Billing: the plan, seats used, the next invoice, past invoices, the card and who can change it. */
export const Billing: Story = { render: () => <BillingPage /> }

/** Adding seats: how many, what it costs today for the rest of the month, and from the next invoice on. */
export const AddSeats: Story = { render: () => <AddSeatsPage /> }
