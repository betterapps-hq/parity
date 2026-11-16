import { createFileRoute, Link } from "@tanstack/react-router"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@buildkitgg/shadcn-baseui-nova"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { projects } from "@/data/projects"

export const Route = createFileRoute("/projects/")({ component: Projects })

function Projects() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <PageHeader title="Projects" />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => (
            <TableRow key={project.id}>
              <TableCell>
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: project.id }}
                  className="font-medium hover:underline"
                >
                  {project.name}
                </Link>
              </TableCell>
              <TableCell>{project.owner}</TableCell>
              <TableCell>
                <StatusBadge status={project.status} />
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {project.updated}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
