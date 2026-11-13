import { createFileRoute, Link, notFound } from "@tanstack/react-router"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { projects } from "@/data/projects"

export const Route = createFileRoute("/projects/$projectId")({
  loader: ({ params }) => {
    const project = projects.find((each) => each.id === params.projectId)

    if (!project) {
      throw notFound()
    }

    return project
  },
  component: ProjectDetail,
})

function ProjectDetail() {
  const project = Route.useLoaderData()

  const initials = project.owner
    .split(" ")
    .map((part) => part[0])
    .join("")

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <Link
        to="/projects"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        All projects
      </Link>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <Badge variant="secondary">{project.status}</Badge>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Avatar>
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        {project.owner}
      </div>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="text-sm text-muted-foreground">
          Updated {project.updated.toLowerCase()}.
        </TabsContent>
        <TabsContent value="activity" className="text-sm text-muted-foreground">
          No activity yet.
        </TabsContent>
      </Tabs>
    </div>
  )
}
