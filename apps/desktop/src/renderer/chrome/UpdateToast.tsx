import { CircleCheck, Download, ExternalLink, RotateCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"

export type UpdateNotice =
  | { kind: "downloading"; version: string; percent: number; transferred: number; total: number }
  | { kind: "ready" | "manual"; version: string }

interface Props {
  notice: UpdateNotice
  onDismiss: () => void
  onAction: () => void
}

const megabytes = new Intl.NumberFormat("en", { maximumFractionDigits: 1 })
const titles = { downloading: "Updating Parity", ready: "Update ready", manual: "Update available" }

/** The same notification becomes a restart notice when its download finishes. Dismissal never cancels a download. */
export function UpdateToast({ notice, onDismiss, onAction }: Props) {
  const downloading = notice.kind === "downloading"
  const manual = notice.kind === "manual"
  const Icon = notice.kind === "ready" ? CircleCheck : Download
  const percent = downloading && Number.isFinite(notice.percent) ? Math.min(100, Math.max(0, notice.percent)) : 0
  const knownSize = downloading && Number.isFinite(notice.total) && notice.total > 0
  let description = `Restart to install version ${notice.version}.`
  if (downloading) description = `Downloading version ${notice.version}`
  else if (manual) description = `Version ${notice.version} is ready to download.`

  return (
    <div
      data-slot="update-toast"
      className="w-[356px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
    >
      <div className="flex items-center gap-3 px-4 pt-4">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/60">
          <Icon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] leading-5 font-medium">{titles[notice.kind]}</div>
          <div className="mt-0.5 text-xs leading-[18px] text-muted-foreground">{description}</div>
        </div>
        {downloading && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mt-1 -mr-1 size-6 self-start text-muted-foreground"
            aria-label="Hide download progress"
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
        <div className="flex justify-end gap-2 px-4 pt-4 pb-3.5">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={onDismiss}>
            Later
          </Button>
          <Button size="sm" className="gap-1.5 text-xs" onClick={onAction}>
            {manual ? "Download update" : "Restart to update"}
            {manual ? <ExternalLink className="size-3.5" /> : <RotateCw className="size-3.5" />}
          </Button>
        </div>
      )}
    </div>
  )
}
