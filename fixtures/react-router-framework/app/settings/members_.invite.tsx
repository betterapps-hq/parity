import { Button } from "~/components/Button"
import { Card } from "~/components/Card"

export default function Invite() {
  return (
    <Card title="Invite people" description="They get an email with a link to join.">
      <Button>Send invites</Button>
    </Card>
  )
}
