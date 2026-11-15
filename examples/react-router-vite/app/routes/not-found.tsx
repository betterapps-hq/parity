import { EmptyState } from "~/components/EmptyState"

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl p-16">
      <EmptyState title="There's no page here" action="Go home" to="/" />
    </main>
  )
}
