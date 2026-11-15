import { Outlet } from "react-router"
import { ButtonLink } from "~/components/Button"

// A layout for the members list and each member, which the invite page escapes with its trailing underscore.
export default function Members() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Members</h2>
        <ButtonLink to="/settings/members/invite" size="sm">
          Invite
        </ButtonLink>
      </div>
      <Outlet />
    </div>
  )
}
