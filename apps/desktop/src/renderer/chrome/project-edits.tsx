import { type ExternalToast, toast } from "sonner"
import type { ProjectEditResult } from "../../shared/protocol.ts"
import { errorCode, reportError, track } from "../report-error.ts"
import { request } from "../service.ts"
import type { Attributes } from "./event-attributes.ts"

/**
 * Says the service changed the project's files: which ones and why, with the diff to look at and Undo. `afterUndo`
 * picks up what undoing changed, as reopening the project does. A notification with the same `id` replaces the last,
 * so a run of token edits shows only the latest, which is the one Undo takes back.
 */
export function announceEdit(
  projectId: string,
  edit: ProjectEditResult,
  options: { id?: string; afterUndo?: () => Promise<void> } = {}
): void {
  if (edit.files.length === 0) {
    return
  }

  const id = options.id ?? edit.id
  track("projectEdit.applied", { files: paths(edit), outcome: "ok" })
  showEdit(`Changed ${files(edit)}`, edit, id, () => void undo(projectId, edit, id, options.afterUndo))
}

/**
 * A notification about an edit, its diff shown or not. Showing it sets the notification again rather than growing it
 * in place, since a notification takes its height when it's set. Shown, it stays until it's hidden, to be read.
 */
function showEdit(title: string, edit: ProjectEditResult, id: string, undo?: () => void, open = false): void {
  const shown: ExternalToast = {
    id,
    description: <EditDetails edit={edit} open={open} toggle={() => showEdit(title, edit, id, undo, !open)} />,
    duration: open ? Number.POSITIVE_INFINITY : 10_000
  }

  if (undo) {
    shown.action = { label: "Undo", onClick: undo }
  }

  toast.success(title, shown)
}

async function undo(
  projectId: string,
  edit: ProjectEditResult,
  id: string,
  afterUndo: (() => Promise<void>) | undefined
): Promise<void> {
  toast.loading(`Putting back ${files(edit)}…`, { id, description: undefined, action: undefined })
  let undone: ProjectEditResult

  try {
    undone = await request("project.undoEdit", { projectId, id: edit.id })
  } catch (error) {
    const failed: Attributes<"projectEdit.undone"> = { files: paths(edit), outcome: "error" }
    const code = errorCode(error)

    if (code) {
      failed.code = code
    }

    track("projectEdit.undone", failed)
    reportError(error, { operation: "project.undoEdit", title: "Couldn't undo it", id, description: message(error) })

    return
  }

  track("projectEdit.undone", { files: paths(undone), outcome: "ok" })

  // The files are back by now, so a failure from here on isn't a failed undo.
  try {
    await afterUndo?.()
    showEdit(`Put back ${files(undone)}`, undone, id)
  } catch (error) {
    reportError(error, {
      operation: "project.reload",
      title: `Put back ${files(undone)}, but couldn't reload the project`,
      id,
      description: message(error)
    })
  }
}

function paths(edit: ProjectEditResult): string[] {
  return edit.files.map((file) => file.path)
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
    <pre className="type-code max-h-48 w-full overflow-auto rounded-sm bg-muted p-2 font-mono text-foreground">
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

  if (line.startsWith("+")) {
    return "text-emerald-600 dark:text-emerald-400"
  }

  if (line.startsWith("-")) {
    return "text-destructive"
  }

  return undefined
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
