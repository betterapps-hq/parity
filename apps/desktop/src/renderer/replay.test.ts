import { describe, expect, it, vi } from "vite-plus/test"

/**
 * The client Replay is added to, as Sentry's does it: an integration added after `init` is set up at once, and Replay
 * looks for the canvas recorder as it's set up (`_maybeLoadFromReplayCanvasIntegration` in `@sentry/replay`). Once it's
 * added, `getReplay` gives a replay that says what was asked of it, records whole sessions or a buffer as Sentry's does,
 * and keeps the tags on the scope when it was flushed.
 */
const sentry = vi.hoisted(() => {
  const added: string[] = []
  const replay = { recordsCanvas: false }
  const asked: string[] = []
  const scopeTags: Record<string, string> = {}
  let flushedWith: Record<string, string> | undefined
  let mode: "session" | "buffer" | undefined

  const recorder = {
    start() {
      asked.push("start")
      mode = "session"
    },
    startBuffering() {
      asked.push("startBuffering")
      mode = "buffer"
    },
    async stop() {
      asked.push("stop")
      mode = undefined
    },
    async flush(options?: { continueRecording?: boolean }) {
      asked.push(options?.continueRecording === false ? "flush, then stop recording" : "flush")
      flushedWith = { ...scopeTags }
    },
    getRecordingMode: () => mode,
    getReplayId: () => (mode ? "4d1c0f7e" : undefined)
  }

  return {
    added,
    replay,
    asked,
    flushedWith: () => flushedWith,
    reset() {
      added.length = 0
      asked.length = 0
      flushedWith = undefined
      mode = undefined
    },
    addIntegration(integration: { name: string; afterAllSetup?: () => void }) {
      added.push(integration.name)
      integration.afterAllSetup?.()
    },
    replayCanvasIntegration: () => ({ name: "ReplayCanvas" }),
    replayIntegration: () => ({
      name: "Replay",
      afterAllSetup() {
        replay.recordsCanvas = added.includes("ReplayCanvas")
      }
    }),
    getReplay: () => (added.includes("Replay") ? recorder : undefined),
    async withScope<T>(callback: (scope: { setTags(tags: Record<string, string>): void }) => Promise<T>): Promise<T> {
      try {
        return await callback({ setTags: (tags) => Object.assign(scopeTags, tags) })
      } finally {
        for (const name of Object.keys(scopeTags)) {
          delete scopeTags[name]
        }
      }
    },
    getCurrentScope: () => ({ getPropagationContext: () => ({ traceId: "9a2e61c4" }) })
  }
})

vi.mock("@sentry/electron/renderer", () => sentry)

const { replayPrivacy, pageHolds, zoomHold, followTelemetry } = await import("./replay.ts")

const key = "sk-proj-4fT9xQ2mLw8ZpR7vK3nB6yH1"

/** `replay.ts` as a window loads it, recording nothing yet. */
async function freshReplay() {
  vi.resetModules()
  sentry.reset()

  return import("./replay.ts")
}

describe("Session Replay in CI (PAR-1043)", () => {
  it("keeps the last minute in a buffer, rather than recording whole sessions, and sends nothing for an error", async () => {
    const { followTelemetry, replaySampling } = await freshReplay()
    followTelemetry({ level: "all", errorsOnly: true })
    expect(sentry.asked).toEqual(["startBuffering"])
    expect(replaySampling.replaysOnErrorSampleRate).toBe(0)
  })

  it("sends the buffer as a replay of its own, with a failed test's tags, and goes on buffering", async () => {
    const { followTelemetry, sendReplay } = await freshReplay()
    followTelemetry({ level: "all", errorsOnly: true })
    const id = await sendReplay({ e2e_test: "moving > drags a card", test_run: "github-1-1" })
    expect(id).toBe("4d1c0f7e")
    expect(sentry.flushedWith()).toEqual({ e2e_test: "moving > drags a card", test_run: "github-1-1" })
    expect(sentry.asked).toEqual(["startBuffering", "flush, then stop recording", "stop", "startBuffering"])
  })

  it("ties a report to its replay without going on to record whole sessions", async () => {
    const { followTelemetry, reportIds } = await freshReplay()
    followTelemetry({ level: "all", errorsOnly: true })
    expect(await reportIds()).toEqual({ replayId: "4d1c0f7e", traceId: "9a2e61c4" })
    expect(sentry.asked.at(-1)).toBe("startBuffering")
  })

  it("records whole sessions outside CI, and sends what's waiting while it goes on recording", async () => {
    const { followTelemetry, sendReplay } = await freshReplay()
    followTelemetry({ level: "all" })
    expect(await sendReplay()).toBe("4d1c0f7e")
    expect(sentry.asked).toEqual(["start", "flush"])
  })

  it("names no replay while the window isn't recording", async () => {
    const { followTelemetry, sendReplay } = await freshReplay()
    followTelemetry({ level: "off", errorsOnly: true })
    expect(await sendReplay({ e2e_test: "moving > drags a card" })).toBeUndefined()
    expect(sentry.asked).toEqual([])
  })
})

