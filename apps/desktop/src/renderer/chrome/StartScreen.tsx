import { FileInput, FolderClosed, FolderOpen, type LucideIcon } from "lucide-react"
import { Kbd } from "@/components/ui/kbd"
import { useRecentProjects, workspace } from "../workspace.ts"
import { openProjectFile, openProjectFolder } from "./commands.ts"
import { Hint } from "./Hint.tsx"

/** How many recent projects it lists; the File menu has them all. */
const shown = 6

/** The window with every tab closed: the ways to open a project, and the projects opened lately. */
export function StartScreen() {
  const recent = useRecentProjects()
  return (
    <main className="flex min-h-0 flex-1 overflow-y-auto">
      <div className="m-auto flex w-full max-w-xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Open a project</h1>
          <p className="text-sm text-muted-foreground">
            Parity opens a React app&apos;s folder and puts its components on a canvas.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Choice
            icon={FolderOpen}
            title="Open a folder"
            detail="A React app, such as one made with Vite"
            shortcut="Ctrl O"
            onClick={openProjectFolder}
          />
          <Choice
            icon={FileInput}
            title="Open a project file"
            detail="A .par file, with the app it belongs to"
            shortcut="Ctrl Shift O"
            onClick={openProjectFile}
          />
        </div>
        {recent.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium text-muted-foreground">Recent</h2>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => workspace.forgetRecent()}
              >
                Clear
              </button>
            </div>
            <ul className="-mx-2 flex flex-col">
              {recent.slice(0, shown).map((root) => (
                <li key={root}>
                  <Hint label={root} wait>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      onClick={() => void workspace.open(root)}
                    >
                      <FolderClosed className="size-4 shrink-0 text-muted-foreground" />
                      <span className="max-w-[70%] shrink-0 truncate text-sm font-medium">{basename(root)}</span>
                      <span className="min-w-0 truncate text-xs text-muted-foreground">{root}</span>
                    </button>
                  </Hint>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}

function Choice({
  icon: Icon,
  title,
  detail,
  shortcut,
  onClick
}: {
  icon: LucideIcon
  title: string
  detail: string
  shortcut: string
  onClick(): Promise<void>
}) {
  return (
    <button
      type="button"
      aria-label={title}
      className="flex flex-col items-start gap-3 rounded-xl border bg-card p-4 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
      onClick={() => void onClick()}
    >
      <span className="flex w-full items-center justify-between">
        <span className="grid size-9 place-items-center rounded-lg bg-muted">
          <Icon className="size-4" />
        </span>
        <Kbd>{shortcut}</Kbd>
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </span>
    </button>
  )
}

function basename(path: string): string {
  return path.split(/[\\/]/).findLast(Boolean) ?? path
}
