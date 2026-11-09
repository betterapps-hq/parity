import { arch, release } from "node:os"
import type { ReportSent } from "@parity-app/agent"
import { CodedError } from "@parity-app/core"
import {
  type Crash,
  diagnosticFiles,
  type LoggedEvent,
  lastRunCrash,
  type registeredEvents,
  type ReportVersions,
  type Telemetry,
  type TelemetryLevel
} from "@parity-app/telemetry"
import * as Sentry from "@sentry/electron/main"
import { app, type BrowserWindow } from "electron"
import type { ProblemReport } from "../shared/ipc-checks.ts"
import type { ReportCrash } from "../shared/protocol.ts"
import type { MainMethods } from "../shared/service.ts"
import { scrubber } from "./telemetry.ts"

/**
 * Help > Report a problem (PAR-635): a Sentry user feedback with what the person wrote, a screenshot of the window, the
 * last hour of the local copy, the versions and the open projects, tied to the window's replay and trace. Sentry files
 * it in Linear. When the last run crashed, the window offers the same report as it starts, with the crash.
 *
 * Agents send the same report with `parity report` and MCP's `report_problem` (PAR-646), through the project service:
 * tied to their call's trace, tagged with what it's about, and with the frames of the design they name.
 */

/** A file that goes with the feedback, as Sentry takes it. */
interface Attachment {
  filename: string
  contentType: string
  data: string | Uint8Array
}

/** How long a report may take to reach Sentry before it's said to have failed, in milliseconds. */
const sendTimeoutMs = 15_000

/** An agent's report, as the service sends it on. */
export type AgentProblem = MainMethods["report"]["params"]

/** What a report tells Sentry besides its files: who sent it, what it's about, and the trace and replay it's tied to. */
interface Feedback {
  message: string
  /** Sentry's feedback source, which tells a person's report from an agent's. */
  source: "report-a-problem" | "parity-report"
  tags: Record<string, string>
  traceId?: string | undefined
  replayId?: string | undefined
  /** The error the report is about, which Sentry links the feedback to (PAR-704). */
  eventId?: string | undefined
}

/**
 * Where a feedback is in Sentry, by its event ID. Sentry finds the event's issue from it once it's processed, a few
 * seconds after it's sent.
 */
export function feedbackLink(feedbackId: string): string {
  return `https://sentry.io/organizations/better-apps/projects/parity-desktop/events/${feedbackId}/`
}

/** Why an agent's report isn't sent while Telemetry is off. */
export const reportsOff =
  "Share diagnostics is off in Parity's settings, so agents' reports aren't sent. Tell the person what's wrong instead, or run parity diagnostics for a zip they can attach to a bug."

export interface Reports {
  /** Takes the window's screenshot as the dialog opens, so the dialog isn't in it. */
  prepare(window: BrowserWindow): Promise<{ screenshot?: string }>
  /** Sends the report, giving its feedback ID. Throws when it can't be sent. */
  send(window: BrowserWindow, report: ProblemReport): Promise<string>
  /**
   * Sends an agent's report with the window's screenshot as it is now, the frames it drew and the diagnostics. Refused
   * while Telemetry is off: unlike the person's own report, nobody chose to send this one.
   */
  sendForAgent(window: BrowserWindow, problem: AgentProblem): Promise<ReportSent>
  /** The last run's crash, once: a window asks as it starts, and only the first one is told. */
  takeLastCrash(): ReportCrash | undefined
}

/** Whether a crash on the last run is offered: only in installed builds, where testers run Parity, not agents or CI. */
export function offersCrashReports(environment: string): boolean {
  return environment === "preview" || environment === "release"
}

