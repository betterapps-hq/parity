import { Link } from "react-router"
import { Avatar } from "~/components/Avatar"
import styles from "~/styles/pages.module.css"

const members = ["Ada Lovelace", "Grace Hopper", "Alan Kay"]

export default function MemberList() {
  return (
    <ul className={styles.list}>
      {members.map((member) => (
        <li key={member}>
          <Link to={`/settings/members/${member}`} className={styles.listItem}>
            <Avatar name={member} />
            {member}
          </Link>
        </li>
      ))}
    </ul>
  )
}
