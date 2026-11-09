import type { Envelope, TelemetryLevel } from "@parity-app/telemetry"
import type { BrowserWindow } from "electron"
import { beforeEach, describe, expect, it, vi } from "vite-plus/test"

/** The part of a Sentry event a report's processor changes: the feedback's replay. */
interface FeedbackEvent {
  contexts?: { feedback?: { replay_id?: string } }
}

const sentry = vi.hoisted(() => {
  const scope = {
    setPropagationContext: vi.fn<(context: { traceId: string }) => void>(),
    setTags: vi.fn<(tags: Record<string, string>) => void>(),
    addEventProcessor: vi.fn<(processor: (event: FeedbackEvent) => FeedbackEvent) => void>()
  }

  const options = { enabled: false }

  return {
    scope,
    options,
    getClient: () => ({ getOptions: () => options }),
    withScope: <Result>(work: (given: typeof scope) => Result) => work(scope),
    captureFeedback: vi.fn<
      (
        feedback: { message: string; source: string; associatedEventId?: string },
        hint: { attachments: { filename: string }[] }
      ) => string
    >(() => "fb1"),
    flush: vi.fn<() => Promise<boolean>>(async () => true)
  }
})

vi.mock("@sentry/electron/main", () => sentry)

vi.mock("electron", () => ({ app: { getVersion: () => "1.2.3" } }))

vi.mock("./telemetry.ts", () => ({ scrubber: { value: (text: string) => text } }))

const { createReports, feedbackLink, offersCrashReports, reportsOff } = await import("./report.ts")

/** The editor window, whose screenshot is a few bytes. */
// SAFETY: reports only capture the window's page, and only ask the picture whether it's empty and for its PNG.
const window: BrowserWindow = {
  webContents: { capturePage: async () => ({ isEmpty: () => false, toPNG: () => Buffer.from("window") }) }
} as never

function reports(level: TelemetryLevel = "all") {
  const track = vi.fn<(name: string, attributes: Envelope["attributes"]) => void>()

  const created = createReports({
    readEvents: () => [],
    flushLogs: () => undefined,
    sessionId: "s1",
    offerCrash: false,
    // SAFETY: reports only track events with the telemetry they're given.
    telemetry: { track } as never,
    level: () => level
  })

  return { created, track }
}

const problem = {
  message: "The title is cut off",
  tags: { tab: "Shop", design: "signup", test_run: "pass-7" },
  frames: [{ name: "signup default mobile.png", png: Buffer.from("frame").toString("base64") }],
  traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
  replayId: "r1"
}

describe("crash reports offered after a crash", () => {
  it("are offered in every installed build, production included, and never in a checkout or CI", () => {
    expect(["preview", "release", "production"].map(offersCrashReports)).toEqual([true, true, true])
    expect(["development", "ci"].map(offersCrashReports)).toEqual([false, false])
  })
})

describe("an agent's report (PAR-646)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sentry.options.enabled = false
    sentry.flush.mockResolvedValue(true)
  })

  it("sends a feedback tied to the call's trace and the window's replay, tagged as an agent's", async () => {
    const { created, track } = reports()
    const sent = await created.sendForAgent(window, problem)
    const [feedback, hint] = sentry.captureFeedback.mock.calls[0]!
    expect(feedback).toEqual({ message: "The title is cut off", source: "parity-report" })
    expect(sentry.scope.setTags).toHaveBeenCalledWith({ ...problem.tags, report: "agent" })
    expect(sentry.scope.setPropagationContext).toHaveBeenCalledWith(
      expect.objectContaining({ traceId: problem.traceId })
    )
    const event: FeedbackEvent = { contexts: { feedback: {} } }
    sentry.scope.addEventProcessor.mock.calls[0]![0](event)
    expect(event.contexts?.feedback?.replay_id).toBe("r1")
    const names = hint.attachments.map((attachment) => attachment.filename)
    expect(names.slice(0, 2)).toEqual(["screenshot.png", "signup default mobile.png"])
    expect(sent).toEqual({
      feedbackId: "fb1",
      link: feedbackLink("fb1"),
      traceId: problem.traceId,
      replayId: "r1",
      attachments: names
    })
    expect(track).toHaveBeenCalledWith("report.sent", {
      feedbackId: "fb1",
      screenshot: true,
      afterCrash: false,
      by: "agent"
    })
    // Sentry is only switched on while the report goes.
    expect(sentry.options.enabled).toBe(false)
  })

  it("isn't sent while Telemetry is off, saying what to do instead", async () => {
    const { created } = reports("off")
    const refused = created.sendForAgent(window, problem)
    await expect(refused).rejects.toThrow(reportsOff)
    await expect(refused).rejects.toMatchObject({ details: { code: "app_error", retryable: false } })
    expect(sentry.captureFeedback).not.toHaveBeenCalled()
  })

  it("fails as retryable when it doesn't reach Sentry in time", async () => {
    sentry.flush.mockResolvedValue(false)
    const { created, track } = reports()
    const failed = created.sendForAgent(window, problem)
    await expect(failed).rejects.toMatchObject({ details: { code: "app_error", retryable: true } })
    expect(track).not.toHaveBeenCalled()
  })

  it("links the feedback by its event ID in parity-desktop", () => {
    expect(feedbackLink("0a1b")).toBe(
      "https://sentry.io/organizations/better-apps/projects/parity-desktop/events/0a1b/"
    )
  })
})

describe("a person's report (PAR-635)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sentry.flush.mockResolvedValue(true)
  })

  const report = { message: "Layers went blank", screenshot: false, afterCrash: false }

  it("links a report from an error's fallback to that error's event, so Sentry shows it on the issue (PAR-704)", async () => {
    const eventId = "0123456789abcdef0123456789abcdef"
    await reports().created.send(window, { ...report, eventId })
    expect(sentry.captureFeedback.mock.calls[0]![0]).toEqual({
      message: "Layers went blank",
      source: "report-a-problem",
      associatedEventId: eventId
    })
    expect(sentry.scope.setTags).toHaveBeenCalledWith({ report: "error fallback" })
  })

  it("sends a report from the Help menu linked to no event", async () => {
    await reports().created.send(window, report)
    expect(sentry.captureFeedback.mock.calls[0]![0]).toEqual({
      message: "Layers went blank",
      source: "report-a-problem"
    })
    expect(sentry.scope.setTags).toHaveBeenCalledWith({ report: "help menu" })
  })
})
