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
import desktop from "../../../package.json"
import { closeDialog, useOpenDialog } from "./app-dialogs.ts"

/** The parts of Parity a bug report needs: its version, and the Electron and Chromium it runs on. */
function buildDetails(userAgent = navigator.userAgent): { label: string; value: string }[] {
  const version = (name: string) => new RegExp(`${name}/([\\d.]+)`).exec(userAgent)?.[1] ?? "unknown"
  const system = /Mac/.test(userAgent) ? "macOS" : /Windows/.test(userAgent) ? "Windows" : "Linux"
  return [
    { label: "Version", value: `${desktop.version}${import.meta.env.DEV ? " (development build)" : ""}` },
    { label: "Electron", value: version("Electron") },
    { label: "Chromium", value: version("Chrome") },
    { label: "System", value: system }
  ]
}

/** Help > About Parity: which Parity this is, and how it gets updates. */
export function AboutDialog() {
  const open = useOpenDialog() === "about"
  const details = buildDetails()
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
          <DialogDescription>
            Parity has no releases yet, so there are no updates to check for. To get the latest, pull the repository and
            run it again.
          </DialogDescription>
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
          <Button onClick={closeDialog}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
