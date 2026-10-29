import type { Meta, StoryObj } from "@storybook/react-vite"
import { UserPlus } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { agentPalettes } from "../../agent/agent-colors.ts"
import { AgentBadge } from "../../agent/AgentPointer.tsx"
import { people } from "../explore-data.ts"
import { AvatarStack } from "../parts.tsx"
import { ActivityRow, OrgBadge } from "../start-page-parts.tsx"
import { CanvasArt, ProjectCard } from "../start/page.tsx"
import { ActivityPage } from "./activity.tsx"
import { AddSeatsPage, BillingPage, MembersPage, PlansPage, SecurityPage } from "./admin.tsx"
import { ChangesPage } from "./changes.tsx"
import { claudeTask, event, events, needsYou, portalProject, type PortalEvent, teams, workingNow } from "./data.ts"
import { HandoffPage } from "./handoff.tsx"
import { InboxPage } from "./inbox.tsx"
import { InspectPage } from "./inspect.tsx"
import { LibraryPage } from "./library.tsx"
import { DesignTile, FeedCard, Name, PortalPage, SeeAll, Tabs, TeammateCard, WhereaboutsRow } from "./parts.tsx"
import { RecentsPage } from "./recents.tsx"
import { SearchPage } from "./search.tsx"
import { RequestAccessPage, SharePage } from "./share.tsx"

/**
 * The portal: Parity on the web, for a whole org. It's where people find what they've been tagged in, see what their
 * teammates and agents are doing, and open designs to see what changed. A project opens straight into its canvas.
 * The org is Kestrel, a made-up customer. Every screen draws from the same events (`data.ts`), so they agree.
 */
const meta = {
  title: "Parity/Explorations/Portal",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** Two buttons under a card: the one thing to do, and a way to put it off. */
function Act({ children, later = "Later" }: { children: string; later?: string }) {
  return (
    <div className="flex gap-2">
      <Button size="sm">{children}</Button>
      <Button size="sm" variant="ghost">
        {later}
      </Button>
    </div>
  )
}

/** A reply box that isn't open yet. */
function ReplyField({ placeholder, hint }: { placeholder: string; hint: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
      <span className="flex-1">{placeholder}</span>
      <span className="text-xs">{hint}</span>
    </div>
  )
}

/** The line at the top of a card: who, what they did, and where. */
function Line({ item }: { item: PortalEvent }) {
  return (
    <>
      <Name>{item.who.name}</Name> {item.action} {item.design && <Name>{item.design}</Name>}
      {item.design ? " in " : " "}
      <Name>{item.project}</Name>
    </>
  )
}

/** What each thing waiting on you shows: what it's about, and the one thing to do. */
const needsYouBodies: Record<string, ReactNode> = {
  "maya-mention": (
    <div className="grid grid-cols-[minmax(0,1fr)_168px] gap-4">
      <div className="flex flex-col gap-3">
        <p className="text-sm">@Andrew can we drop the annual toggle here? It fights with the plan cards.</p>
        <div className="mt-auto">
          <ReplyField placeholder="Reply to Maya" hint="Open in Pricing" />
        </div>
      </div>
      <DesignTile project="website" design="Pricing" />
    </div>
  ),
  "cursor-question": (
    <div className="grid grid-cols-[minmax(0,1fr)_168px] gap-4">
      <div className="flex flex-col gap-3">
        <p className="text-sm">Should search results open in a panel, or on their own page?</p>
        <span className="text-xs text-muted-foreground">Cursor is working for you, and stopped to ask.</span>
        <div className="mt-auto">
          <ReplyField placeholder="Answer Cursor" hint="It picks up where it stopped" />
        </div>
      </div>
      <DesignTile project="docs" design="Docs home" />
    </div>
  ),
  "ivy-access": (
    <>
      <p className="text-sm">{event("ivy-access").quote}</p>
      <span className="text-xs text-muted-foreground">
        Ivy is a guest from studio-north.com. Commenting is free, and Priya Raman, who owns Help center, gets this too.
      </span>
      <Act later="Deny">Let her comment</Act>
    </>
  ),
  "noah-seat": (
    <>
      <p className="text-sm">I'm picking up the Help center redesign with Priya.</p>
      <span className="text-xs text-muted-foreground">
        Kestrel has 2 open editor seats, so this costs nothing more.
      </span>
      <Act later="Deny">Approve</Act>
    </>
  ),
  "claude-run": (
    <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,96px)] gap-3">
      <div className="col-span-4">
        <AgentBadge palette={agentPalettes[7]} agent="Claude Code" kind="write" label={claudeTask} />
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <span className="text-xs text-muted-foreground">
          Sam Okafor asked for this. One token changed, so these 3 boards look different.
        </span>
        <div className="mt-auto">
          <Act>See what changed</Act>
        </div>
      </div>
      <DesignTile project="dashboard" design="Billing" changed plain />
      <DesignTile project="dashboard" design="Overview" changed plain />
      <DesignTile project="dashboard" design="Sign in" changed plain />
    </div>
  ),
  "priya-review": (
    <div className="grid grid-cols-[minmax(0,1fr)_168px] gap-4">
      <div className="flex flex-col gap-3">
        <p className="text-sm">{event("priya-review").quote}</p>
        <div className="mt-auto">
          <Act>Review</Act>
        </div>
      </div>
      <DesignTile project="docs" design="Docs home" />
    </div>
  )
}

