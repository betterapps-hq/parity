import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import type { RenderJob } from "../../shared/protocol.ts"
import { preloadAnswers } from "../service.ts"
import { capture, failed, holdsFirstDraw, stored, type UndrawnFrame, want } from "./frame-bitmaps.ts"

// SAFETY: the functions under test only pass the job on, to the stubbed service.
const job = {} as RenderJob

/** Answers each capture the offscreen window is asked for with the next of `answers`. */
function offscreen(...answers: (() => Promise<{ src?: string }>)[]) {
  const request = vi.fn<() => Promise<{ src?: string }>>(() => answers.shift()!())
  vi.stubGlobal("window", { canvasHost: { ask: preloadAnswers(request) } })

  return request
}

afterEach(() => vi.unstubAllGlobals())

describe("capture", () => {
  it("doesn't keep a capture that failed, so the frame's next try takes it again", async () => {
    const request = offscreen(
      () => Promise.reject(new Error("UnknownVizError")),
      () => Promise.resolve({ src: "data:image/webp;base64,AAAA" })
    )

    want("failing", 1)
    expect(await capture("failing", job)).toBe(failed)
    expect(await capture("failing", job)).toBe("data:image/webp;base64,AAAA")
    // Taken, it's kept.
    expect(await capture("failing", job)).toBe("data:image/webp;base64,AAAA")
    expect(request).toHaveBeenCalledTimes(2)
    want("failing", -1)
  })

  it("keeps that a frame didn't render, so it isn't drawn again", async () => {
    const request = offscreen(() => Promise.resolve({}))
    want("broken", 1)
    expect(await capture("broken", job)).toBeUndefined()
    expect(await capture("broken", job)).toBeUndefined()
    expect(request).toHaveBeenCalledTimes(1)
    want("broken", -1)
  })
})