export function createReports({
  readEvents,
  flushLogs,
  sessionId,
  offerCrash,
  telemetry,
  level
}: {
  /** The local copy's events, oldest first. */
  readEvents: () => LoggedEvent[]
  flushLogs: () => void
  /** This run's, which isn't the last one. */
  sessionId: string
  offerCrash: boolean
  telemetry: Telemetry<typeof registeredEvents>
  /** This run's Telemetry level, which the person can change while it runs. */
  level: () => TelemetryLevel
}): Reports {
  const screenshots = new WeakMap<BrowserWindow, Electron.NativeImage>()
  // Read once, as the app starts, before this run's own events could be mistaken for it.
  let crash: Crash | undefined = offerCrash ? lastRunCrash(readEvents(), sessionId) : undefined
  let offered = false

  /** The last hour of the local copy, the versions and the open projects, with the crash when one goes with them. */
  const diagnostics = (withCrash: Crash | undefined): Attachment[] => {
    flushLogs()

    const files = diagnosticFiles({ events: readEvents(), now: Date.now(), versions: versions(), crash: withCrash })

    return files.map((file) => ({
      filename: file.name,
      contentType: file.contentType,
      data: scrubber.value(file.text)
    }))
  }

  return {
    async prepare(window) {
      const image = await window.webContents.capturePage()
      screenshots.set(window, image)

      return image.isEmpty() ? {} : { screenshot: image.toDataURL() }
    },
    async send(window, report) {
      const attachments = diagnostics(report.afterCrash ? crash : undefined)
      const image = screenshots.get(window)

      if (report.screenshot && image && !image.isEmpty()) {
        attachments.unshift(screenshotFile(image))
      }

      screenshots.delete(window)

      const feedbackId = await sendFeedback(
        {
          message: report.message,
          source: "report-a-problem",
          tags: { report: reportFrom(report) },
          traceId: report.traceId,
          replayId: report.replayId,
          eventId: report.eventId
        },
        attachments
      )

      if (report.afterCrash) {
        crash = undefined
      }

      telemetry.track("report.sent", {
        feedbackId,
        screenshot: attachments.some((attachment) => attachment.filename === "screenshot.png"),
        afterCrash: report.afterCrash,
        by: "person"
      })

      return feedbackId
    },
    async sendForAgent(window, problem) {
      if (level() === "off") {
        throw new CodedError(reportsOff, { code: "app_error" })
      }

      const attachments = diagnostics(undefined)

      const frames = problem.frames.map((frame) => ({
        filename: frame.name,
        contentType: "image/png",
        data: Buffer.from(frame.png, "base64")
      }))

      attachments.unshift(...frames)
      const image = await window.webContents.capturePage()

      if (!image.isEmpty()) {
        attachments.unshift(screenshotFile(image))
      }

      const feedbackId = await sendFeedback(
        {
          message: problem.message,
          source: "parity-report",
          tags: { ...problem.tags, report: "agent" },
          traceId: problem.traceId,
          replayId: problem.replayId
        },
        attachments
      )

      telemetry.track("report.sent", { feedbackId, screenshot: !image.isEmpty(), afterCrash: false, by: "agent" })

      const sent: ReportSent = {
        feedbackId,
        link: feedbackLink(feedbackId),
        attachments: attachments.map((attachment) => attachment.filename)
      }

      if (problem.traceId) {
        sent.traceId = problem.traceId
      }

      if (problem.replayId) {
        sent.replayId = problem.replayId
      }

      return sent
    },
    takeLastCrash() {
      if (!crash || offered) {
        return undefined
      }

      offered = true

      return { time: crash.time }
    }
  }
}

/**
 * Sends the feedback, even with Telemetry set to Off: the person asked to send it, and sees what goes with it. Sentry
 * is switched on only while it's sent.
 */
async function sendFeedback(report: Feedback, attachments: Attachment[]): Promise<string> {
  const options = Sentry.getClient()?.getOptions()

  if (!options) {
    throw new CodedError("Sentry isn't running, so the report can't be sent", { code: "app_error" })
  }

  const wasEnabled = options.enabled
  options.enabled = true

  try {
    const feedbackId = Sentry.withScope((scope) => {
      if (report.traceId) {
        scope.setPropagationContext({ traceId: report.traceId, sampleRand: Math.random() })
      }

      scope.setTags(report.tags)

      if (report.replayId) {
        const replayId = report.replayId
        scope.addEventProcessor((event) => {
          // Sentry shows the replay beside a feedback that names it.
          const feedback = event.contexts?.feedback

          if (feedback) {
            feedback.replay_id = replayId
          }

          return event
        })
      }

      const feedback: Parameters<typeof Sentry.captureFeedback>[0] = { message: report.message, source: report.source }

      // Sentry shows the feedback on the error's issue.
      if (report.eventId) {
        feedback.associatedEventId = report.eventId
      }

      return Sentry.captureFeedback(feedback, { attachments }, scope)
    })

    if (!(await Sentry.flush(sendTimeoutMs))) {
      throw new CodedError("The report didn't reach Sentry in time", { code: "app_error", retryable: true })
    }

    return feedbackId
  } finally {
    options.enabled = wasEnabled
  }
}

/** Where the person sent their report from, for its `report` tag. */
function reportFrom(report: ProblemReport): string {
  if (report.afterCrash) {
    return "after crash"
  }

  return report.eventId ? "error fallback" : "help menu"
}

function screenshotFile(image: Electron.NativeImage): Attachment {
  return { filename: "screenshot.png", contentType: "image/png", data: image.toPNG() }
}

/** The versions a report names. */
function versions(): ReportVersions {
  return {
    parity: app.getVersion(),
    electron: process.versions.electron ?? "unknown",
    chromium: process.versions.chrome ?? "unknown",
    node: process.versions.node,
    system: `${process.platform} ${release()} ${arch()}`
  }
}
