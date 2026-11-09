import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Spinner,
  Textarea
} from "@buildkitgg/shadcn-baseui-kit"
import { TriangleAlert } from "lucide-react"
import { useId, useState, useSyncExternalStore } from "react"
import { reportIds } from "../telemetry.ts"
import { useTabs } from "../workspace.ts"
import { closeDialog, openDialog, useOpenDialog } from "./app-dialogs.ts"
import { crashTime, lowerFirst } from "./report-time.ts"

/** Where a report is: being written, on its way, filed, or refused. */
export type ReportPhase = { phase: "editing" } | { phase: "sending" } | { phase: "sent" } | { phase: "failed" }

/** The crash from the last run, when Parity offers the dialog on start. */
export interface LastCrash {
  /** When it crashed, as the reader would say it: "Today at 14:02". */
  when: string
}

export interface ReportProblemViewProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  state: ReportPhase
  description: string
  onDescriptionChange: (text: string) => void
  screenshot: boolean
  onScreenshotChange: (on: boolean) => void
  /** A data URL of the window as it was when the dialog opened. */
  screenshotUrl?: string
  /** The open projects' names, listed with what's attached. */
  projects: string[]
  crash?: LastCrash
  /** The part whose fallback opened the dialog, as it's titled in the window, when its error goes with the report. */
  caught?: string
  onSend: () => void
}

/** What goes with every report, besides the screenshot and the crash. */
function attachments(projects: string[]): string[] {
  const opened = projects.length === 0 ? "No open projects" : `Open projects: ${projects.join(", ")}`

  return [
    "The last minute of this window, as a replay",
    "The last hour of logs",
    "Versions of Parity and your system",
    opened
  ]
}

