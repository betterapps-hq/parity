import { createScrubber, sentryScrubbing, transactionOf } from "@parity-app/telemetry"
import * as Sentry from "@sentry/node"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

// `sentryScrubbing` lives in @parity-app/telemetry, which never imports Sentry, so it's checked here against the SDK
// the CLI sends with. Main and the service run the same SDK under @sentry/electron (PAR-756).

const key = "sk-proj-par756FakeKeyAbCdEfGhIjKlMnOp0123"

/** Starts Sentry as a Parity process does, with tracing on, and gives back what it sends, as JSON. */
function startSentry(): { sent: () => Promise<string> } {
  const envelopes: unknown[] = []
  Sentry.init({
    dsn: "https://public@sentry.example.com/1",
    defaultIntegrations: false,
    enableOpenTelemetrySetup: false,
    sendClientReports: false,
    // Parity sets no sample rate today; this makes Sentry's own spans as an integration would once tracing is on.
    tracesSampleRate: 1,
    transport: () => ({
      send: async (envelope) => {
        envelopes.push(envelope)

        return {}
      },
      flush: async () => true
    }),
    ...sentryScrubbing(createScrubber(), Sentry)
  })

  return {
    sent: async () => {
      await Sentry.flush(1000)

      return JSON.stringify(envelopes)
    }
  }
}

afterEach(async () => {
  await Sentry.close()
  vi.restoreAllMocks()
})

describe("sentryScrubbing", () => {
  it("scrubs Sentry's own spans, which streaming would send past beforeSendTransaction", async () => {
    const sentry = startSentry()
    Sentry.startSpan({ name: `open ${key}`, attributes: { url: `https://example.com/?access_token=${key}` } }, () =>
      Sentry.startSpan({ name: `read ${key}`, attributes: { key } }, () => undefined)
    )
    const sent = await sentry.sent()
    expect(sent).toContain("open [redacted]")
    expect(sent).toContain("read [redacted]")
    expect(sent).not.toContain(key)
  })

  it("scrubs Parity's own spans, which go as transactions", async () => {
    const sentry = startSentry()
    Sentry.captureEvent(
      transactionOf({
        installId: "install",
        sessionId: "session",
        name: "agent.called",
        level: "info",
        process: "main",
        time: new Date().toISOString(),
        durationMs: 12,
        outcome: "ok",
        traceId: "0af7651916cd43dd8448eb211c80319c",
        spanId: "b7ad6b7169203331",
        attributes: { params: `{"token":"${key}"}` }
      })
    )
    const sent = await sentry.sent()
    expect(sent).toContain("agent.called")
    expect(sent).not.toContain(key)
  })

  it("starts without Sentry's warning that beforeSendTransaction is ignored", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    startSentry()
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("beforeSendTransaction"))
  })
})
