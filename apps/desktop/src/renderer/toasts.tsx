import { toast } from "@buildkitgg/shadcn"
import { plainReason } from "@parity-app/core"
import type { ReactNode } from "react"

/**
 * Every toast the app shows goes through here, so each kind looks and behaves the same: its icon and color, how long
 * it stays, how loudly it's announced, and that its button closes it. Lint keeps the kit's toast out of other files.
 *
 * How a toast reads (docs/editor.md, Notifications): the title says what happened in two to five words and holds no
 * names from the person's project, which can be any length. The description is at most one sentence, the reason a
 * failure happened or the one consequence that changes what to do, and carries those names. A button is a verb of
 * one or two words.
 */
export type ToastKind = "success" | "info" | "warning" | "error" | "loading"

export interface ToastButton {
  label: string
  run: () => void
  /** Leaves the toast open, for a button that changes the toast itself, such as Undo turning it into progress. */
  keepOpen?: boolean
}

export interface ToastOptions {
  description?: ReactNode
  action?: ToastButton
  /** A toast with the same id is replaced in place, so progress becomes its result. */
  id?: string
  /** Milliseconds before it goes; 0 keeps it until it's closed. Each kind has its own default. */
  timeout?: number
  /** Called however it closes, by the person or by the app. */
  onClose?: () => void
}

export interface FailureOptions extends ToastOptions {
  /** What went wrong; its plain reason is the description unless one is given. */
  error?: unknown
  /** Adds Try again. */
  retry?: () => void
  /** Long output, such as a package manager's log, shown under the description when Details is pressed. */
  details?: string
}

/** Results go quickly, warnings stay to be read, and failures stay until they're closed. */
const timeouts: Record<ToastKind, number> = { success: 4000, info: 5000, warning: 8000, error: 0, loading: 0 }

function show(kind: ToastKind, title: string, options: ToastOptions = {}): string {
  const id = options.id ?? crypto.randomUUID()
  const { action } = options
  toast.add({
    id,
    type: kind,
    title,
    description: options.description,
    timeout: options.timeout ?? timeouts[kind],
    priority: kind === "error" || kind === "warning" ? "high" : "low",
    onClose: options.onClose,
    actionProps: action
      ? {
          children: action.label,
          // Closing first lets the button show a toast with the same id, such as Try again's progress. onClose runs
          // before the button, so a toast that must tell the two apart uses keepOpen and closes itself.
          onClick: () => {
            if (!action.keepOpen) {
              toast.close(id)
            }

            action.run()
          }
        }
      : undefined
  })

  return id
}

function failed(title: string, options: FailureOptions = {}): string {
  const { error, retry, details, ...rest } = options
  const id = rest.id ?? crypto.randomUUID()
  const description = rest.description ?? plainReason(error)

  if (retry) {
    return show("error", title, { ...rest, id, description, action: { label: "Try again", run: retry } })
  }

  if (!details) {
    return show("error", title, { ...rest, id, description })
  }

  return show("error", title, {
    ...rest,
    id,
    description,
    action: {
      label: "Details",
      keepOpen: true,
      run: () =>
        show("error", title, {
          ...rest,
          id,
          description: (
            <span className="flex flex-col gap-2">
              {description}
              <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
                {details}
              </pre>
            </span>
          )
        })
    }
  })
}

/** Shows toasts. Each returns the toast's id, to replace or close it later. */
export const notify = {
  /** Something finished, such as Saved the project. */
  done: (title: string, options?: ToastOptions) => show("success", title, options),
  /** Nothing went wrong, but nothing happened either, such as Nothing to paste. */
  info: (title: string, options?: ToastOptions) => show("info", title, options),
  /** It went through, but not all of it, or something needs a decision. */
  warning: (title: string, options?: ToastOptions) => show("warning", title, options),
  /** It didn't happen. Titles start with Couldn't. */
  failed,
  /** Something under way, which stays until it's replaced by its result or closed. */
  progress: (title: string, options?: ToastOptions) => show("loading", title, options),
  /** A toast of a kind decided elsewhere, such as an update notice. */
  show,
  /** Closes one toast, or every toast. */
  close: (id?: string) => toast.close(id)
}

/** A description with one item to a line, such as an export's warnings. */
export function lines(items: string[]): ReactNode {
  return <span className="whitespace-pre-line">{items.join("\n")}</span>
}

/** Names in a sentence: "a", "a and b", "a, b and c". */
export function list(names: readonly string[]): string {
  return new Intl.ListFormat("en-GB", { type: "conjunction" }).format(names)
}
