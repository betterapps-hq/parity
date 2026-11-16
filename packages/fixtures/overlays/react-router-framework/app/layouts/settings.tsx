import { NavLink, Outlet } from "react-router"
import styles from "./settings.module.css"

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
    <div className={styles.layout}>
      <h1 className={styles.title}>Settings</h1>
      <div className={styles.columns}>
        <nav className={styles.nav}>
          {sections.map((section) => (
            <NavLink
              key={section.to}
              to={section.to}
              end={section.end}
              className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}
            >
              {section.label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
