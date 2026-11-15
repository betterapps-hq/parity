import { UserPlus } from "@phosphor-icons/react"
import { Link, Outlet } from "react-router"
import { Button } from "~/components/Button"
import styles from "~/styles/pages.module.css"

// A layout for the members list and each member, which the invite page escapes with its trailing underscore.
export default function Members() {
  return (
    <div className={styles.stack}>
      <div className={styles.spread}>
        <h2 className={styles.subheading}>Members</h2>
        <Button asChild size="sm">
          <Link to="/settings/members/invite">
            <UserPlus size={16} />
            Invite
          </Link>
        </Button>
      </div>
      <Outlet />
    </div>
  )
}
