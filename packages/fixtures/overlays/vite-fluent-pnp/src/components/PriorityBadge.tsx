import { Badge } from "@fluentui/react-components"
import type { Priority } from "../data/tickets.ts"

const colors = {
  urgent: "danger",
  high: "warning",
  normal: "brand",
  low: "informative"
} as const

const labels: Record<Priority, string> = { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" }

export interface PriorityBadgeProps {
  priority: Priority
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <Badge appearance="tint" color={colors[priority]}>
      {labels[priority]}
    </Badge>
  )
}