describe("Session Replay's canvases (PAR-964)", () => {
  it("records the window's canvases, since the canvas recorder is there when Replay looks for it", () => {
    followTelemetry({ level: "all" })
    expect(sentry.replay.recordsCanvas).toBe(true)
  })
})

describe("Session Replay's secrets (PAR-679)", () => {
  it("records the window's text as written, with its secrets scrubbed", () => {
    expect(replayPrivacy.maskFn(`Saved OPENAI_API_KEY ${key} for Button.tsx`)).toBe(
      "Saved OPENAI_API_KEY [redacted] for Button.tsx"
    )
    expect(replayPrivacy.maskFn("primary-foreground")).toBe("primary-foreground")
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

  // SAFETY: the holds call `later` only with a callback and a delay, and `cancel` only with what `later` returned.
  return {
    later: ((run: () => void, ms: number) => {
      due.set(++next, { at: now + ms, run })

      return next
    }) as typeof setTimeout,
    cancel: ((id: number) => void due.delete(id)) as typeof clearTimeout,
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

/** A zoom's hold on a fake recorder, with timers and the window's idle time run by hand: `goIdle` runs what waits. */
function zoomHolds() {
  const recorder = fakeRecorder()
  const timers = fakeTimers()
  const waiting = new Map<number, () => void>()
  let next = 0

  const zoom = zoomHold(
    pageHolds(() => recorder, timers),
    {
      ...timers,
      lingerMs: 1000,
      idle: (run) => {
        waiting.set(++next, run)

        return next
      },
      cancelIdle: (id) => void waiting.delete(id)
    }
  )

  const goIdle = () => {
    const runs = [...waiting.values()]
    waiting.clear()
    runs.forEach((run) => run())
    timers.elapse(0)
  }

  return { recorder, timers, zoom, goIdle }
}

describe("Session Replay held while the canvas zooms (PAR-957)", () => {
  it("pauses recording while the zoom moves and resumes once it has settled a while and the window is idle", () => {
    const { recorder, timers, zoom, goIdle } = zoomHolds()
    zoom.zooming()
    zoom.zooming()
    expect(recorder.asked).toEqual(["pause"])
    zoom.settled()
    goIdle()
    timers.elapse(999)
    goIdle()
    expect(recorder.asked).toEqual(["pause"])
    timers.elapse(1)
    expect(recorder.asked).toEqual(["pause"])
    goIdle()
    expect(recorder.asked).toEqual(["pause", "resume"])
  })

  it("stays paused through a zoom that starts again before it resumes", () => {
    const { recorder, timers, zoom, goIdle } = zoomHolds()
    zoom.zooming()
    zoom.settled()
    timers.elapse(500)
    zoom.zooming()
    timers.elapse(5000)
    goIdle()
    expect(recorder.asked).toEqual(["pause"])
    zoom.settled()
    timers.elapse(1000)
    zoom.zooming()
    goIdle()
    expect(recorder.asked).toEqual(["pause"])
    zoom.settled()
    zoom.settled()
    timers.elapse(1000)
    goIdle()
    expect(recorder.asked).toEqual(["pause", "resume"])
  })

  it("resumes at once when the canvas goes, and leaves alone a zoom that never moved", () => {
    const { recorder, timers, zoom, goIdle } = zoomHolds()
    zoom.settled()
    timers.elapse(2000)
    goIdle()
    expect(recorder.asked).toEqual([])
    zoom.zooming()
    zoom.end()
    timers.elapse(0)
    expect(recorder.asked).toEqual(["pause", "resume"])
  })
})