/** Since you were last here: what happened in your projects that doesn't need you. */
const since = events.filter((item) => !item.needsYou && item.ago < 24 * 60)

/** For you: what needs you first, then what changed in your projects, with your teammates at the side. */
function ForYou() {
  return (
    <PortalPage active="home" path="kestrel">
      <div className="flex min-h-full">
        <main className="min-w-0 flex-1">
          <div className="flex max-w-2xl flex-col gap-6 px-8 py-8">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[26px] leading-tight font-semibold tracking-tight">Good morning, Andrew</h1>
              <p className="text-sm text-muted-foreground">
                {needsYou.length} things need you, and {since.length} things happened in your projects since you were
                last here.
              </p>
            </div>
            <h2 className="text-sm font-semibold">Needs you</h2>
            {needsYou.map((item) => (
              <FeedCard key={item.id} who={item.who} line={<Line item={item} />} when={item.when}>
                {needsYouBodies[item.id]}
              </FeedCard>
            ))}
            <div className="flex items-center justify-between pt-2">
              <h2 className="text-sm font-semibold">Since you were last here</h2>
              <SeeAll>All activity</SeeAll>
            </div>
            <div className="-mx-3 flex flex-col gap-1">
              {since.map((item) => (
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
            {["website", "spawnkit", "dashboard"].map((id) => {
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
 * For you: mentions, reviews, agents and seat requests waiting on you, newest first, each with what it's about and
 * the one thing to do. Then what happened since you were last here, and who on your teams is working where.
 */
export const Home: Story = { render: () => <ForYou /> }

export const Recents: Story = { render: () => <RecentsPage /> }

/** A team: who's working where right now, the team's projects, and its week. */
function TeamPage() {
  const { apps } = teams
  const here = workingNow.filter((where) => apps.projects.includes(where.project))
  const away = { who: people.lena, project: "library", design: "Components", doing: "", away: "yesterday" }
  const week = events.filter((item) => item.team === "apps")
  return (
    <PortalPage active="apps" path="kestrel/teams/apps">
      <div className="flex flex-col gap-8 px-8 py-7">
        <div className="flex items-center gap-4">
          <OrgBadge org={apps.org} size={44} />
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">Apps</h1>
            <span className="text-sm text-muted-foreground">
              {apps.people.length} people on {apps.projects.length} projects, and the agents they run
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <AvatarStack people={apps.people} size={28} max={4} />
            <Button variant="outline" className="gap-1.5">
              <UserPlus /> Invite
            </Button>
          </div>
        </div>
        <Tabs tabs={["Now", "Projects", "Activity", "People"]} active="Now" />
        <section className="flex flex-col gap-4">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[15px] font-semibold">Working now</h2>
            <span className="text-xs text-muted-foreground">
              {here.filter((where) => !where.who.agent).length} people and{" "}
              {here.filter((where) => where.who.agent).length} agent here, 1 away
            </span>
          </div>
          <div className="grid grid-cols-4 gap-5">
            {[...here, away].map((where) => (
              <TeammateCard key={where.who.name} where={where} />
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-4">
          <h2 className="text-[15px] font-semibold">Projects</h2>
          <div className="grid grid-cols-3 gap-5">
            {apps.projects.map((id) => (
              <ProjectCard key={id} project={portalProject(id)} />
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">This week</h2>
            <SeeAll>Activity</SeeAll>
          </div>
          <div className="-mx-3 grid grid-cols-2 gap-x-6">
            {week.map((item) => (
              <ActivityRow key={item.id} item={item} compact />
            ))}
          </div>
        </section>
      </div>
    </PortalPage>
  )
}

/**
 * A team's page opens on Now: each teammate and agent on the canvas they're in, cursor and all, with Join to follow a
 * person there or Watch for an agent. Then all the team's projects and its week.
 */
export const Team: Story = { render: () => <TeamPage /> }

/**
 * The inbox: mentions, reviews, agents and seat requests waiting on you, across every project. The open one shows
 * beside a preview of its board, pins and all, with its thread, and opens on the canvas or in the desktop app.
 */
export const Inbox: Story = { render: () => <InboxPage /> }

/**
 * The org's activity: what every team, person and agent did, newest first, with the designs it touched, merges,
 * published components and new people. The week in numbers, the busiest projects and the teams down the side.
 */
export const Activity: Story = { render: () => <ActivityPage /> }

/**
 * Handoff, for developers: every board by where it stands between design and code, from Parity's own versions, so it
 * works without git. Ready to build first, then boards changed since they were approved, boards whose code has moved,
 * and what's in review. Each names the version, its components and files, tokens, states and sizes, and who's building
 * it, with the branch and pull request where there is one.
 */
export const Handoff: Story = { render: () => <HandoffPage /> }

/**
 * Inspect, from Handoff: a board at its approved version, read-only. Pick anything to see its component and file, its
 * props as code, its states, its tokens and its size, or give the board to your coding agent.
 */
export const Inspect: Story = { render: () => <InspectPage /> }

/**
 * A library: its components as the code renders them, which version each project uses and on which boards, and its
 * releases. Projects behind the latest version can be updated from here, or the update given to an agent.
 */
export const Library: Story = { render: () => <LibraryPage /> }

/**
 * Sharing a project: a request waiting for an answer first, then everyone with access and where it comes from (owning
 * it, a team, being an admin, an invite), its agents, and who else in the org can open it.
 */
export const Share: Story = { render: () => <SharePage /> }

/** Opening a link to a project you can't see: who owns it, the role to ask for and what it costs, and a note. */
export const RequestAccess: Story = { render: () => <RequestAccessPage /> }

/**
 * Search results: designs, components with their files, comments and settings, the match marked, with filters for
 * project, team, when and who. Only what you can open shows.
 */
export const Search: Story = { render: () => <SearchPage /> }

/**
 * What a notification or "See what changed" opens: the project's canvas in the browser, comparing two versions, kept
 * quiet so the changes stand out. The changed boards before and after (or either alone), each change outlined and
 * numbered, the same numbers down the side with the token and components behind them, and Approve at the foot. The
 * labels above the boards pick which versions to compare. Hover a change, on a board or in the list, to bring it
 * forward.
 */
export const WhatChanged: Story = { render: () => <ChangesPage /> }

/**
 * Members and seats: who has an editor seat, who views and comments for free, open seats, seat requests to approve or
 * deny, and invites waiting for an admin. Only editors pay.
 */
export const Members: Story = { render: () => <MembersPage /> }

/** Billing: the Organization plan, open seats, the renewal and its invoice, past invoices and billing details. */
export const Billing: Story = { render: () => <BillingPage /> }

/** Adding seats beyond the open ones: the seats after, the prorated charge, the renewal, and the card it goes on. */
export const AddSeats: Story = { render: () => <AddSeatsPage /> }

/**
 * Plans: Figma's four, at half the price per editor seat, rounded up to the next .95. Each builds on the one before.
 * Only editors pay on every plan; viewers and commenters are free.
 */
export const Plans: Story = { render: () => <PlansPage /> }

/** Security: sign-in, provisioning, who can invite and share, which agents can connect, and the audit log. */
export const Security: Story = { render: () => <SecurityPage /> }
