import { toast } from "sonner"
import type { ProjectEditResult } from "../../shared/protocol.ts"

/**
 * Says the service changed the project's files: which ones and why, with the diff to look at and Undo. `afterUndo`
 * picks up what undoing changed, as reopening the project does. A notification with the same `id` replaces the last,
 * so a run of token edits shows only the latest, which is the one Undo takes back.
 */
export function announceEdit(
  projectId: string,
  edit: ProjectEditResult,
  options: { id?: string; afterUndo?: () => Promise<unknown> } = {}
): void {
  if (edit.files.length === 0) return
  const id = options.id ?? edit.id
  showEdit(`Changed ${files(edit)}`, edit, id, () => void undo(projectId, edit, id, options.afterUndo))
}

/**
 * A notification about an edit, its diff shown or not. Showing it sets the notification again rather than growing it
 * in place, since a notification takes its height when it's set. Shown, it stays until it's hidden, to be read.
 */
function showEdit(title: string, edit: ProjectEditResult, id: string, undo?: () => void, open = false): void {
  toast.success(title, {
    id,
    description: <EditDetails edit={edit} open={open} toggle={() => showEdit(title, edit, id, undo, !open)} />,
    duration: open ? Number.POSITIVE_INFINITY : 10_000,
    ...(undo ? { action: { label: "Undo", onClick: undo } } : {})
  })
}

async function undo(
  projectId: string,
  edit: ProjectEditResult,
  id: string,
  afterUndo: (() => Promise<unknown>) | undefined
): Promise<void> {
  toast.loading(`Putting back ${files(edit)}…`, { id, description: undefined, action: undefined })
  try {
    const undone = await window.canvasHost.request("project.undoEdit", { projectId, id: edit.id })
    await afterUndo?.()
    showEdit(`Put back ${files(undone)}`, undone, id)
  } catch (error) {
    toast.error("Couldn't undo it", { id, description: message(error) })
  }
}

function files(edit: ProjectEditResult): string {
  return edit.files.length === 1 ? edit.files[0]!.path : `${edit.files.length} files`
}

/** What an edit was for, and each file's diff when it's open. */
export function EditDetails({ edit, open, toggle }: { edit: ProjectEditResult; open: boolean; toggle: () => void }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <span>{edit.label}</span>
      <button
        type="button"
        aria-expanded={open}
        className="font-medium text-foreground underline-offset-2 hover:underline"
        onClick={toggle}
      >
        {open ? "Hide changes" : "Show changes"}
      </button>
      {open && edit.files.map((file) => <Diff key={file.path} diff={file.diff} />)}
    </div>
  )
}

/** A unified diff, with what was taken out and put in told apart by color. */
function Diff({ diff }: { diff: string }) {
  return (
    <pre className="max-h-48 w-full overflow-auto rounded-sm bg-muted p-2 font-mono text-[11px] leading-4 text-foreground">
      {diff.split("\n").map((line, index) => (
        <div key={index} className={lineClass(line)}>
          {line || " "}
        </div>
      ))}
    </pre>
  )
}

function lineClass(line: string): string | undefined {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@") || line.startsWith("\\")) {
    return "text-muted-foreground"
  }
  if (line.startsWith("+")) return "text-emerald-600 dark:text-emerald-400"
  if (line.startsWith("-")) return "text-destructive"
  return undefined
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