describe("stored", () => {
  type Kept = { src?: string; height?: number; stale?: true }

  /**
   * Answers each method the service is asked with `answers[method]`, counting what's asked: a capture with what it
   * gives, and each job asked for kept bitmaps with what it gives for that job.
   */
  function service(answers: Record<string, (job?: RenderJob) => Promise<Kept>>) {
    // oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- it stands in for the service across IPC, whose messages preloadAnswers leaves unparsed
    const request = vi.fn<(method: string, params: unknown) => Promise<unknown>>((method, params) => {
      // SAFETY: the two methods asked are frames.capture, whose params have no jobs, and frames.stored, whose jobs are
      // JSON of the RenderJob[] asked for.
      const { jobs } = params as { jobs?: string }

      return jobs === undefined
        ? answers[method]!()
        : // SAFETY: as above.
          Promise.all((JSON.parse(jobs) as RenderJob[]).map((asked) => answers[method]!(asked))).then((kept) => ({
            kept
          }))
    })

    vi.stubGlobal("window", { canvasHost: { ask: preloadAnswers(request) } })

    return request
  }

  it("stands a bitmap kept on disk in for its key, with its frame's height, so the frame isn't captured", async () => {
    const request = service({
      "frames.stored": () => Promise.resolve({ src: "data:image/webp;base64,KEPT", height: 640 })
    })

    want("kept", 1)
    expect(await stored("kept", job)).toEqual({ src: "data:image/webp;base64,KEPT", height: 640 })
    expect(await capture("kept", job)).toBe("data:image/webp;base64,KEPT")
    expect(request.mock.calls.map(([method]) => method)).toEqual(["frames.stored"])
    want("kept", -1)
  })

  it("gives the frame's latest, kept from other code, as stale, without standing it in for its key (PAR-993)", async () => {
    const request = service({
      "frames.stored": () => Promise.resolve({ src: "data:image/webp;base64,LATEST", height: 640, stale: true }),
      "frames.capture": () => Promise.resolve({ src: "data:image/webp;base64,NEW", height: 700 })
    })

    want("restyled", 1)
    expect(await stored("restyled", job)).toEqual({ src: "data:image/webp;base64,LATEST", height: 640, stale: true })
    expect(await capture("restyled", job)).toBe("data:image/webp;base64,NEW")
    expect(request.mock.calls.map(([method]) => method)).toEqual(["frames.stored", "frames.capture"])
    want("restyled", -1)
  })

  it("reads once for the frames that show the same bitmap", async () => {
    const request = service({ "frames.stored": () => Promise.resolve({ src: "data:image/webp;base64,KEPT" }) })
    const [a, b] = await Promise.all([stored("shared", job), stored("shared", job)])
    expect(a).toBe(b)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it("asks once for the frames that mount together, giving each its own bitmap", async () => {
    // SAFETY: the stubbed service tells jobs apart by tree, and nothing else reads them.
    const first = { tree: "first" } as RenderJob
    // SAFETY: as above.
    const second = { tree: "second" } as RenderJob

    const request = service({
      "frames.stored": (asked) =>
        Promise.resolve(asked?.tree === "first" ? { src: "data:image/webp;base64,FIRST", height: 320 } : {})
    })

    const [a, b] = await Promise.all([stored("first", first), stored("second", second)])
    expect(a).toEqual({ src: "data:image/webp;base64,FIRST", height: 320 })
    expect(b).toBeUndefined()
    expect(request.mock.calls).toEqual([["frames.stored", { jobs: JSON.stringify([first, second]) }]])
  })

  it("has none when the service couldn't say", async () => {
    service({ "frames.stored": () => Promise.reject(new Error("closed")) })
    expect(await stored("unanswered", job)).toBeUndefined()
  })

  it("has none when none was kept", async () => {
    service({ "frames.stored": () => Promise.resolve({}) })
    expect(await stored("none", job)).toBeUndefined()
  })

  it("gives the capture taken while it was read, which is the frame as it's drawn now, with its height", async () => {
    let answer!: (result: { src?: string }) => void
    service({
      "frames.stored": () => new Promise((resolve) => (answer = resolve)),
      "frames.capture": () => Promise.resolve({ src: "data:image/webp;base64,NEW", height: 812.5 })
    })
    want("raced", 1)
    const read = stored("raced", job)
    await capture("raced", job)
    answer({ src: "data:image/webp;base64,OLD" })
    expect(await read).toEqual({ src: "data:image/webp;base64,NEW", height: 812.5 })
    want("raced", -1)
  })
})

describe("a frame not drawn yet", () => {
  const far: UndrawnFrame = { bitmap: { pending: true }, awake: true, interactive: false, dormant: true }
  const kept = { pending: false, src: "data:image/webp;base64,KEPT", height: 640 }

  it("waits zoomed far out while its bitmap is to come, kept or captured, and once come, until it sleeps on it", () => {
    expect(holdsFirstDraw(far)).toBe(true)
    expect(holdsFirstDraw({ ...far, bitmap: kept })).toBe(true)
    // Asleep, it isn't drawn anyway; waking later draws it as any frame.
    expect(holdsFirstDraw({ ...far, bitmap: kept, awake: false })).toBe(false)
  })

  it("draws once its capture failed, or came without a height, as for a frame that didn't render", () => {
    expect(holdsFirstDraw({ ...far, bitmap: { pending: false } })).toBe(false)
    expect(holdsFirstDraw({ ...far, bitmap: { pending: false, src: "data:image/webp;base64,NEW" } })).toBe(false)
  })

  it("draws at once where it wouldn't sleep: zoomed in, on the selected board, or while interacting", () => {
    expect(holdsFirstDraw({ ...far, dormant: false })).toBe(false)
    expect(holdsFirstDraw({ ...far, bitmap: kept, dormant: false })).toBe(false)
    expect(holdsFirstDraw({ ...far, interactive: true })).toBe(false)
  })
})
