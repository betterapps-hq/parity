import { FolderSimple, Gear, Plant, SignOut, SquaresFour } from "@phosphor-icons/react"
import { DropdownMenu } from "radix-ui"
import { NavLink, Outlet } from "react-router"
import { Avatar } from "~/components/Avatar"
import { projects } from "~/data/projects"
import styles from "./projects.module.css"

export default function ProjectsLayout() {
  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <NavLink to="/" className={styles.brand}>
          <Plant size={20} weight="duotone" />
          Trellis
        </NavLink>
        <nav className={styles.nav}>
          <NavLink to="/projects" end className={navClass}>
            <SquaresFour size={16} />
            All projects
          </NavLink>
          {projects.map((project) => (
            <NavLink key={project.id} to={`/projects/${project.id}`} className={navClass}>
              <FolderSimple size={16} />
              {project.name}
            </NavLink>
          ))}
          <NavLink to="/settings" className={navClass}>
            <Gear size={16} />
            Settings
          </NavLink>
        </nav>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className={styles.account}>
            <Avatar name="Ada Lovelace" size="sm" />
            Ada Lovelace
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={styles.menu} side="top" align="start">
              <DropdownMenu.Item className={styles.menuItem}>
                <SignOut size={16} />
                Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}

function navClass({ isActive }: { isActive: boolean }) {
  return `${styles.link} ${isActive ? styles.active : ""}`
}
