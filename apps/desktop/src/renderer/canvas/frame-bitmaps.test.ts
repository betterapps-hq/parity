import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import type { RenderJob } from "../../shared/protocol.ts"
import { capture, failed, stored, want } from "./frame-bitmaps.ts"

const job = {} as RenderJob

/** Answers each capture the offscreen window is asked for with the next of `answers`. */
function offscreen(...answers: (() => Promise<{ png?: string }>)[]) {
  const request = vi.fn<() => Promise<{ png?: string }>>(() => answers.shift()!())
  vi.stubGlobal("window", { canvasHost: { request } })
  return request
}

afterEach(() => vi.unstubAllGlobals())

describe("capture", () => {
  it("doesn't keep a capture that failed, so the frame's next try takes it again", async () => {
    const request = offscreen(
      () => Promise.reject(new Error("UnknownVizError")),
      () => Promise.resolve({ png: "AAAA" })
    )
    want("failing", 1)
    expect(await capture("failing", job)).toBe(failed)
    expect(await capture("failing", job)).toBe("data:image/png;base64,AAAA")
    // Taken, it's kept.
    expect(await capture("failing", job)).toBe("data:image/png;base64,AAAA")
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
  function service(answers: Record<string, () => Promise<{ png?: string }>>) {
    const request = vi.fn<(method: string) => Promise<{ png?: string }>>((method) => answers[method]!())
    vi.stubGlobal("window", { canvasHost: { request } })
    return request
  }

  it("stands a bitmap kept on disk in for its key, so the frame isn't captured", async () => {
    const request = service({ "frames.stored": () => Promise.resolve({ png: "KEPT" }) })
    want("kept", 1)
    expect(await stored("kept", job)).toBe("data:image/png;base64,KEPT")
    expect(await capture("kept", job)).toBe("data:image/png;base64,KEPT")
    expect(request.mock.calls.map(([method]) => method)).toEqual(["frames.stored"])
    want("kept", -1)
  })

  it("reads once for the frames that show the same bitmap", async () => {
    const request = service({ "frames.stored": () => Promise.resolve({ png: "KEPT" }) })
    const [a, b] = await Promise.all([stored("shared", job), stored("shared", job)])
    expect(a).toBe(b)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it("has none when none was kept", async () => {
    service({ "frames.stored": () => Promise.resolve({}) })
    expect(await stored("none", job)).toBeUndefined()
  })

  it("gives the capture taken while it was read, which is the frame as it's drawn now", async () => {
    let answer!: (result: { png?: string }) => void
    service({
      "frames.stored": () => new Promise((resolve) => (answer = resolve)),
      "frames.capture": () => Promise.resolve({ png: "NEW" })
    })
    want("raced", 1)
    const read = stored("raced", job)
    await capture("raced", job)
    answer({ png: "OLD" })
    expect(await read).toBe("data:image/png;base64,NEW")
    want("raced", -1)
  })
})
