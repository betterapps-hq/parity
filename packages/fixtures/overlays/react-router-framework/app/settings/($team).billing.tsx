import { Badge } from "~/components/Badge"
import { Card } from "~/components/Card"
import type { Route } from "./+types/($team).billing"

export default function Billing({ params }: Route.ComponentProps) {
  return (
    <Card title="Billing" description={params.team ? `Billing for ${params.team}` : "Billing for your workspace"}>
      <Badge tone="success">Team plan</Badge>
    </Card>
  )
}
