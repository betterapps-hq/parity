import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import type { RenderJob } from "../../shared/protocol.ts"
import { capture, failed, want } from "./frame-bitmaps.ts"

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
