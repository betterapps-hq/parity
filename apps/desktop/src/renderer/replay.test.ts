import { describe, expect, it, vi } from "vite-plus/test"

vi.mock("@sentry/electron/renderer", () => ({}))

const { replayPrivacy } = await import("./replay.ts")
const { scrubber } = await import("./telemetry.ts")

const key = "sk-proj-4fT9xQ2mLw8ZpR7vK3nB6yH1"

describe("Session Replay's secrets (PAR-679)", () => {
  it("records the window's text as written, with its secrets scrubbed", () => {
    expect(replayPrivacy.maskFn(`Saved OPENAI_API_KEY ${key} for Button.tsx`)).toBe(
      "Saved OPENAI_API_KEY [redacted] for Button.tsx"
    )
    expect(replayPrivacy.maskFn("primary-foreground")).toBe("primary-foreground")
  })

  it("scrubs the open project's .env values once main passes them on", () => {
    const value = "staging-db-7781.internal"
    expect(replayPrivacy.maskFn(`Connecting to ${value}`)).toBe(`Connecting to ${value}`)
    scrubber.use([value])
    expect(replayPrivacy.maskFn(`Connecting to ${value}`)).toBe("Connecting to [redacted]")
    scrubber.use([])
  })

  it("scrubs what Replay adds beside the page, such as a click's breadcrumb", () => {
    const click = {
      type: 5,
      timestamp: 1,
      data: { tag: "breadcrumb", payload: { category: "ui.click", message: `button "Copy ${key}"` } }
    }

    expect(replayPrivacy.beforeAddRecordingEvent(click)).toEqual({
      type: 5,
      timestamp: 1,
      data: { tag: "breadcrumb", payload: { category: "ui.click", message: 'button "Copy [redacted]"' } }
    })
  })
})
