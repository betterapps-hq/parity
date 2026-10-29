/** The Recents page: every project in Kestrel you've been in. */
import { LayoutGrid, List } from "lucide-react"
import { Button } from "@/components/ui/button"
import { GitHubMark } from "../parts.tsx"
import { ProjectCard } from "../start/page.tsx"
import { orgProjects } from "./data.ts"
import { Pills, PortalHeader, PortalPage } from "./parts.tsx"

/** Recents, as Figma's file browser: every project you've been in, as its canvas. Opening one opens its canvas. */
export function RecentsPage() {
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
              <GitHubMark /> From a repository
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
