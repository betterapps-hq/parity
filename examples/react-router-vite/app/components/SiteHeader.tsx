import { NavLink } from "react-router"
import { ButtonLink } from "./Button"

const links = [
  { to: "/pricing", label: "Pricing" },
  { to: "/about", label: "About" },
  { to: "/docs/getting-started", label: "Docs" },
]

/** The site's header: its name, its main pages and a link to the app. */
export function SiteHeader() {
  return (
    <header className="border-border flex h-16 items-center justify-between border-b px-6">
      <NavLink to="/" className="text-lg font-semibold">
        Trellis
      </NavLink>
      <nav className="flex items-center gap-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `rounded-md px-3 py-2 text-sm ${isActive ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`
            }
          >
            {link.label}
          </NavLink>
        ))}
        <ButtonLink to="/projects" size="sm" className="ml-2">
          Open app
        </ButtonLink>
      </nav>
    </header>
  )
}
