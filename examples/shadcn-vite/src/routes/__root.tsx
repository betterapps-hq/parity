import { createRootRoute, Link, Outlet } from "@tanstack/react-router"

export const Route = createRootRoute({ component: RootLayout })

const links = [
  { to: "/", label: "Home" },
  { to: "/pricing", label: "Pricing" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/projects", label: "Projects" },
  { to: "/settings", label: "Settings" },
] as const

function RootLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center gap-6 border-b px-6 py-3">
        <span className="font-semibold">Acme</span>
        <nav className="flex gap-4 text-sm">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              activeOptions={{ exact: link.to === "/" }}
              className="text-muted-foreground hover:text-foreground [&.active]:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
