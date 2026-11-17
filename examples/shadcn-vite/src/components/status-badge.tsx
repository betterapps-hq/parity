import { Badge } from "@buildkitgg/shadcn"

import type { Project } from "@/data/projects"

export interface StatusBadgeProps {
  status: Project["status"]
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge variant={status === "Active" ? "default" : "secondary"}>
      {status}
    </Badge>
  )
}
