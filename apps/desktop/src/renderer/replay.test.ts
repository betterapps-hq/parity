import { describe, expect, it, vi } from "vite-plus/test"

vi.mock("@sentry/electron/renderer", () => ({}))

const { replayPrivacy, pageHolds } = await import("./replay.ts")
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

/** A page recorder that says what was asked of it, as Replay's does. */
function fakeRecorder({ enabled = true } = {}) {
  const asked: string[] = []
  let paused = false

  return {
    asked,
    isEnabled: () => enabled,
    isPaused: () => paused,
    pause() {
      paused = true
      asked.push("pause")
    },
    resume() {
      paused = false
      asked.push("resume")
    }
  }
}

/** Timers run by hand: `elapse` runs what's due. */
function fakeTimers() {
  let now = 0
  const due = new Map<number, { at: number; run: () => void }>()
  let next = 0

  return {
    later: ((run: () => void, ms: number) => {
      due.set(++next, { at: now + ms, run })

      return next
    }) as unknown as typeof setTimeout,
    cancel: ((id: number) => void due.delete(id)) as unknown as typeof clearTimeout,
    elapse(ms: number) {
      now += ms

      for (const [id, timer] of due) {
        if (timer.at > now) {
          continue
        }

        due.delete(id)
        timer.run()
      }
    }
  }
}

describe("Session Replay held while a canvas mounts (PAR-758)", () => {
  it("pauses recording the page until the last hold is let go of, and resumes the same replay after that task", () => {
    const recorder = fakeRecorder()
    const timers = fakeTimers()
    const hold = pageHolds(() => recorder, timers)
    const first = hold()
    const second = hold()
    first()
    first()
    timers.elapse(0)
    expect(recorder.asked).toEqual(["pause"])
    second()
    expect(recorder.asked).toEqual(["pause"])
    timers.elapse(0)
    expect(recorder.asked).toEqual(["pause", "resume"])
  })

  it("stays paused for a hold taken before it resumes", () => {
    const recorder = fakeRecorder()
    const timers = fakeTimers()
    const hold = pageHolds(() => recorder, timers)
    hold()()
    const next = hold()
    timers.elapse(0)
    expect(recorder.asked).toEqual(["pause"])
    next()
    timers.elapse(0)
    expect(recorder.asked).toEqual(["pause", "resume"])
  })

  it("resumes after the longest hold when a first frame never comes", () => {
    const recorder = fakeRecorder()
    const timers = fakeTimers()
    const release = pageHolds(() => recorder, { ...timers, longestMs: 5000 })()
    timers.elapse(4999)
    expect(recorder.isPaused()).toBe(true)
    timers.elapse(1)
    expect(recorder.asked).toEqual(["pause", "resume"])
    release()
    timers.elapse(0)
    expect(recorder.asked).toEqual(["pause", "resume"])
  })

  it("leaves alone a recorder that isn't recording, or one Replay already resumed or replaced", () => {
    const idle = fakeRecorder({ enabled: false })
    const idleTimers = fakeTimers()
    pageHolds(() => idle, idleTimers)()()
    idleTimers.elapse(0)
    expect(idle.asked).toEqual([])

    let current: ReturnType<typeof fakeRecorder> | undefined = fakeRecorder()
    const held = current
    const timers = fakeTimers()
    const hold = pageHolds(() => current, timers)
    const release = hold()
    held.resume()
    release()
    timers.elapse(0)
    expect(held.asked).toEqual(["pause", "resume"])

    const turnedOff = hold()
    current = undefined
    turnedOff()
    timers.elapse(0)
    expect(held.asked).toEqual(["pause", "resume", "pause"])
  })
})
