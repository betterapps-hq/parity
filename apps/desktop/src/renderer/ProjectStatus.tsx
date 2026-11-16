import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { Check, Circle, LoaderCircle } from "lucide-react"
import { ErrorPage } from "./chrome/ErrorPage.tsx"
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
              <Step key={step} label={step} state={stepState(index, current)} />
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}

/** Where a step is, given the step under way. */
function stepState(index: number, current: number): "done" | "active" | "pending" {
  if (index < current) {
    return "done"
  }

  return index === current ? "active" : "pending"
}

function Step({ label, state }: { label: string; state: "done" | "active" | "pending" }) {
  let Icon = Circle

  if (state === "done") {
    Icon = Check
  } else if (state === "active") {
    Icon = LoaderCircle
  }

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

  if (!open) {
    return <div className={`w-12 shrink-0 ${border}`} />
  }

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

/** A project that couldn't open: why, in the service's words, and Close (PAR-1011). */
export function ProjectFailed({ tab }: { tab: Tab }) {
  const { name, folder } = projectOf(tab)

  return (
    <ErrorPage
      title={name ? `Couldn't open ${name}` : "Couldn't open the project"}
      subtitle={
        folder && (
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
        )
      }
      details={tab.message}
      actions={<Button onClick={() => void workspace.close(tab.id)}>Close</Button>}
    />
  )
}
