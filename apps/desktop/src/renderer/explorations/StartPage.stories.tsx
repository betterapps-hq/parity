import type { Meta, StoryObj } from "@storybook/react-vite"
import {
  ArrowUp,
  Check,
  Clock,
  FolderOpen,
  House,
  LayoutGrid,
  Link2,
  List,
  Paperclip,
  Plus,
  Settings,
  Star,
  Terminal,
  Users
} from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { agentPalettes } from "../agent/agent-colors.ts"
import { AgentBadge, AgentPointer } from "../agent/AgentPointer.tsx"
import {
  activity,
  me,
  organization,
  organizations,
  people,
  type Project,
  projects,
  repositories,
  templates
} from "./explore-data.ts"
import { accent, Avatar, AzureDevOpsMark, ExploreWindow, GitHubMark, type MockTab, ProjectThumb } from "./parts.tsx"
import {
  ActivityRow,
  ActivityText,
  CommandBar,
  OrgBadge,
  OrgSwitcher,
  ProjectCard,
  SectionHeader,
  TemplateCard,
  TitleBarActions
} from "./start-page-parts.tsx"

/**
 * What a new tab shows, and the window when the app opens with no project: proposals for a start page with recent and
 * team projects, new projects from the Scaffolder's templates, repositories from GitHub and Azure DevOps, and what's
 * happened in your projects. A pinned Home tab at the start of the tab bar opens it any time.
 */
const meta = {
  title: "Parity/Explorations/Start page",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const homeTabs: MockTab[] = [
  { id: "home", title: "Home", home: true },
  { id: "website", title: "Buildkit website" }
]

const buildkit = organization("buildkit")

function HomeWindow({
  children,
  tabs = homeTabs,
  active = "home",
  unread
}: {
  children: ReactNode
  tabs?: MockTab[]
  active?: string
  unread?: number
}) {
  return (
    <ExploreWindow tabs={tabs} active={active} actions={<TitleBarActions unread={unread} />}>
      {children}
    </ExploreWindow>
  )
}

/** Ways to bring a project in, other than a template. */
function ImportButtons() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" className="gap-2">
        <GitHubMark /> From GitHub
      </Button>
      <Button variant="outline" className="gap-2">
        <AzureDevOpsMark /> From Azure DevOps
      </Button>
      <Button variant="outline" className="gap-2">
        <FolderOpen /> Open a folder
      </Button>
      <Button variant="outline" className="gap-2">
        <Link2 /> Clone a URL
      </Button>
    </div>
  )
}

