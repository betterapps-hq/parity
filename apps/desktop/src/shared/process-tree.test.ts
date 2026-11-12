import { spawn } from "node:child_process"
import { describe, expect, it, onTestFinished, vi } from "vite-plus/test"
import { killTree, parseProcessLinks, processTree } from "./process-tree.ts"

describe("processTree", () => {
  it("reads what ps lists", () => {
    expect(parseProcessLinks("    1     0\n  412     1\n 9001   412\n\n")).toEqual([
      { pid: 1, ppid: 0 },
      { pid: 412, ppid: 1 },
      { pid: 9001, ppid: 412 }
    ])
  })

  it("takes a process and everything it started, parents first, and nothing else", () => {
    const links = [
      { pid: 1, ppid: 0 },
      { pid: 10, ppid: 1 },
      { pid: 11, ppid: 10 },
      { pid: 12, ppid: 10 },
      { pid: 13, ppid: 11 },
      { pid: 20, ppid: 1 }
    ]

    expect(processTree(10, links)).toEqual([10, 11, 12, 13])
    expect(processTree(99, links)).toEqual([99])
  })
})

/**
 * A Node process that prints its id and starts one like it, `depth` deep, then waits: a project service with its
 * Storybook and the Storybook's worker.
 */
const nested = `
const depth = Number(process.argv[1])
console.log(String(process.pid))
if (depth > 0) {
  require("node:child_process").spawn(process.execPath, ["-e", process.argv[2], String(depth - 1), process.argv[2]], {
    stdio: ["ignore", "inherit", "ignore"]
  })
}
setInterval(() => undefined, 60_000)
`

/** Starts a process `depth` processes deep, and settles with every one's id once each has started. */
function startNested(depth: number): Promise<number[]> {
  const root = spawn(process.execPath, ["-e", nested, String(depth), nested], { stdio: ["ignore", "pipe", "ignore"] })
  let printed = ""

  return new Promise((resolve, reject) => {
    root.on("error", reject)
    root.stdout.on("data", (chunk: Buffer) => {
      printed += chunk.toString()
      // Only whole lines: a chunk can end partway through an id.
      const pids = printed.split(/\r?\n/).slice(0, -1).filter(Boolean).map(Number)

      if (pids.length === depth + 1) {
        resolve(pids)
      }
    })
  })
}

function running(pid: number): boolean {
  try {
    process.kill(pid, 0)

    return true
  } catch {
    return false
  }
}

describe("killTree", { timeout: 30_000 }, () => {
  it("ends a process, what it started and what that started", async () => {
    const pids = await startNested(2)
    // Whatever the test finds, it leaves nothing running.
    onTestFinished(() => pids.filter(running).forEach((pid) => process.kill(pid)))
    expect(pids.every(running)).toBe(true)

    killTree(pids[0]!)

    await vi.waitFor(() => expect(pids.filter(running)).toEqual([]), { timeout: 10_000, interval: 100 })
  })
})
