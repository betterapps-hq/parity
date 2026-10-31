import { CircleAlert, CircleCheck, Download, ExternalLink, LoaderCircle, RotateCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"

export type UpdateNotice =
  | { kind: "downloading"; version: string; percent: number; transferred: number; total: number }
  | { kind: "ready" | "manual"; version: string }
  | { kind: "checking" | "current"; beta: boolean }
  | { kind: "error" }

interface Props {
  notice: UpdateNotice
  onDismiss: () => void
  onAction: () => void
}

const megabytes = new Intl.NumberFormat("en", { maximumFractionDigits: 1 })
const titles = {
  downloading: "Updating Parity",
  ready: "Update ready",
  manual: "Update available",
  checking: "Checking for updates…",
  current: "No update available",
  error: "Couldn't check for updates"
}

/** The same notification becomes a restart notice when its download finishes. Dismissal never cancels a download. */
export function UpdateToast({ notice, onDismiss, onAction }: Props) {
  const downloading = notice.kind === "downloading"
  const manual = notice.kind === "manual"
  const result = notice.kind === "checking" || notice.kind === "current" || notice.kind === "error"
  let Icon = Download
  if (notice.kind === "checking") Icon = LoaderCircle
  else if (notice.kind === "error") Icon = CircleAlert
  else if (notice.kind === "ready" || notice.kind === "current") Icon = CircleCheck
  let action = "Restart to update"
  if (notice.kind === "error") action = "Try again"
  else if (manual) action = "Download update"
  const percent = downloading && Number.isFinite(notice.percent) ? Math.min(100, Math.max(0, notice.percent)) : 0
  const knownSize = downloading && Number.isFinite(notice.total) && notice.total > 0
  let description = "version" in notice ? `Restart to install version ${notice.version}.` : ""
  if (downloading) description = `Downloading version ${notice.version}`
  else if (manual) description = `Version ${notice.version} is ready to download.`
  else if (notice.kind === "checking")
    description = notice.beta ? "Looking for beta and stable releases." : "Looking for stable releases."
  else if (notice.kind === "current")
    description = notice.beta
      ? "No newer beta or stable release is available."
      : "No newer stable release is available."
  else if (notice.kind === "error") description = "Try again in a moment."

  return (
    <div
      data-slot="update-toast"
      className="w-[356px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
    >
      <div className={`flex items-center gap-3 px-4 pt-4 ${result && notice.kind !== "error" ? "pb-4" : ""}`}>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/60">
          <Icon className={`size-4 ${notice.kind === "checking" ? "animate-spin" : ""}`} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] leading-5 font-medium">{titles[notice.kind]}</div>
          <div className="mt-0.5 text-xs leading-[18px] text-muted-foreground">{description}</div>
        </div>
        {(downloading || result) && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mt-1 -mr-1 size-6 self-start text-muted-foreground"
            aria-label={downloading ? "Hide download progress" : "Dismiss update notification"}
            onClick={onDismiss}
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>
      {downloading ? (
        <div className="px-4 pt-[18px] pb-4">
          <progress
            className="block h-1 w-full overflow-hidden rounded-full border-0 bg-muted [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-violet-600 [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-violet-600 dark:[&::-moz-progress-bar]:bg-violet-300 dark:[&::-webkit-progress-value]:bg-violet-300"
            aria-label="Update download"
            max={100}
            value={knownSize ? percent : undefined}
          />
          <div className="mt-2 flex justify-between gap-3 text-[11px] leading-4 text-muted-foreground tabular-nums">
            <span>
              {knownSize
                ? `${megabytes.format((Number.isFinite(notice.transferred) ? Math.max(0, notice.transferred) : 0) / 1_000_000)} MB of ${megabytes.format(notice.total / 1_000_000)} MB`
                : "Downloading…"}
            </span>
            {knownSize && <span className="text-xs font-medium text-foreground">{Math.round(percent)}%</span>}
          </div>
        </div>
      ) : (
        (!result || notice.kind === "error") && (
          <div className="flex justify-end gap-2 px-4 pt-4 pb-3.5">
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={onDismiss}>
              {notice.kind === "error" ? "Dismiss" : "Later"}
            </Button>
            <Button size="sm" className="gap-1.5 text-xs" onClick={onAction}>
              {action}
              {manual ? <ExternalLink className="size-3.5" /> : <RotateCw className="size-3.5" />}
            </Button>
          </div>
        )
      )}
    </div>
  )
}
