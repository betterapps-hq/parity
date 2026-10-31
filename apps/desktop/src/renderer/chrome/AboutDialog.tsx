import { Copy } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import icon from "../../../../../brand/parity-icon.svg?url"
import { closeDialog, useOpenDialog } from "./app-dialogs.ts"
import { actOnUpdate, checkForUpdates, useUpdates } from "./updates.tsx"

/** The parts of Parity a bug report needs: its version, and the Electron and Chromium it runs on. */
function buildDetails(userAgent = navigator.userAgent): { label: string; value: string }[] {
  const version = (name: string) => new RegExp(`${name}/([\\d.]+)`).exec(userAgent)?.[1] ?? "unknown"
  let system = "Linux"
  if (/Mac/.test(userAgent)) system = "macOS"
  else if (/Windows/.test(userAgent)) system = "Windows"
  return [
    { label: "Version", value: `${window.canvasHost.appVersion}${import.meta.env.DEV ? " (development build)" : ""}` },
    { label: "Electron", value: version("Electron") },
    { label: "Chromium", value: version("Chrome") },
    { label: "System", value: system }
  ]
}

/** Help > About Parity: which Parity this is, and how it gets updates. */
export function AboutDialog() {
  const open = useOpenDialog() === "about"
  const details = buildDetails()
  const update = useUpdates()
  const busy = ["checking", "downloading", "installing"].includes(update.phase)
  const descriptions = {
    disabled: "Updates are available in installed builds. Linux updates need the AppImage.",
    idle: "Check for a newer release of Parity.",
    checking: "Checking for updates…",
    current: "No newer release in your selected update channel.",
    downloading: "Downloading an update. You can keep working.",
    ready: "An update is ready. Restart when you're ready to install it.",
    manual: "A new version is available. Download the Mac installer and replace your current copy.",
    installing: "Restarting to install the update…",
    error: "Couldn't check or download the update. Check your connection and try again."
  }
  let action = "Check for updates"
  if (update.phase === "ready") action = "Restart to update"
  else if (update.phase === "manual") action = "Download update"
  else if (update.phase === "error") action = "Try again"
  details.push({ label: "Updates", value: update.beta ? "Beta and stable" : "Stable releases" })
  if ("version" in update) details.push({ label: "Available", value: update.version })
  const copy = () => {
    void navigator.clipboard
      .writeText(details.map(({ label, value }) => `${label}: ${value}`).join("\n"))
      .then(() => toast.success("Copied the version details", { duration: 2000 }))
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeDialog()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center text-center">
          <img src={icon} alt="" className="size-16" />
          <DialogTitle className="text-base">Parity</DialogTitle>
          <DialogDescription>{descriptions[update.phase]}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          {details.map(({ label, value }) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <DialogFooter>
          <Button variant="outline" onClick={copy}>
            <Copy /> Copy details
          </Button>
          <Button
            disabled={busy || update.phase === "disabled"}
            onClick={update.phase === "ready" || update.phase === "manual" ? actOnUpdate : checkForUpdates}
          >
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