/** Help > Report a problem, and the same offer after a crash: what happened, and what goes with it. */
export function ReportProblemView(props: ReportProblemViewProps) {
  const { state, crash, caught } = props
  const ids = { text: useId(), screenshot: useId() }
  const busy = state.phase === "sending"
  const title = crash ? "Parity closed unexpectedly" : "Report a problem"

  const intro = crash
    ? `Parity stopped ${lowerFirst(crash.when)}. Tell us what you were doing and we'll send it with the crash.`
    : "Tell us what happened. We'll send it with what's needed to find the cause."

  if (state.phase === "sent") {
    return (
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Report sent</DialogTitle>
            <DialogDescription>Thanks, the Parity team will look into it.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => props.onOpenChange(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={props.open} onOpenChange={(next) => !busy && props.onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{intro}</DialogDescription>
        </DialogHeader>
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault()
            props.onSend()
          }}
        >
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor={ids.text}>What happened?</FieldLabel>
              <Textarea
                id={ids.text}
                value={props.description}
                onChange={(event) => props.onDescriptionChange(event.target.value)}
                placeholder="What you did, what you expected, and what Parity did instead"
                rows={4}
                disabled={busy}
                required
              />
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id={ids.screenshot}
                checked={props.screenshot}
                onCheckedChange={(on) => props.onScreenshotChange(on)}
                disabled={busy}
              />
              <FieldContent>
                <FieldLabel htmlFor={ids.screenshot}>Include a screenshot of the window</FieldLabel>
                {props.screenshot && props.screenshotUrl && (
                  <img
                    src={props.screenshotUrl}
                    alt="Screenshot of the Parity window"
                    className="mt-1 max-h-32 w-fit rounded-md border object-contain"
                  />
                )}
              </FieldContent>
            </Field>
            <section aria-labelledby={`${ids.text}-sent`} className="grid gap-1.5">
              <h3 id={`${ids.text}-sent`} className="text-sm font-medium">
                Also sent
              </h3>
              <ul className="grid list-disc gap-0.5 pl-5 type-description text-muted-foreground">
                {crash && <li>The crash report from {lowerFirst(crash.when)}</li>}
                {caught && <li>The error from {caught}</li>}
                {attachments(props.projects).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <FieldDescription className="type-description">
                Only the Parity team sees reports. Choose what Parity shares in Settings &gt; Privacy.
              </FieldDescription>
            </section>
            {state.phase === "failed" && (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>{"Couldn't send the report"}</AlertTitle>
                <AlertDescription>Check your connection and try again.</AlertDescription>
              </Alert>
            )}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => props.onOpenChange(false)}>
              {crash ? "Not now" : "Cancel"}
            </Button>
            <Button type="submit" disabled={busy || props.description.trim() === ""}>
              {busy && <Spinner />}
              {busy ? "Sending…" : "Send report"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * What the dialog opened with: the window's screenshot, taken first so the dialog isn't in it, the crash if any, and
 * the Sentry event of the error a part of the window caught, when it's opened from that part's fallback (PAR-704), with
 * the part's label to name it by (PAR-757).
 */
interface Opened {
  screenshot?: string
  crash?: LastCrash
  crashTime?: string
  eventId?: string
  caught?: string
}

let opened: Opened = {}
const openedListeners = new Set<() => void>()

function setOpened(next: Opened): void {
  opened = next

  for (const listener of openedListeners) {
    listener()
  }
}

/** What the report is about, besides what the person writes. */
interface ReportSubject {
  /** The last run's crash, when Parity offers the report as it starts. */
  crash?: { time: string }
  /** The Sentry event of the error a fallback caught, which the feedback is linked to (PAR-704). */
  eventId?: string
  /** The label of the part whose fallback caught that error, which the dialog names it by (PAR-757). */
  label?: string
}

/** Help > Report a problem, and the same report offered after a crash or from an error's fallback. */
export async function openReport({ crash, eventId, label }: ReportSubject = {}): Promise<void> {
  let screenshot: string | undefined
  await menusClosed()

  try {
    screenshot = (await window.canvasHost.report.prepare()).screenshot
  } catch {
    // The report goes without a screenshot.
  }

  const next: Opened = {}

  if (screenshot) {
    next.screenshot = screenshot
  }

  if (crash) {
    next.crash = { when: crashTime(crash.time) }
    next.crashTime = crash.time
  }

  // The dialog names the error only when the report is linked to it.
  if (eventId) {
    next.eventId = eventId

    if (label) {
      next.caught = label
    }
  }

  setOpened(next)
  openDialog("report")
}

/** Waits for the menu the report was opened from to finish closing, so the screenshot shows the window under it. */
async function menusClosed(): Promise<void> {
  for (let waited = 0; waited < 500 && document.querySelector('[role="menu"]'); waited += 50) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

/** As the window starts: offers the report when the last run crashed. Main tells only the first window. */
export function offerLastCrashReport(): void {
  void window.canvasHost.report
    .lastCrash()
    .then((crash) => (crash ? openReport({ crash }) : undefined))
    .catch(() => undefined)
}

function useOpened() {
  return useSyncExternalStore(
    (listener) => {
      openedListeners.add(listener)

      return () => openedListeners.delete(listener)
    },
    () => opened
  )
}

/** The dialog as the app shows it: sends through main, which attaches the logs, versions and projects. */
export function ReportProblemDialog() {
  const open = useOpenDialog() === "report"
  const { screenshot: screenshotUrl, crash, crashTime: crashIso, eventId, caught } = useOpened()

  const projects = useTabs()
    .filter((tab) => !tab.blank && tab.status !== "error")
    .map((tab) => tab.title)

  const [state, setState] = useState<ReportPhase>({ phase: "editing" })
  const [description, setDescription] = useState("")
  const [screenshot, setScreenshot] = useState(true)

  const send = async () => {
    if (description.trim() === "") {
      return
    }

    setState({ phase: "sending" })

    try {
      await window.canvasHost.report.send({
        message: description.trim(),
        screenshot: screenshot && screenshotUrl !== undefined,
        afterCrash: crashIso !== undefined,
        ...(eventId ? { eventId } : {}),
        ...(await reportIds())
      })
      setState({ phase: "sent" })
    } catch (error) {
      console.warn("[report] couldn't send the report:", error)
      setState({ phase: "failed" })
    }
  }

  return (
    <ReportProblemView
      open={open}
      onOpenChange={(next) => {
        if (next) {
          return
        }

        closeDialog()
        setOpened({})
        // The next report starts afresh.
        setState({ phase: "editing" })
        setDescription("")
        setScreenshot(true)
      }}
      state={state}
      description={description}
      onDescriptionChange={setDescription}
      screenshot={screenshot}
      onScreenshotChange={setScreenshot}
      {...(screenshotUrl ? { screenshotUrl } : {})}
      projects={projects}
      {...(crash ? { crash } : {})}
      {...(caught ? { caught } : {})}
      onSend={() => void send()}
    />
  )
}
