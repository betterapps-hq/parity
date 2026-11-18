import { describe, expect, it } from "vite-plus/test"
import { noFailures, PageProcesses, processFailed, processOpen } from "./process.ts"

describe("PageProcesses", () => {
  const copacker = "p0123456789abcdef.localhost"
  const harbor = "pfedcba9876543210.localhost"

  it("says a host's process went when it ends under a frame still in the window", () => {
    const processes = new PageProcesses()
    processes.seen({ node: 1, host: copacker, pid: 100 })
    processes.seen({ node: 2, host: copacker, pid: 100 })
    processes.seen({ node: 3, host: harbor, pid: 200 })

    expect(processes.check(new Set([1, 2, 3]), (pid) => pid !== 100)).toEqual([copacker])
    // Said once: its frames are forgotten.
    expect(processes.check(new Set([1, 2, 3]), (pid) => pid !== 100)).toEqual([])
    expect(processes.watching).toBe(true)
  })

  it("forgets a frame removed from the window, whose process may end of its own accord", () => {
    const processes = new PageProcesses()
    processes.seen({ node: 1, host: copacker, pid: 100 })

    expect(processes.check(new Set(), () => false)).toEqual([])
    expect(processes.watching).toBe(false)
  })

  it("follows a frame that loads again in another process", () => {
    const processes = new PageProcesses()
    processes.seen({ node: 1, host: copacker, pid: 100 })
    processes.seen({ node: 1, host: copacker, pid: 101 })

    expect(processes.check(new Set([1]), (pid) => pid === 101)).toEqual([])
  })
})

describe("processFailed", () => {
  it("pauses before frames open again, and hears the same failure once", () => {
    const first = processFailed(noFailures, 0)

    expect(first?.restart).toEqual({ delay: 1000 })
    expect(processOpen(first!.state, 500)).toBe(false)
    expect(processFailed(first!.state, 500)).toBeUndefined()
    expect(processOpen(first!.state, 1000)).toBe(true)
    expect(processFailed(first!.state, 10_000)?.restart).toEqual({ delay: 5000 })
  })

  it("stops after three failures in two minutes, and stays stopped", () => {
    let state = noFailures

    for (const at of [0, 10_000, 20_000]) {
      state = processFailed(state, at)!.state
    }

    expect(state.until).toBe("stopped")
    expect(processOpen(state, 1_000_000)).toBe(false)
    expect(processFailed(state, 1_000_000)).toBeUndefined()
  })
})
