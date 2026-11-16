import type { ProjectEditResult } from "../../shared/protocol.ts"
import { request } from "../service.ts"
import { notify } from "../toasts.tsx"

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
  const title = edit.files.length === 1 ? "Changed a project file" : `Changed ${edit.files.length} project files`
  showEdit(title, edit, id, () => void undo(projectId, edit, id, options.afterUndo))
}

/**
 * A notification about an edit, its diff shown or not. Showing it sets the notification again rather than growing it
 * in place, since a notification takes its height when it's set. Shown, it stays until it's hidden, to be read.
 */
function showEdit(title: string, edit: ProjectEditResult, id: string, undo?: () => void, open = false): void {
  notify.done(title, {
    id,
    description: <EditDetails edit={edit} open={open} toggle={() => showEdit(title, edit, id, undo, !open)} />,
    timeout: open ? 0 : 10_000,
    // Undo turns this toast into its progress, so it stays.
    ...(undo ? { action: { label: "Undo", run: undo, keepOpen: true } } : {})
  })
}

async function undo(
  projectId: string,
  edit: ProjectEditResult,
  id: string,
  afterUndo: (() => Promise<unknown>) | undefined
): Promise<void> {
  notify.progress("Undoing the change…", { id })
  let undone: ProjectEditResult
  try {
    undone = await request("project.undoEdit", { projectId, id: edit.id })
  } catch (error) {
    notify.failed("Couldn't undo the change", { id, error })
    return
  }
  // The files are back by now, so a failure from here on isn't a failed undo.
  try {
    await afterUndo?.()
    showEdit("Undid the change", undone, id)
  } catch {
    const reload = afterUndo
    notify.warning("Couldn't reload the project", {
      id,
      description: "The change was undone, but the project didn't reload.",
      timeout: 0,
      ...(reload ? { action: { label: "Reload", run: () => void reload() } } : {})
    })
  }
}

function files(edit: ProjectEditResult): string {
  return edit.files.length === 1 ? edit.files[0]!.path : `${edit.files.length} files`
}

/** What an edit was for, and each file's diff when it's open. */
export function EditDetails({ edit, open, toggle }: { edit: ProjectEditResult; open: boolean; toggle: () => void }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <span>{files(edit)}</span>
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
