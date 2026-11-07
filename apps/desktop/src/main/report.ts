import { arch, release } from "node:os"
import {
  type Crash,
  diagnosticFiles,
  type LoggedEvent,
  lastRunCrash,
  type registeredEvents,
  type Telemetry
} from "@parity-app/telemetry"
import * as Sentry from "@sentry/electron/main"
import { app, type BrowserWindow } from "electron"
import type { ProblemReport } from "../shared/ipc-checks.ts"
import type { ReportCrash } from "../shared/protocol.ts"
import { scrubber } from "./telemetry.ts"

/**
 * Help > Report a problem (PAR-635): a Sentry user feedback with what the person wrote, a screenshot of the window, the
 * last hour of the local copy, the versions and the open projects, tied to the window's replay and trace. Sentry files
 * it in Linear. When the last run crashed, the window offers the same report as it starts, with the crash.
 */

/** A file that goes with the feedback, as Sentry takes it. */
interface Attachment {
  filename: string
  contentType: string
  data: string | Uint8Array
}

/** How long a report may take to reach Sentry before it's said to have failed, in milliseconds. */
const sendTimeoutMs = 15_000

export interface Reports {
  /** Takes the window's screenshot as the dialog opens, so the dialog isn't in it. */
  prepare(window: BrowserWindow): Promise<{ screenshot?: string }>
  /** Sends the report, giving its feedback ID. Throws when it can't be sent. */
  send(window: BrowserWindow, report: ProblemReport): Promise<string>
  /** The last run's crash, once: a window asks as it starts, and only the first one is told. */
  takeLastCrash(): ReportCrash | undefined
}

/** Whether a crash on the last run is offered: only in installed builds, where testers run Parity, not agents or CI. */
export function offersCrashReports(environment: string): boolean {
  return environment === "tester"
}

export function createReports({
  readEvents,
  flushLogs,
  sessionId,
  offerCrash,
  telemetry
}: {
  /** The local copy's events, oldest first. */
  readEvents: () => LoggedEvent[]
  flushLogs: () => void
  /** This run's, which isn't the last one. */
  sessionId: string
  offerCrash: boolean
  telemetry: Telemetry<typeof registeredEvents>
}): Reports {
  const screenshots = new WeakMap<BrowserWindow, Electron.NativeImage>()
  // Read once, as the app starts, before this run's own events could be mistaken for it.
  let crash: Crash | undefined = offerCrash ? lastRunCrash(readEvents(), sessionId) : undefined
  let offered = false
  return {
    async prepare(window) {
      const image = await window.webContents.capturePage()
      screenshots.set(window, image)
      return image.isEmpty() ? {} : { screenshot: image.toDataURL() }
    },
    async send(window, report) {
      flushLogs()
      const files = diagnosticFiles({
        events: readEvents(),
        now: Date.now(),
        versions: versions(),
        ...(report.afterCrash && crash ? { crash } : {})
      })
      const attachments: Attachment[] = files.map((file) => ({
        filename: file.name,
        contentType: file.contentType,
        data: scrubber.value(file.text)
      }))
      const image = screenshots.get(window)
      if (report.screenshot && image && !image.isEmpty()) {
        attachments.unshift({ filename: "screenshot.png", contentType: "image/png", data: image.toPNG() })
      }
      screenshots.delete(window)
      const feedbackId = await sendFeedback(report, attachments)
      if (report.afterCrash) crash = undefined
      telemetry.track("report.sent", {
        feedbackId,
        screenshot: attachments.some((attachment) => attachment.filename === "screenshot.png"),
        afterCrash: report.afterCrash
      })
      return feedbackId
    },
    takeLastCrash() {
      if (!crash || offered) return undefined
      offered = true
      return { time: crash.time }
    }
  }
}

/**
 * Sends the feedback, even with Telemetry set to Off: the person asked to send it, and sees what goes with it. Sentry
 * is switched on only while it's sent.
 */
async function sendFeedback(report: ProblemReport, attachments: Attachment[]): Promise<string> {
  const options = Sentry.getClient()?.getOptions()
  if (!options) throw new Error("Sentry isn't running")
  const wasEnabled = options.enabled
  options.enabled = true
  try {
    const feedbackId = Sentry.withScope((scope) => {
      if (report.traceId) scope.setPropagationContext({ traceId: report.traceId, sampleRand: Math.random() })
      scope.setTag("report", report.afterCrash ? "after crash" : "help menu")
      if (report.replayId) {
        const replayId = report.replayId
        scope.addEventProcessor((event) => {
          // Sentry shows the replay beside a feedback that names it.
          const feedback = event.contexts?.feedback
          if (feedback) feedback.replay_id = replayId
          return event
        })
      }
      return Sentry.captureFeedback({ message: report.message, source: "report-a-problem" }, { attachments }, scope)
    })
    if (!(await Sentry.flush(sendTimeoutMs))) throw new Error("The report didn't reach Sentry in time")
    return feedbackId
  } finally {
    options.enabled = wasEnabled
  }
}

/** The versions a report names. */
function versions(): { parity: string; [part: string]: string } {
  return {
    parity: app.getVersion(),
    electron: process.versions.electron ?? "unknown",
    chromium: process.versions.chrome ?? "unknown",
    node: process.versions.node,
    system: `${process.platform} ${release()} ${arch()}`
  }
}
