import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { claimSessionSlot, slotCount } from "./session-slot.ts"

let folder: string

/** A data folder for the test, with copies already holding the given slots' locks. */
function dataFolder(held: Record<number, number> = {}): string {
  folder = mkdtempSync(join(tmpdir(), "parity-slots-"))
  mkdirSync(join(folder, "session-locks"))

  for (const [slot, pid] of Object.entries(held)) {
    writeFileSync(join(folder, "session-locks", `copy-${slot}.lock`), JSON.stringify({ pid }))
  }

  return folder
}

afterEach(() => rmSync(folder, { recursive: true, force: true }))

/** Running processes, by the ID the test gives each. */
const runningOnly =
  (...pids: number[]) =>
  (pid: number) =>
    pids.includes(pid)

describe("a copy's session folder", () => {
  it("is the first when no other copy runs", () => {
    const data = dataFolder()

    expect(claimSessionSlot(data, { pid: 10, alive: runningOnly() }).partition).toBe("persist:copy-1")
  })

  it("is the next free one while other copies run", () => {
    const data = dataFolder({ 1: 20, 2: 21 })

    expect(claimSessionSlot(data, { pid: 10, alive: runningOnly(20, 21) }).partition).toBe("persist:copy-3")
  })

  it("is taken over from a copy that crashed", () => {
    const data = dataFolder({ 1: 20 })

    expect(claimSessionSlot(data, { pid: 10, alive: runningOnly() }).partition).toBe("persist:copy-1")
  })

  it("is free again once its copy quits", () => {
    const data = dataFolder()
    const first = claimSessionSlot(data, { pid: 10, alive: runningOnly(10) })
    first.release()

    expect(claimSessionSlot(data, { pid: 11, alive: runningOnly(10) }).partition).toBe("persist:copy-1")
  })

  it("shares the last folder when another copy's claim doesn't end in time", () => {
    const data = dataFolder()
    mkdirSync(join(data, "session-locks", "claiming"))

    expect(claimSessionSlot(data, { pid: 10, alive: runningOnly(), waitMs: 50 }).partition).toBe(
      `persist:copy-${slotCount}`
    )
  })

  it("takes over a claim a copy left as it crashed", () => {
    const data = dataFolder()
    mkdirSync(join(data, "session-locks", "claiming"))

    expect(claimSessionSlot(data, { pid: 10, alive: runningOnly(), staleMs: -1 }).partition).toBe("persist:copy-1")
  })

  it("is the last, shared, once every folder is taken", () => {
    const pids = Array.from({ length: slotCount }, (_, index) => 100 + index)
    const data = dataFolder(Object.fromEntries(pids.map((pid, index) => [index + 1, pid])))

    expect(claimSessionSlot(data, { pid: 10, alive: runningOnly(...pids) }).partition).toBe(`persist:copy-${slotCount}`)
  })
})
