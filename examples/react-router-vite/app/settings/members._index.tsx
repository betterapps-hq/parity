import { Link } from "react-router"
import { Avatar } from "~/components/Avatar"

const members = ["Ada Lovelace", "Grace Hopper", "Alan Kay"]

export default function MemberList() {
  return (
    <ul className="divide-border divide-y">
      {members.map((member) => (
        <li key={member}>
          <Link to={`/settings/members/${member}`} className="flex items-center gap-3 py-3 text-sm">
            <Avatar name={member} />
            {member}
          </Link>
        </li>
      ))}
    </ul>
  )
}
