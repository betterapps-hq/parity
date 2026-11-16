import type { ReactNode } from "react"
import type { ToastButton, ToastKind } from "../toasts.tsx"

export type UpdateNotice =
  | { kind: "downloading"; version: string; percent: number; transferred: number; total: number }
  | { kind: "ready" | "manual"; version: string }
  | { kind: "checking" | "current"; beta: boolean }
  | { kind: "error" }

/** An update notice for `notify.show`, each option set so a notice that replaces another leaves nothing behind. */
export interface UpdateToastOptions {
  kind: ToastKind
  title: string
  options: { description: ReactNode; action: ToastButton | undefined }
}

const megabytes = new Intl.NumberFormat("en", { maximumFractionDigits: 1 })
const titles = {
  ready: "Update ready",
  manual: "Update available",
  checking: "Checking for updates…",
  current: "Parity is up to date",
  error: "Couldn't check for updates"
}
const types = {
  downloading: "loading",
  ready: "success",
  manual: "info",
  checking: "loading",
  current: "success",
  error: "error"
} as const

/**
 * The update notice as a stock toast. The same toast becomes a restart notice when its download finishes. Its close
 * button hides it without cancelling a download.
 */
export function updateToast(notice: UpdateNotice, onAction: () => void): UpdateToastOptions {
  let action: string | undefined
  if (notice.kind === "ready") action = "Restart"
  else if (notice.kind === "manual") action = "Download"
  else if (notice.kind === "error") action = "Try again"
  return {
    kind: types[notice.kind],
    title: notice.kind === "downloading" ? `Downloading Parity ${notice.version}` : titles[notice.kind],
    options: {
      description: notice.kind === "downloading" ? <UpdateProgress notice={notice} /> : description(notice),
      // Each changes the notice itself: Try again turns it into checking, and the others leave it until there's news.
      action: action ? { label: action, run: onAction, keepOpen: true } : undefined
    }
  }
}

function description(notice: Exclude<UpdateNotice, { kind: "downloading" }>): string | undefined {
  if (notice.kind === "ready") return `Restart to install Parity ${notice.version}.`
  if (notice.kind === "manual") return `Parity ${notice.version} is ready to download.`
  if (notice.kind === "checking") return undefined
  if (notice.kind === "current")
    return notice.beta ? "You have the latest beta or stable release." : "You have the latest stable release."
  return "Parity couldn't reach the update server."
}

/** A download's version and progress. Without a reported length it stays indeterminate instead of claiming a percentage. */
export function UpdateProgress({ notice }: { notice: Extract<UpdateNotice, { kind: "downloading" }> }) {
  const percent = Number.isFinite(notice.percent) ? Math.min(100, Math.max(0, notice.percent)) : 0
  const knownSize = Number.isFinite(notice.total) && notice.total > 0
  const transferred = Number.isFinite(notice.transferred) ? Math.max(0, notice.transferred) : 0
  return (
    <span className="flex flex-col gap-2">
      <progress
        className="block h-1 w-full overflow-hidden rounded-full border-0 bg-muted [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-violet-600 [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-violet-600 dark:[&::-moz-progress-bar]:bg-violet-300 dark:[&::-webkit-progress-value]:bg-violet-300"
        aria-label="Update download"
        max={100}
        value={knownSize ? percent : undefined}
      />
      <span className="flex justify-between gap-3 text-xs tabular-nums">
        <span>
          {knownSize
            ? `${megabytes.format(transferred / 1_000_000)} MB of ${megabytes.format(notice.total / 1_000_000)} MB downloaded`
            : "Downloading…"}
        </span>
        {knownSize && <span className="font-medium text-foreground">{Math.round(percent)}%</span>}
      </span>
    </span>
  )
}
