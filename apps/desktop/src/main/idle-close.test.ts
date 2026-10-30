import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { idleClose } from "./idle-close.ts"

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function setup() {
  const close = vi.fn<() => void>()
  return { close, idle: idleClose(60_000, close) }
}

describe("idleClose", () => {
  it("closes a minute after the last use ends", () => {
    const { close, idle } = setup()
    idle.use()()
    vi.advanceTimersByTime(59_999)
    expect(close).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(close).toHaveBeenCalledOnce()
  })

  it("doesn't close before anything has used it", () => {
    const { close } = setup()
    vi.advanceTimersByTime(600_000)
    expect(close).not.toHaveBeenCalled()
  })

  it("never closes during a use, however long it takes", () => {
    const { close, idle } = setup()
    const end = idle.use()
    vi.advanceTimersByTime(600_000)
    expect(close).not.toHaveBeenCalled()
    end()
    vi.advanceTimersByTime(60_000)
    expect(close).toHaveBeenCalledOnce()
  })

  it("stays open while a use waits its turn behind another", () => {
    const { close, idle } = setup()
    const first = idle.use()
    const second = idle.use()
    first()
    vi.advanceTimersByTime(120_000)
    expect(close).not.toHaveBeenCalled()
    second()
    vi.advanceTimersByTime(60_000)
    expect(close).toHaveBeenCalledOnce()
  })

  it("waits a whole minute again after each use", () => {
    const { close, idle } = setup()
    idle.use()()
    vi.advanceTimersByTime(50_000)
    const end = idle.use()
    vi.advanceTimersByTime(20_000)
    end()
    vi.advanceTimersByTime(59_000)
    expect(close).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(close).toHaveBeenCalledOnce()
  })

  it("closes once each time it falls idle, and again after it's used again", () => {
    const { close, idle } = setup()
    idle.use()()
    vi.advanceTimersByTime(180_000)
    expect(close).toHaveBeenCalledOnce()
    idle.use()()
    vi.advanceTimersByTime(60_000)
    expect(close).toHaveBeenCalledTimes(2)
  })

  it("counts a use's end only once", () => {
    const { close, idle } = setup()
    const first = idle.use()
    const second = idle.use()
    first()
    first()
    vi.advanceTimersByTime(60_000)
    expect(close).not.toHaveBeenCalled()
    second()
    vi.advanceTimersByTime(60_000)
    expect(close).toHaveBeenCalledOnce()
  })

  it("forgets a waiting close when cancelled", () => {
    const { close, idle } = setup()
    idle.use()()
    idle.cancel()
    vi.advanceTimersByTime(600_000)
    expect(close).not.toHaveBeenCalled()
  })
})
