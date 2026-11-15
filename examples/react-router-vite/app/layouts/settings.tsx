import { NavLink, Outlet } from "react-router"

const sections = [
  { to: "/settings", label: "General", end: true },
  { to: "/settings/profile", label: "Profile" },
  { to: "/settings/members", label: "Members" },
  { to: "/settings/billing", label: "Billing" },
  { to: "/settings/security", label: "Security" },
  { to: "/settings/files/brand", label: "Files" },
]

export default function SettingsLayout() {
  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="mt-6 flex gap-8">
        <nav className="flex w-40 flex-col gap-1">
          {sections.map((section) => (
            <NavLink
              key={section.to}
              to={section.to}
              end={section.end}
              className={({ isActive }) =>
                `rounded-md px-2 py-1.5 text-sm ${isActive ? "bg-muted font-medium" : "text-muted-foreground"}`
              }
            >
              {section.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
