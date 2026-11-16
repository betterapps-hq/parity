import { Plant } from "@phosphor-icons/react"
import { Link, NavLink } from "react-router"
import { Button } from "./Button"
import styles from "./SiteHeader.module.css"

const links = [
  { to: "/pricing", label: "Pricing" },
  { to: "/about", label: "About" },
  { to: "/docs/getting-started", label: "Docs" },
]

/** The site's header: its name, its main pages and a link to the app. */
export function SiteHeader() {
  return (
    <header className={styles.header}>
      <NavLink to="/" className={styles.brand}>
        <Plant size={20} weight="duotone" />
        Trellis
      </NavLink>
      <nav className={styles.nav}>
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}
          >
            {link.label}
          </NavLink>
        ))}
        <Button asChild size="sm">
          <Link to="/projects">Open app</Link>
        </Button>
      </nav>
    </header>
  )
}
