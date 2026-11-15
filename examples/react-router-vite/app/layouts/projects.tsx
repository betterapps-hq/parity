import { NavLink, Outlet } from "react-router"
import { Avatar } from "~/components/Avatar"
import { projects } from "~/data/projects"

export default function ProjectsLayout() {
  return (
    <div className="flex min-h-screen">
      <aside className="border-border bg-muted/50 flex w-60 flex-col border-r p-4">
        <NavLink to="/" className="px-2 text-lg font-semibold">
          Trellis
        </NavLink>
        <nav className="mt-6 flex flex-col gap-1">
          <NavLink to="/projects" end className={navClass}>
            All projects
          </NavLink>
          {projects.map((project) => (
            <NavLink key={project.id} to={`/projects/${project.id}`} className={navClass}>
              {project.name}
            </NavLink>
          ))}
          <NavLink to="/settings" className={navClass}>
            Settings
          </NavLink>
        </nav>
        <div className="mt-auto flex items-center gap-2 px-2 text-sm">
          <Avatar name="Ada Lovelace" size="sm" />
          Ada Lovelace
        </div>
      </aside>
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  )
}

function navClass({ isActive }: { isActive: boolean }) {
  return `rounded-md px-2 py-1.5 text-sm ${isActive ? "bg-surface font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`
}
