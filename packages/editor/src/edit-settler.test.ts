import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { createEditSettler } from "./edit-settler.ts"

describe("createEditSettler", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("settles a run of edits once they pause", () => {
    const settle = vi.fn<() => void>()
    const settler = createEditSettler(settle, { pause: 150 })

    settler.edited()
    vi.advanceTimersByTime(100)
    settler.edited()
    vi.advanceTimersByTime(100)

    expect(settle).not.toHaveBeenCalled()

    vi.advanceTimersByTime(50)

    expect(settle).toHaveBeenCalledTimes(1)
  })

  it("holds a drag's edits until it ends, then settles them once at once", () => {
    const settle = vi.fn<() => void>()
    const settler = createEditSettler(settle, { pause: 150 })

    settler.gesture(true)

    for (let frame = 0; frame < 60; frame += 1) {
      settler.edited()
      vi.advanceTimersByTime(16)
    }

    expect(settle).not.toHaveBeenCalled()

    settler.gesture(false)

    expect(settle).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(settle).toHaveBeenCalledTimes(1)
  })

  it("settles anyway after the longest wait, so a gesture that never ends can't hold edits for good", () => {
    const settle = vi.fn<() => void>()
    const settler = createEditSettler(settle, { pause: 150, longest: 5000 })

    settler.gesture(true)
    settler.edited()
    vi.advanceTimersByTime(5000)

    expect(settle).toHaveBeenCalledTimes(1)
  })

  it("settles at once when flushed, and not again after", () => {
    const settle = vi.fn<() => void>()
    const settler = createEditSettler(settle)

    settler.flush()
    expect(settle).not.toHaveBeenCalled()

    settler.edited()
    settler.flush()
    vi.advanceTimersByTime(1000)

    expect(settle).toHaveBeenCalledTimes(1)
  })

  it("drops waiting edits when stopped", () => {
    const settle = vi.fn<() => void>()
    const settler = createEditSettler(settle)

    settler.edited()
    settler.stop()
    vi.advanceTimersByTime(10_000)

    expect(settle).not.toHaveBeenCalled()
  })
})
