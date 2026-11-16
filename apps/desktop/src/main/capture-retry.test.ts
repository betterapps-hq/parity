import { describe, expect, it, vi } from "vite-plus/test"
import { retryingCapture } from "./capture-retry.ts"

/** A capture that fails with each of `failures` in turn, then gives "picture". */
function capturing(...failures: string[]) {
  const take = vi.fn<() => Promise<string>>(() => {
    const failure = failures.shift()

    return failure === undefined ? Promise.resolve("picture") : Promise.reject(new Error(failure))
  })

  const repaint = vi.fn<() => Promise<void>>(() => Promise.resolve())

  return { take, repaint }
}

describe("retryingCapture", () => {
  it("takes the capture again once the window has painted, when Chromium had no frame to copy", async () => {
    const { take, repaint } = capturing("UnknownVizError", "UnknownVizError")
    await expect(retryingCapture(take, repaint)).resolves.toBe("picture")
    expect(take).toHaveBeenCalledTimes(3)
    expect(repaint).toHaveBeenCalledTimes(2)
  })

  it("lets the failure through after three tries", async () => {
    const { take, repaint } = capturing("UnknownVizError", "UnknownVizError", "UnknownVizError")
    await expect(retryingCapture(take, repaint)).rejects.toThrow("UnknownVizError")
    expect(take).toHaveBeenCalledTimes(3)
  })

  it("throws any other failure at once", async () => {
    const { take, repaint } = capturing("Frame Gone")
    await expect(retryingCapture(take, repaint)).rejects.toThrow("Frame Gone")
    expect(take).toHaveBeenCalledOnce()
    expect(repaint).not.toHaveBeenCalled()
  })
})
