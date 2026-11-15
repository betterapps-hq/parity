import { ButtonLink } from "./Button"

/** What a page shows when there's nothing to list, with a way forward. */
export function EmptyState({ title, action, to }: { title: string; action: string; to: string }) {
  return (
    <div className="border-border flex flex-col items-center rounded-lg border border-dashed p-12 text-center">
      <p className="font-medium">{title}</p>
      <ButtonLink to={to} variant="secondary" className="mt-4">
        {action}
      </ButtonLink>
    </div>
  )
}
