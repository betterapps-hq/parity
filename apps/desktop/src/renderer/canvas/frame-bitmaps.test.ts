import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import type { RenderJob } from "../../shared/protocol.ts"
import { capture, failed, holdsFirstDraw, stored, type UndrawnFrame, want } from "./frame-bitmaps.ts"

const job = {} as RenderJob

/** Answers each capture the offscreen window is asked for with the next of `answers`. */
function offscreen(...answers: (() => Promise<{ src?: string }>)[]) {
  const request = vi.fn<() => Promise<{ src?: string }>>(() => answers.shift()!())
  vi.stubGlobal("window", { canvasHost: { request } })
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
  /** Answers each method the service is asked with `answers[method]`, counting what's asked. */
  function service(answers: Record<string, () => Promise<{ src?: string; height?: number }>>) {
    const request = vi.fn<(method: string) => Promise<{ src?: string; height?: number }>>((method) =>
      answers[method]!()
    )
    vi.stubGlobal("window", { canvasHost: { request } })
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

  it("reads once for the frames that show the same bitmap", async () => {
    const request = service({ "frames.stored": () => Promise.resolve({ src: "data:image/webp;base64,KEPT" }) })
    const [a, b] = await Promise.all([stored("shared", job), stored("shared", job)])
    expect(a).toBe(b)
    expect(request).toHaveBeenCalledTimes(1)
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
