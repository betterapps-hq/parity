import { spawn } from "node:child_process"
import { expect, it, onTestFinished, vi } from "vite-plus/test"

/*
 * A real builder-like process whose parent dies while its main thread is busy, as a Vite server compiling when its
 * project service ran out of memory (PAR-1189). It's started detached, outside the job object Node puts what it starts
 * in on Windows, which ends it with its parent: Electron's utility process gave the builder no such job, so it lingered.
 */

const watch = new URL("./parent-watch.ts", import.meta.url).href

/** The builder: watches its parent, says its id, then keeps its main thread busy, never handling another event. */
const builder = (watched: boolean) => `
${watched ? `import { endWithParent } from ${JSON.stringify(watch)}\nendWithParent()` : ""}
process.on("disconnect", () => process.exit(0))
console.log(String(process.pid))
setTimeout(() => { const end = Date.now() + 30_000; while (Date.now() < end) {} }, 100)
`

/** The service: starts the builder with an IPC link, as `forkChild` does, and waits. */
const service = `
require("node:child_process").spawn(process.execPath, ["--input-type=module", "-e", process.argv[1]], {
  detached: true,
  stdio: ["ignore", "inherit", "ignore", "ipc"]
})
setInterval(() => undefined, 60_000)
`

function running(pid: number): boolean {
  try {
    process.kill(pid, 0)

    return true
  } catch {
    return false
  }
}

/** Starts a service and its builder, and gives the builder's id once it has printed it. */
async function startService(watched: boolean) {
  const started = spawn(process.execPath, ["-e", service, builder(watched)], {
    stdio: ["ignore", "pipe", "ignore"]
  })

  let printed = ""
  started.stdout.on("data", (chunk: Buffer) => (printed += chunk.toString()))

  const pid = await vi.waitFor(
    () => {
      const line = Number(printed.trim())
      expect(line).toBeGreaterThan(0)

      return line
    },
    { timeout: 10_000, interval: 50 }
  )

  onTestFinished(() => {
    for (const each of [started.pid, pid]) {
      if (each !== undefined && running(each)) {
        process.kill(each, "SIGKILL")
      }
    }
  })

  return { service: started, builder: pid }
}

it("ends a busy builder as soon as its service is gone", { timeout: 30_000 }, async () => {
  const { service: started, builder: pid } = await startService(true)
  // Long enough for the builder's main thread to be busy.
  await new Promise((resolve) => setTimeout(resolve, 500))
  started.kill("SIGKILL")

  await vi.waitFor(() => expect(running(pid)).toBe(false), { timeout: 3_000, interval: 50 })
})

it("leaves a busy builder running without it, waiting on its IPC link closing", { timeout: 30_000 }, async () => {
  const { service: started, builder: pid } = await startService(false)
  await new Promise((resolve) => setTimeout(resolve, 500))
  started.kill("SIGKILL")
  await new Promise((resolve) => setTimeout(resolve, 2_000))

  expect(running(pid)).toBe(true)
})
