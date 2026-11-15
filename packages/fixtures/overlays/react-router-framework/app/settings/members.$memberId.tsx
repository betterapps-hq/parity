import { Avatar } from "~/components/Avatar"
import { Card } from "~/components/Card"
import styles from "~/styles/pages.module.css"
import type { Route } from "./+types/members.$memberId"

export default function Member({ params }: Route.ComponentProps) {
  return (
    <Card>
      <div className={styles.row}>
        <Avatar name={params.memberId} />
        <strong>{params.memberId}</strong>
      </div>
    </Card>
  )
}
