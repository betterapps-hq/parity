/**
 * All projects: every project in Kestrel you can open, as a list grouped by team, so a 300-person org can find work
 * and see where each team's boards stand. Each team's line counts its boards by status and what it approved this week;
 * each project shows its owner, its last edit and its boards. Opening one opens its canvas.
 */
import { ChevronDown, LayoutGrid, List } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, GitHubMark } from "../parts.tsx"
import { OrgBadge } from "../start-page-parts.tsx"
import { CanvasArt } from "../start/page.tsx"
import { approvedThisWeek } from "./boards.ts"
import { type Handoff, handoff, orgProjects, owners, teams } from "./data.ts"
import { handoffColors, Pills, PortalHeader, PortalPage } from "./parts.tsx"

const columns = "grid grid-cols-[minmax(0,1fr)_150px_170px_minmax(0,1.1fr)] items-center gap-4"

const order: Handoff[] = ["In review", "Ready to build", "Building", "Changed since approval", "Code differs", "Built"]

/** A project's or team's boards, counted by where they stand. */
function statuses(projects: string[]) {
  const all = Object.entries(handoff).filter(([key]) => projects.includes(key.split("/")[0]!))
  return order
    .map((status) => ({ status, count: all.filter(([, value]) => value === status).length }))
    .filter((entry) => entry.count)
}

function Counts({ projects }: { projects: string[] }) {
  const counts = statuses(projects)
  if (!counts.length) return <span className="text-xs text-muted-foreground">No boards handed off yet</span>
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {counts.map(({ status, count }) => (
        <span key={status} className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="size-1.5 rounded-full" style={{ background: handoffColors[status] }} />
          <span className="tabular-nums">{count}</span>
          <span className="text-muted-foreground">{status.toLowerCase()}</span>
        </span>
      ))}
    </span>
  )
}

export function AllProjectsPage() {
  return (
    <PortalPage active="projects" path="kestrel/projects">
      <div className="flex flex-col gap-6 px-8 py-7">
        <PortalHeader title="All projects">
          <Pills options={[`All ${orgProjects.length}`, "Your teams", "Yours"]} />
          <div className="ml-auto flex items-center gap-2">
            {["Grouped by team", "Last edited"].map((label) => (
              <span key={label} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                {label} <ChevronDown className="size-3 text-muted-foreground" />
              </span>
            ))}
            <div className="flex rounded-lg border p-0.5">
              <span className="grid size-7 place-items-center rounded-md text-muted-foreground">
                <LayoutGrid className="size-4" />
              </span>
              <span className="grid size-7 place-items-center rounded-md bg-muted">
                <List className="size-4" />
              </span>
            </div>
            <Button variant="outline" className="gap-1.5">
              <GitHubMark /> From a repository
            </Button>
          </div>
        </PortalHeader>
        <div className={`${columns} border-b px-2 pb-2 text-xs text-muted-foreground`}>
          <span>Project</span>
          <span>Owner</span>
          <span>Last edited</span>
          <span>Boards</span>
        </div>
        {Object.values(teams).map((team) => {
          const projects = orgProjects.filter((shown) => team.projects.includes(shown.id))
          const approved = approvedThisWeek(team.projects)
          return (
            <section key={team.org.id} className="-mt-2 flex flex-col gap-1">
              <div className="flex items-center gap-3 px-2 py-2">
                <OrgBadge org={team.org} size={22} />
                <span className="text-sm font-semibold">{team.org.name}</span>
                <span className="text-xs text-muted-foreground">
                  {team.people.length} people, {projects.length} {projects.length === 1 ? "project" : "projects"}
                  {approved > 0 && `, ${approved} approved this week`}
                </span>
                <span className="ml-auto">
                  <Counts projects={team.projects} />
                </span>
              </div>
              {projects.map((shown) => {
                const owner = owners[shown.id]!
                return (
                  <div key={shown.id} className={`${columns} rounded-lg px-2 py-2 hover:bg-muted/30`}>
                    <span className="flex min-w-0 items-center gap-3">
                      <CanvasArt
                        project={shown}
                        design={shown.designs[0]!}
                        live={false}
                        className="w-20 shrink-0 rounded-md"
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">{shown.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {shown.designs.length} {shown.designs.length === 1 ? "board" : "boards"}
                        </span>
                      </span>
                    </span>
                    <span className="flex min-w-0 items-center gap-2 text-xs">
                      <Avatar person={owner} size={20} />
                      <span className="truncate">{owner.name}</span>
                    </span>
                    <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      <Avatar person={shown.editedBy} size={20} />
                      <span className="truncate">
                        {shown.edited} by {shown.editedBy.name.split(" ")[0]}
                      </span>
                    </span>
                    <Counts projects={[shown.id]} />
                  </div>
                )
              })}
            </section>
          )
        })}
      </div>
    </PortalPage>
  )
}
