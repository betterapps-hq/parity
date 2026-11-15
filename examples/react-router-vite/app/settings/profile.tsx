import { Avatar } from "~/components/Avatar"
import { Button } from "~/components/Button"
import { Card } from "~/components/Card"

export default function Profile() {
  return (
    <Card title="Profile" description="How you appear to your team.">
      <div className="flex items-center gap-4">
        <Avatar name="Ada Lovelace" size="lg" />
        <Button variant="secondary">Change photo</Button>
      </div>
    </Card>
  )
}
