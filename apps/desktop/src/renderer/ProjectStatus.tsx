import { Check, Circle, Copy, FolderOpen, LoaderCircle, RotateCw, TriangleAlert } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { openProjectFolder } from "./chrome/commands.ts"
import { useLayout } from "./chrome/layout.ts"
import { isPlaceholder, type Tab, workspace } from "./workspace.ts"

/** The project's name and folder, once the service has said which project a tab is. */
function projectOf(tab: Tab): { name?: string; folder?: string } {
  return isPlaceholder(tab.id) ? {} : { name: tab.title, folder: tab.id }
}

/**
 * A project while it opens: the editor's outline, faint, with what opening does over it, each step ticked off as it's
 * done. The outline follows the panels as they'll open, so the project fills in around it.
 */
export function OpeningProject({ tab }: { tab: Tab }) {
  const { name, folder } = projectOf(tab)
  const { steps, current } = tab.progress ?? { steps: ["Opening the project"], current: 0 }
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <EditorOutline />
      <div className="absolute inset-0 grid place-items-center p-6">
        <div className="flex w-[22rem] max-w-full flex-col gap-4 rounded-xl border bg-popover/90 p-5 shadow-2xl backdrop-blur">
          {/* Screen readers hear each step as opening moves on to it. */}
          <output className="sr-only">{steps[current]}</output>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="truncate font-semibold">{name ? `Opening ${name}` : "Opening your project"}</h1>
            {folder && (
              <p className="truncate text-xs text-muted-foreground" title={folder}>
                {folder}
              </p>
            )}
          </div>
          <ol className="flex flex-col gap-2.5 text-sm">
            {steps.map((step, index) => (
              <Step
                key={step}
                label={step}
                state={index < current ? "done" : index === current ? "active" : "pending"}
              />
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}

function Step({ label, state }: { label: string; state: "done" | "active" | "pending" }) {
  const Icon = state === "done" ? Check : state === "active" ? LoaderCircle : Circle
  return (
    <li
      className={`flex items-center gap-2.5 ${state === "active" ? "text-foreground" : "text-muted-foreground"} ${
        state === "pending" ? "opacity-60" : ""
      }`}
    >
      <Icon
        className={`shrink-0 ${state === "pending" ? "mx-0.5 size-3" : "size-4"} ${state === "active" ? "animate-spin" : ""}`}
      />
      <span className="min-w-0 truncate">{label}</span>
      {state === "done" && <span className="sr-only">, done</span>}
    </li>
  )
}

/** The editor's panels, canvas and status bar as faint shapes, sized as the project's will be. */
function EditorOutline() {
  const layout = useLayout()
  return (
    <div aria-hidden className="absolute inset-0 flex flex-col">
      <div className="flex min-h-0 flex-1">
        <OutlinePanel side="left" open={layout.left} width={layout.leftWidth} />
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <OutlineBoard className="top-[12%] left-[8%] h-[40%] w-[40%]" />
          <OutlineBoard className="top-[16%] left-[54%] h-[44%] w-[15%]" />
          <OutlineBoard className="top-[64%] left-[14%] h-[24%] w-[26%]" />
          <OutlineBoard className="top-[70%] left-[48%] h-[18%] w-[30%]" />
        </div>
        <OutlinePanel side="right" open={layout.right} width={layout.rightWidth} />
      </div>
      <div className="h-7 shrink-0 border-t" />
    </div>
  )
}

/** Rows of a panel, of varying length, as its layers or fields would be. */
const rows = [72, 56, 64, 40, 68, 52, 60, 36, 48]

function OutlinePanel({ side, open, width }: { side: "left" | "right"; open: boolean; width: number }) {
  const border = side === "left" ? "border-r" : "border-l"
  if (!open) return <div className={`w-12 shrink-0 ${border}`} />
  return (
    <div className={`flex shrink-0 flex-col ${border}`} style={{ width }}>
      <div className="h-12 shrink-0 border-b" />
      <div className="flex flex-col gap-3.5 p-4">
        {rows.map((row, index) => (
          <div key={index} className="h-2 animate-pulse rounded-full bg-muted" style={{ width: `${row}%` }} />
        ))}
      </div>
    </div>
  )
}

/** A board on the canvas: its title, then its frame. */
function OutlineBoard({ className }: { className: string }) {
  return (
    <div className={`absolute flex flex-col gap-2 ${className}`}>
      <div className="h-2 w-16 animate-pulse rounded-full bg-muted" />
      <div className="flex-1 animate-pulse rounded-lg bg-muted/30" />
    </div>
  )
}

/**
 * A project that couldn't open: why, in the service's words, and the ways on from here. Trying again opens it in the
 * same tab; a tab that never learned its folder can only open another project.
 */
export function ProjectFailed({ tab }: { tab: Tab }) {
  const { name, folder } = projectOf(tab)
  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto p-6">
      <div role="alert" className="m-auto flex w-full max-w-lg flex-col gap-5">
        <span className="grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive">
          <TriangleAlert className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-lg font-semibold">{name ? `Couldn't open ${name}` : "Couldn't open the project"}</h1>
          {folder && (
            <p className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
              <span className="truncate" title={folder}>
                {folder}
              </span>
              <button
                type="button"
                className="shrink-0 underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => void window.canvasHost.showItem(folder)}
              >
                Show in folder
              </button>
            </p>
          )}
        </div>
        {tab.message && <ErrorDetails message={tab.message} />}
        <div className="flex flex-wrap gap-2">
          {folder && (
            <Button onClick={() => void workspace.reload(tab.id, "Starting the project's builder")}>
              <RotateCw /> Try again
            </Button>
          )}
          <Button variant={folder ? "outline" : "default"} onClick={() => void openProjectFolder()}>
            <FolderOpen /> {folder ? "Open another project…" : "Open a project…"}
          </Button>
          <Button variant="ghost" onClick={() => void workspace.close(tab.id)}>
            Close tab
          </Button>
        </div>
      </div>
    </div>
  )
}

/** The error as the service gave it, to read in full or copy into a bug report. */
function ErrorDetails({ message }: { message: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <div className="overflow-hidden rounded-lg border bg-muted/40">
      <div className="flex items-center justify-between border-b py-1 pr-1 pl-3 text-xs text-muted-foreground">
        Details
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          onClick={() => void navigator.clipboard.writeText(message).then(() => setCopied(true))}
        >
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="max-h-56 overflow-auto p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground/90 select-text">
        {message}
      </pre>
    </div>
  )
}
