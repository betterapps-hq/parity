import type { TelemetryLevel } from "@parity-app/telemetry"
import type { BrowserWindow } from "electron"
import { beforeEach, describe, expect, it, vi } from "vite-plus/test"

const sentry = vi.hoisted(() => {
  const scope = {
    setPropagationContext: vi.fn<(context: { traceId: string }) => void>(),
    setTags: vi.fn<(tags: Record<string, string>) => void>(),
    addEventProcessor:
      vi.fn<(processor: (event: { contexts?: Record<string, Record<string, unknown>> }) => unknown) => void>()
  }
  const options = { enabled: false }
  return {
    scope,
    options,
    getClient: () => ({ getOptions: () => options }),
    withScope: (work: (given: typeof scope) => unknown) => work(scope),
    captureFeedback: vi.fn<
      (feedback: { message: string; source: string }, hint: { attachments: { filename: string }[] }) => string
    >(() => "fb1"),
    flush: vi.fn<() => Promise<boolean>>(async () => true)
  }
})

vi.mock("@sentry/electron/main", () => sentry)
vi.mock("electron", () => ({ app: { getVersion: () => "1.2.3" } }))
vi.mock("./telemetry.ts", () => ({ scrubber: { value: (text: string) => text } }))

const { createReports, feedbackLink, reportsOff } = await import("./report.ts")

/** The editor window, whose screenshot is a few bytes. */
const window = {
  webContents: { capturePage: async () => ({ isEmpty: () => false, toPNG: () => Buffer.from("window") }) }
} as unknown as BrowserWindow

function reports(level: TelemetryLevel = "all") {
  const track = vi.fn<(name: string, attributes: Record<string, unknown>) => void>()
  const created = createReports({
    readEvents: () => [],
    flushLogs: () => undefined,
    sessionId: "s1",
    offerCrash: false,
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
    const event = { contexts: { feedback: {} as Record<string, unknown> } }
    sentry.scope.addEventProcessor.mock.calls[0]![0](event)
    expect(event.contexts.feedback.replay_id).toBe("r1")
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