/** Coding agents connected to Parity through its MCP server, and the ones that could be. */
function AgentsCard() {
  const agents = [
    { name: "Claude Code", connected: true },
    { name: "Cursor", connected: true },
    { name: "Codex", connected: false }
  ]
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <Terminal className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Your agents</span>
      </div>
      <div className="flex flex-col gap-2">
        {agents.map((agent) => (
          <div key={agent.name} className="flex items-center gap-2 text-sm">
            <Avatar person={{ name: agent.name, hue: agent.name === "Cursor" ? 30 : 270, agent: true }} size={20} />
            <span className="flex-1">{agent.name}</span>
            {agent.connected ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Check className="size-3 text-[oklch(0.75_0.17_162)]" /> Connected
              </span>
            ) : (
              <Button size="xs" variant="outline">
                Set up
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Recent work first, new work second, what's happening on the right. */
function Launchpad({ tabs, active }: { tabs?: MockTab[]; active?: string }) {
  return (
    <HomeWindow tabs={tabs} active={active}>
      <div className="flex h-full">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-5xl flex-col gap-10 px-10 py-10">
            <div className="flex flex-col gap-5">
              <div className="flex items-end justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <h1 className="text-3xl font-semibold tracking-tight">Good evening, Andrew</h1>
                  <p className="text-sm text-muted-foreground">
                    3 things need you, and Claude Code is working in Better Apps dashboard.
                  </p>
                </div>
                <OrgSwitcher org={buildkit} className="w-44" />
              </div>
              <CommandBar />
            </div>
            <section className="flex flex-col gap-4">
              <SectionHeader title="Jump back in" action="All projects" />
              <div className="grid grid-cols-3 gap-x-5 gap-y-7">
                {projects.slice(0, 6).map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            </section>
            <section className="flex flex-col gap-4">
              <SectionHeader title="Start something new" action="All templates" />
              <div className="grid grid-cols-4 gap-5">
                {templates.slice(0, 4).map((template) => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
              <ImportButtons />
            </section>
          </div>
        </div>
        <aside className="flex w-80 shrink-0 flex-col border-l bg-neutral-50/50 dark:bg-[#0d0d0f]">
          <div className="flex items-center gap-1 border-b px-3 py-2 text-sm">
            <span className="rounded-md bg-muted px-2.5 py-1 font-medium">
              For you <span className="ml-1 text-xs text-muted-foreground">3</span>
            </span>
            <span className="rounded-md px-2.5 py-1 text-muted-foreground">Activity</span>
            <span className="ml-auto text-xs text-muted-foreground">Mark all read</span>
          </div>
          <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
            {activity.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </div>
          <div className="border-t p-3">
            <AgentsCard />
          </div>
        </aside>
      </div>
    </HomeWindow>
  )
}

/**
 * Launchpad: a greeting with what needs you, one search field for everything, recent projects with live thumbnails,
 * templates and imports, and a rail with mentions, activity and connected agents.
 */
export const LaunchpadHome: Story = { render: () => <Launchpad /> }

/**
 * The same page in a new tab, without a pinned Home tab: the alternative where the start page only appears in empty
 * tabs and when nothing is open.
 */
export const LaunchpadInNewTab: Story = {
  render: () => (
    <Launchpad
      tabs={[
        { id: "website", title: "Buildkit website" },
        { id: "dashboard", title: "Better Apps dashboard" },
        { id: "new", title: "New tab" }
      ]}
      active="new"
    />
  )
}

function NavItem({ icon, label, active, count }: { icon: ReactNode; label: string; active?: boolean; count?: number }) {
  return (
    <span
      className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm ${
        active
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      }`}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{count}</span>}
    </span>
  )
}

function NavHeading({ children }: { children: ReactNode }) {
  return <span className="px-2.5 pt-4 pb-1 text-xs font-medium text-muted-foreground">{children}</span>
}

/** A file browser, like Figma's: places down the side, the projects in the place picked. */
function Library() {
  return (
    <HomeWindow>
      <div className="flex h-full">
        <nav className="flex w-60 shrink-0 flex-col gap-0.5 border-r bg-neutral-50/50 p-3 dark:bg-[#0d0d0f]">
          <OrgSwitcher org={buildkit} className="mb-2 w-full" />
          <NavItem icon={<House className="size-4" />} label="Home" />
          <NavItem icon={<Clock className="size-4" />} label="Recents" active />
          <NavItem icon={<Star className="size-4" />} label="Starred" count={2} />
          <NavItem icon={<Users className="size-4" />} label="Shared with you" count={4} />
          <NavHeading>Teams</NavHeading>
          <NavItem icon={<OrgBadge org={{ ...buildkit, name: "Apps", hue: 162 }} size={16} />} label="Apps" />
          <NavItem icon={<OrgBadge org={{ ...buildkit, name: "Marketing", hue: 250 }} size={16} />} label="Marketing" />
          <NavItem
            icon={<OrgBadge org={{ ...buildkit, name: "Design system", hue: 280 }} size={16} />}
            label="Design system"
          />
          <NavHeading>Sources</NavHeading>
          <NavItem icon={<GitHubMark />} label="buildkitgg" count={repositories.github.length} />
          <NavItem icon={<AzureDevOpsMark />} label="buildkit" count={repositories.azure.length} />
          <NavItem icon={<Plus className="size-4" />} label="Add a source" />
          <NavHeading>Start</NavHeading>
          <NavItem icon={<LayoutGrid className="size-4" />} label="Templates" count={templates.length} />
          <div className="mt-auto flex flex-col gap-0.5">
            <NavItem icon={<Users className="size-4" />} label="Invite teammates" />
            <NavItem icon={<Settings className="size-4" />} label="Settings" />
          </div>
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-6 px-8 py-7">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold tracking-tight">Recents</h1>
              <div className="flex items-center gap-1 text-sm">
                {["All", "Yours", "Shared", "With agents working"].map((filter, index) => (
                  <span
                    key={filter}
                    className={`rounded-full px-3 py-1 ${index === 0 ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {filter}
                  </span>
                ))}
              </div>
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
                  <FolderOpen /> Open
                </Button>
                <Button className="gap-1.5">
                  <Plus /> New project
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-x-5 gap-y-8">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} showOrg />
              ))}
            </div>
          </div>
        </div>
      </div>
    </HomeWindow>
  )
}

/** Library: a sidebar of places (recents, teams, connected sources, templates) and a grid of projects, as Figma does it. */
export const LibraryWithSidebar: Story = { render: () => <Library /> }

/** A project in the side list of the activity page: small thumbnail, name, and whether anyone's in it now. */
function ProjectRow({ project }: { project: Project }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/50">
      <ProjectThumb
        project={{ ...project, agents: undefined }}
        className="w-16 shrink-0 rounded-md ring-1 ring-border"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{project.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {project.agents ? `${project.agents[0]!.name} is working` : project.edited}
        </span>
      </div>
      {project.agents && <span className="size-2 animate-pulse rounded-full bg-[oklch(0.75_0.17_162)]" />}
    </div>
  )
}

/** A day's activity as rich cards: the quote with a reply, an agent's changes with the designs, a review to do. */
function TimelineCard({ id }: { id: string }) {
  const item = activity.find((candidate) => candidate.id === id)!
  const dashboard = projects.find((project) => project.id === "dashboard")!
  return (
    <div className="flex gap-3">
      <Avatar person={item.who} size={32} />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 rounded-xl border bg-card p-4">
        <div className="flex items-baseline gap-2 text-sm text-muted-foreground">
          <span className="min-w-0 flex-1">
            <ActivityText item={item} />
          </span>
          <span className="shrink-0 text-xs">{item.when}</span>
        </div>
        {item.kind === "mention" && (
          <>
            <p className="text-sm">{item.quote}</p>
            <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
              <span className="flex-1">Reply to Maya</span>
              <span className="text-xs">Open in Pricing</span>
            </div>
          </>
        )}
        {item.kind === "agent" && (
          <>
            <div className="flex items-center gap-2 text-sm">
              <AgentBadge palette={agentPalettes[7]} agent="Claude Code" kind="write" label={item.quote} />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {["Pricing", "Plan card", "Checkout", "Billing"].map((design, index) => (
                <div key={design} className="flex flex-col gap-1">
                  <ProjectThumb
                    project={{ ...dashboard, agents: undefined, hue: dashboard.hue + index * 8 }}
                    className="rounded-md ring-1 ring-border"
                  />
                  <span className="text-[11px] text-muted-foreground">{design}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {item.kind === "review" && (
          <div className="flex gap-2">
            <Button size="sm">Review</Button>
            <Button size="sm" variant="ghost">
              Later
            </Button>
          </div>
        )}
        {item.kind === "comment" && <p className="text-sm">{item.quote}</p>}
      </div>
    </div>
  )
}

/** Activity first: what changed and who's waiting on you, across every project, with projects at the side. */
function Pulse() {
  const waiting = [
    { label: "Review Docs home", detail: `${people.priya.name}, Parity docs` },
    { label: "Reply to Maya on Pricing", detail: "Better Apps dashboard" },
    { label: "Join AI support copilot", detail: `Invited by ${people.sam.name}` }
  ]
  return (
    <HomeWindow>
      <div className="flex h-full">
        <aside className="flex w-72 shrink-0 flex-col gap-1 overflow-y-auto border-r p-3">
          <OrgSwitcher org={buildkit} className="mb-2 w-full" />
          <span className="px-2 pt-1 pb-1 text-xs font-medium text-muted-foreground">Projects</span>
          {projects.slice(0, 7).map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
          <Button variant="ghost" className="mt-1 justify-start gap-2 text-muted-foreground">
            <Plus /> New project
          </Button>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-2xl flex-col gap-6 px-8 py-8">
            <CommandBar placeholder="Search everything, or jump to a project" />
            <h2 className="text-sm font-semibold">Today</h2>
            <TimelineCard id="a1" />
            <TimelineCard id="a3" />
            <TimelineCard id="a2" />
            <TimelineCard id="a4" />
            <h2 className="text-sm font-semibold">Yesterday</h2>
            <div className="flex flex-col gap-1">
              {activity
                .filter((item) => item.day !== "Today")
                .map((item) => (
                  <ActivityRow key={item.id} item={item} compact />
                ))}
            </div>
          </div>
        </main>
        <aside className="flex w-72 shrink-0 flex-col gap-6 border-l bg-neutral-50/50 p-5 dark:bg-[#0d0d0f]">
          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold">Waiting on you</span>
            {waiting.map((item, index) => (
              <div key={item.label} className="flex items-start gap-3">
                <span className="mt-0.5 grid size-5 place-items-center rounded-full border text-[10px] text-muted-foreground">
                  {index + 1}
                </span>
                <div className="flex flex-col">
                  <span className="text-sm">{item.label}</span>
                  <span className="text-xs text-muted-foreground">{item.detail}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold">Working now</span>
            {[people.maya, people.jonas, people.claude].map((person) => (
              <div key={person.name} className="flex items-center gap-2.5 text-sm">
                <span className="relative">
                  <Avatar person={person} size={24} />
                  <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-[oklch(0.75_0.17_162)] ring-2 ring-background" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span>{person.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {person === people.claude
                      ? "Better Apps dashboard"
                      : person === people.maya
                        ? "Buildkit website"
                        : "SpawnKit"}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <AgentsCard />
        </aside>
      </div>
    </HomeWindow>
  )
}

/**
 * Pulse: activity first. A timeline across every project, with quotes to reply to, an agent's changed designs and
 * reviews to do; projects down the side; what's waiting on you and who's working now on the right.
 */
export const PulseActivityFirst: Story = { render: () => <Pulse /> }

/** Making something new first: describe it, or pick a template, or bring a repository. */
function Create({ firstRun }: { firstRun?: boolean }) {
  return (
    <HomeWindow
      tabs={firstRun ? [{ id: "home", title: "Home", home: true }] : homeTabs}
      unread={firstRun ? 0 : undefined}
    >
      <div
        className="h-full overflow-y-auto"
        style={{
          backgroundImage: `radial-gradient(50% 40% at 50% 0%, color-mix(in oklch, ${accent(275, 0.6, 0.2)} 16%, transparent), transparent 70%)`
        }}
      >
        <div className="mx-auto flex max-w-4xl flex-col gap-12 px-10 py-14">
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="flex flex-col gap-2">
              <h1 className="text-4xl font-semibold tracking-tight">
                {firstRun ? "Let's build your first app" : "What are you building?"}
              </h1>
              <p className="text-muted-foreground">
                Describe it, and Parity sets up the app with the Scaffolder and drafts its first screens with your
                agent.
              </p>
            </div>
            <div className="w-full rounded-2xl border bg-card p-3 text-left shadow-lg">
              <p className="min-h-16 px-2 pt-1 text-base text-muted-foreground">
                A booking app for a dog-walking business, with a schedule for walkers and payments for owners
              </p>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
                  <LayoutGrid className="size-3" /> Marketplace
                </span>
                <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
                  <OrgBadge org={buildkit} size={14} /> Buildkit
                </span>
                <span className="grid size-7 place-items-center rounded-full text-muted-foreground">
                  <Paperclip className="size-4" />
                </span>
                <Button size="icon" className="ml-auto rounded-full" aria-label="Create">
                  <ArrowUp />
                </Button>
              </div>
            </div>
            {!firstRun && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Recent</span>
                {projects.slice(0, 4).map((project) => (
                  <span
                    key={project.id}
                    className="rounded-full border px-2.5 py-1 hover:bg-muted hover:text-foreground"
                  >
                    {project.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <section className="flex flex-col gap-4">
            <SectionHeader title="Or start from a template" action="Compare templates" />
            <div className="grid grid-cols-4 gap-x-5 gap-y-7">
              {templates.map((template) => (
                <TemplateCard key={template.id} template={template} stack />
              ))}
            </div>
          </section>
          <section className="flex flex-col gap-4">
            <SectionHeader title="Or bring a project" />
            <div className="grid grid-cols-3 gap-4">
              <SourceCard
                mark={<GitHubMark size={20} />}
                name="GitHub"
                detail={firstRun ? "Open any repository you can push to" : "buildkitgg, 4 repositories"}
                connected={!firstRun}
              />
              <SourceCard
                mark={<AzureDevOpsMark size={20} />}
                name="Azure DevOps"
                detail={firstRun ? "Open repositories from your organization" : "buildkit, 2 repositories"}
                connected={!firstRun}
              />
              <SourceCard
                mark={<FolderOpen className="size-5" />}
                name="This computer"
                detail="Open a folder with a React app"
              />
            </div>
          </section>
        </div>
      </div>
    </HomeWindow>
  )
}

function SourceCard({
  mark,
  name,
  detail,
  connected
}: {
  mark: ReactNode
  name: string
  detail: string
  connected?: boolean
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="grid size-10 place-items-center rounded-lg bg-muted">{mark}</span>
        {connected === false ? (
          <Button size="sm" variant="outline">
            Connect
          </Button>
        ) : (
          <Button size="sm" variant="ghost">
            Browse
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{name}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </div>
    </div>
  )
}

/** Create: a prompt for a new app front and center, every template with its stack, and sources to bring a project from. */
export const CreateFirst: Story = { render: () => <Create /> }

/** The same page the first time: nothing recent, nothing connected yet. */
export const FirstRun: Story = { render: () => <Create firstRun /> }

/** Where a project sits on the canvas of projects, by team. */
const spots: Record<string, { left: string; top: string; width: string }> = {
  website: { left: "6%", top: "16%", width: "21%" },
  docs: { left: "29%", top: "22%", width: "16%" },
  dashboard: { left: "54%", top: "12%", width: "26%" },
  copilot: { left: "82%", top: "20%", width: "14%" },
  library: { left: "8%", top: "62%", width: "20%" },
  spawnkit: { left: "54%", top: "60%", width: "18%" },
  example: { left: "76%", top: "62%", width: "14%" }
}

/** Projects as boards on a canvas, grouped by team, with whoever is working in them right now. */
function Spatial() {
  const groups = [
    { name: "Marketing", style: { left: "3%", top: "8%", width: "45%", height: "44%" }, hue: 250 },
    { name: "Apps", style: { left: "51%", top: "5%", width: "47%", height: "47%" }, hue: 162 },
    { name: "Design system", style: { left: "3%", top: "55%", width: "45%", height: "40%" }, hue: 280 },
    { name: "Games and experiments", style: { left: "51%", top: "55%", width: "47%", height: "40%" }, hue: 30 }
  ]
  return (
    <HomeWindow>
      <div className="relative h-full overflow-hidden bg-[#0c0c0f]">
        {groups.map((group) => (
          <div
            key={group.name}
            className="absolute rounded-3xl border"
            style={{
              ...group.style,
              borderColor: `color-mix(in oklch, ${accent(group.hue)} 25%, transparent)`,
              background: `color-mix(in oklch, ${accent(group.hue, 0.5, 0.12)} 6%, transparent)`
            }}
          >
            <span
              className="absolute -top-3 left-5 rounded-full bg-[#0c0c0f] px-2 text-xs font-medium"
              style={{ color: accent(group.hue, 0.8, 0.12) }}
            >
              {group.name}
            </span>
          </div>
        ))}
        {projects
          .filter((project) => spots[project.id])
          .map((project) => (
            <div key={project.id} className="absolute flex flex-col gap-1.5" style={spots[project.id]}>
              <span className="flex items-center gap-1.5 text-xs text-white/70">
                {project.name}
                {project.agents && <span className="size-1.5 animate-pulse rounded-full bg-[oklch(0.75_0.17_162)]" />}
              </span>
              <ProjectThumb project={project} className="ring-1 ring-white/10" />
            </div>
          ))}
        <div className="absolute" style={{ left: "16%", top: "34%" }}>
          <AgentPointer palette={agentPalettes[0]} />
          <div
            className="mt-0.5 ml-4 w-max rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: agentPalettes[0]!.color, color: agentPalettes[0]!.ink }}
          >
            Maya Chen
          </div>
        </div>
        <div className="absolute top-4 left-1/2 w-[34rem] -translate-x-1/2">
          <CommandBar placeholder="Find a project, or zoom in to open one" />
        </div>
        <div className="absolute right-4 bottom-4 flex items-center gap-2 rounded-lg border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
          <Avatar person={me} size={18} /> {organizations.length} organizations, {projects.length} projects
        </div>
      </div>
    </HomeWindow>
  )
}

/**
 * Projects on a canvas: every project as a board, grouped by team, with teammates and agents working in them live.
 * Zooming into a project opens it. The most Parity of the proposals, and the least conventional.
 */
export const ProjectsOnACanvas: Story = { render: () => <Spatial /> }
