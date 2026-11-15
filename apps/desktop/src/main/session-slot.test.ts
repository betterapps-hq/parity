import type * as Fs from "node:fs"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { claimSessionSlot, slotCount } from "./session-slot.ts"

/** Runs once before this copy's next look at a claim's age, or its next write, as another copy starting would. */
interface Between {
  stat?: () => void
  write?: () => void
}

const between = vi.hoisted((): Between => ({}))

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof Fs>()

  return {
    ...fs,
    statSync: (path: string, options?: Fs.StatSyncOptions) => {
      const run = between.stat
      between.stat = undefined
      run?.()

      return fs.statSync(path, options)
    },
    writeFileSync: (file: string, data: string, options?: Fs.WriteFileOptions) => {
      const run = between.write
      between.write = undefined
      run?.()

      fs.writeFileSync(file, data, options)
    }
  }
})

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

  it("tries again when another copy's claim ends just as it looks (PAR-1116)", () => {
    const data = dataFolder()
    const claim = join(data, "session-locks", "claiming")
    mkdirSync(claim)
    between.stat = () => rmSync(claim, { recursive: true })

    expect(claimSessionSlot(data, { pid: 10, alive: runningOnly() }).partition).toBe("persist:copy-1")
  })

  it("takes over a claim a copy left as it crashed", () => {
    const data = dataFolder()
    mkdirSync(join(data, "session-locks", "claiming"))

    expect(claimSessionSlot(data, { pid: 10, alive: runningOnly(), staleMs: -1 }).partition).toBe("persist:copy-1")
  })

  it("passes a free folder another copy takes as it does, as two copies past a claim would (PAR-1116)", () => {
    const data = dataFolder()
    between.write = () => writeFileSync(join(data, "session-locks", "copy-1.lock"), JSON.stringify({ pid: 20 }))

    expect(claimSessionSlot(data, { pid: 10, alive: runningOnly(20) }).partition).toBe("persist:copy-2")
  })

  it("passes a crashed copy's folder another copy takes over first (PAR-1116)", () => {
    const data = dataFolder({ 1: 5 })
    between.write = () => writeFileSync(join(data, "session-locks", "copy-1.lock"), JSON.stringify({ pid: 20 }))

    expect(claimSessionSlot(data, { pid: 10, alive: runningOnly(20) }).partition).toBe("persist:copy-2")
  })

  it("passes a crashed copy's folder while another copy is taking it over (PAR-1116)", () => {
    const data = dataFolder({ 1: 5 })
    writeFileSync(join(data, "session-locks", "copy-1.lock.from-5"), "")

    expect(claimSessionSlot(data, { pid: 10, alive: runningOnly() }).partition).toBe("persist:copy-2")
  })

  it("is the last, shared, once every folder is taken", () => {
    const pids = Array.from({ length: slotCount }, (_, index) => 100 + index)
    const data = dataFolder(Object.fromEntries(pids.map((pid, index) => [index + 1, pid])))

    expect(claimSessionSlot(data, { pid: 10, alive: runningOnly(...pids) }).partition).toBe(`persist:copy-${slotCount}`)
  })
})
