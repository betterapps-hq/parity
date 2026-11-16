import { Avatar, makeStyles, mergeClasses, Text, tokens } from "@fluentui/react-components"
import { Home24Regular, Settings24Regular, TicketDiagonal24Regular } from "@fluentui/react-icons"
import { Link, Outlet } from "@tanstack/react-router"
import type { ReactNode } from "react"

const useStyles = makeStyles({
  shell: {
    display: "grid",
    gridTemplateColumns: "220px 1fr",
    minHeight: "100vh",
    backgroundColor: tokens.colorNeutralBackground2,
    "@media (max-width: 640px)": { gridTemplateColumns: "1fr" }
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`
  },
  brand: { marginBottom: tokens.spacingVerticalL },
  link: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground2,
    textDecoration: "none",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover }
  },
  active: { backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1 },
  footer: { marginTop: "auto", display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS },
  main: { padding: tokens.spacingHorizontalXXL }
})

function NavLink({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) {
  const styles = useStyles()

  return (
    <Link to={to} className={styles.link} activeProps={{ className: mergeClasses(styles.link, styles.active) }}>
      {icon}
      {children}
    </Link>
  )
}

export function AppShell() {
  const styles = useStyles()

  return (
    <div className={styles.shell}>
      <nav className={styles.nav}>
        <Text weight="semibold" size={500} className={styles.brand}>
          Relay
        </Text>
        <NavLink to="/" icon={<Home24Regular />}>
          Overview
        </NavLink>
        <NavLink to="/tickets" icon={<TicketDiagonal24Regular />}>
          Tickets
        </NavLink>
        <NavLink to="/settings" icon={<Settings24Regular />}>
          Settings
        </NavLink>
        <div className={styles.footer}>
          <Avatar name="Sam Lee" size={28} />
          <Text size={200}>Sam Lee</Text>
        </div>
      </nav>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
