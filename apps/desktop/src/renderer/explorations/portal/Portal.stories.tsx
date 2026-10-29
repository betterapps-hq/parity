import type { Meta, StoryObj } from "@storybook/react-vite"
import { UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { people } from "../explore-data.ts"
import { AvatarStack } from "../parts.tsx"
import { ActivityRow, OrgBadge } from "../start-page-parts.tsx"
import { ProjectCard } from "../start/page.tsx"
import { ActivityPage } from "./activity.tsx"
import { AddSeatsPage, BillingPage, MembersPage, PlansPage, SecurityPage } from "./admin.tsx"
import { ChangesPage, consoleComparison, pricingComparison } from "./changes.tsx"
import { events, portalProject, teams, workingNow } from "./data.ts"
import { ForYouPage } from "./foryou.tsx"
import { HandoffPage } from "./handoff.tsx"
import { InboxPage } from "./inbox.tsx"
import { InspectPage } from "./inspect.tsx"
import { LibraryPage } from "./library.tsx"
import { PortalPage, SeeAll, Tabs, TeammateCard } from "./parts.tsx"
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

/**
 * For you: everything waiting on you, one line each with what to do about it, newest first. Then what happened since
 * you were last here, and who on your teams is working where.
 */
export const Home: Story = { render: () => <ForYouPage /> }

export const Recents: Story = { render: () => <RecentsPage /> }

/** A team: who's working where right now, the team's projects, and its week. */
function TeamPage() {
  const { apps } = teams
  const here = workingNow.filter((where) => apps.projects.includes(where.project))
  const away = { who: people.lena, project: "library", design: "Components", doing: "", away: "yesterday" }
  // The team's week, not yours: what's only for you stays in your inbox.
  const week = events.filter((item) => item.team === "apps" && !item.needsYou && !/\byou\b/.test(item.action))
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
export const WhatChanged: Story = { render: () => <ChangesPage comparison={consoleComparison} /> }

/**
 * What changed on a board you're building, from Handoff or the inbox: Pricing from v12, which you approved and are
 * building in #150, to v14. One element moved, one changed and one was taken out, each outlined where it was and where
 * it is, with each component's props before and after.
 */
export const WhatChangedOnPricing: Story = { render: () => <ChangesPage comparison={pricingComparison} /> }

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
