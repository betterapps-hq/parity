import { createFileRoute, Link, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/settings")({
  component: SettingsLayout,
})

const sections = [
  { to: "/settings/profile", label: "Profile" },
  { to: "/settings/billing", label: "Billing" },
] as const

function SettingsLayout() {
  return (
    <div className="mx-auto flex max-w-4xl gap-8 p-6">
      <aside className="flex w-40 shrink-0 flex-col gap-1 text-sm">
        <h1 className="mb-2 text-lg font-semibold">Settings</h1>
        {sections.map((section) => (
          <Link
            key={section.to}
            to={section.to}
            className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted [&.active]:bg-muted [&.active]:text-foreground"
          >
            {section.label}
          </Link>
        ))}
      </aside>
      <section className="min-w-0 flex-1">
        <Outlet />
      </section>
    </div>
  )
}
