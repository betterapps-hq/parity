import { createFileRoute, redirect } from "@tanstack/react-router"

import { PageHeader } from "@/components/page-header"
import { projects } from "@/data/projects"
import { isSignedIn } from "@/lib/auth"

// Only for people who've signed in: anyone else is sent to Login.
export const Route = createFileRoute("/dashboard")({
  beforeLoad: () => {
    if (!isSignedIn()) {
      throw redirect({ to: "/login" })
    }
  },
  component: Dashboard,
})

function Dashboard() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <PageHeader title="Dashboard" description="Your projects at a glance." />
      <div className="grid gap-4 md:grid-cols-3">
        {projects.map((project) => (
          <div key={project.id} className="rounded-lg border p-4">
            <p className="font-medium">{project.name}</p>
            <p className="text-sm text-muted-foreground">{project.owner}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
