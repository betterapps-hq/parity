import { Outlet } from "react-router"

// A layout without a path of its own, for the pages that ask for your password again.
export default function Secure() {
  return (
    <div className="border-border rounded-lg border-l-4 pl-4">
      <Outlet />
    </div>
  )
}
