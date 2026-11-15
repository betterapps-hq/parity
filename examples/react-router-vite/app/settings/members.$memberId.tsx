import { Avatar } from "~/components/Avatar"
import { Card } from "~/components/Card"
import type { Route } from "./+types/members.$memberId"

export default function Member({ params }: Route.ComponentProps) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <Avatar name={params.memberId} />
        <span className="font-medium">{params.memberId}</span>
      </div>
    </Card>
  )
}
