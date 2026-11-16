import { Link } from "@tanstack/react-router"
import EmptyState from "../components/EmptyState.tsx"

export function NotFound() {
  return (
    <>
      <EmptyState title="There's no page here" />
      <Link to="/">Back to the overview</Link>
    </>
  )
}
