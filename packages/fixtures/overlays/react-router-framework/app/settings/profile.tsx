import { Avatar } from "~/components/Avatar"
import { Button } from "~/components/Button"
import { Card } from "~/components/Card"
import styles from "~/styles/pages.module.css"

export default function Profile() {
  return (
    <Card title="Profile" description="How you appear to your team.">
      <div className={styles.row}>
        <Avatar name="Ada Lovelace" size="lg" />
        <Button variant="secondary">Change photo</Button>
      </div>
    </Card>
  )
}
