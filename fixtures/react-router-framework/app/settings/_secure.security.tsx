import { Button } from "~/components/Button"
import { Card } from "~/components/Card"

export default function Security() {
  return (
    <Card title="Security" description="Two-step sign-in and active sessions.">
      <Button variant="secondary">Turn on two-step sign-in</Button>
    </Card>
  )
}
