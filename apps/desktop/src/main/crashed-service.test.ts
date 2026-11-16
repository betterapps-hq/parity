import { type ChildProcess, spawn } from "node:child_process"
import type { Handlers } from "@parity-app/channel"
import { expect, it, onTestFinished, vi } from "vite-plus/test"
import { killTree } from "../shared/process-tree.ts"
import type { MainMethods } from "../shared/service.ts"
import { createProjectService, type ServiceProcess } from "./project-service.ts"

/*
 * A real project service that crashes with a server running, as one with a project's Storybook open (PAR-1019). Main
 * can't find the server from the service once the service is gone, so it ends the one the service said it was running.
 * On Windows, Node puts what it spawns in a job object that ends with it, so the server goes either way there; on macOS
 * and Linux nothing else ends it, and this test fails without main ending it.
 */

/** A server that prints its id and waits, and starts one more first when it's the `parent`, as Storybook its workers. */
const server = `
console.log(String(process.pid))
if (process.argv[1] === "parent") {
  require("node:child_process").spawn(process.execPath, ["-e", process.argv[2], "worker", ""], {
    stdio: ["ignore", "inherit", "ignore"]
  })
}
setInterval(() => undefined, 60_000)
`

/**
 * A project service that starts the server and tells main its id, as the service's `children` request does, then says
 * `answered` once main has it.
 */
const service = `
const started = require("node:child_process").spawn(process.execPath, ["-e", process.argv[1], "parent", process.argv[1]], {
  stdio: ["ignore", "inherit", "ignore"]
})
process.on("message", () => console.log("answered"))
process.send({ type: "request", id: 1, method: "children", params: [started.pid] })
setInterval(() => undefined, 60_000)
`

/** A forked Node process, as the lifecycle takes Electron's utility process. */
function nodeService(child: ChildProcess): ServiceProcess {
  return {
    messages: {
      on: (event, listener) => void child.on(event, listener),
      postMessage: (message) => {
        if (child.connected) {
          // SAFETY: the channel only posts its own messages, which are plain JSON objects.
          child.send(message as object)
        }
      }
    },
    onOutput: (listener) => void child.stdout?.on("data", (chunk: Buffer) => listener(chunk.toString())),
    onSpawn: (listener) => void child.once("spawn", listener),
    onExit: (listener) => void child.on("exit", (code) => listener(code ?? 1)),
    kill: () => {
      if (child.pid) {
        killTree(child.pid)
      }
    }
  }
}

function running(pid: number): boolean {
  try {
    process.kill(pid, 0)

    return true
  } catch {
    return false
  }
}

/** Ends a process alone, as a crash does, leaving what it started: `kill -9`, or Task Manager's End task on Windows. */
function crash(pid: number): void {
  process.kill(pid, process.platform === "win32" ? "SIGTERM" : "SIGKILL")
}

// SAFETY: the service in this test asks main nothing but `children`, which the lifecycle answers itself.
const handlers = {} as Handlers<Omit<MainMethods, "children">>

it("ends the server a crashed service started, and what that server started", { timeout: 30_000 }, async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  onTestFinished(() => void vi.restoreAllMocks())
  let forked: ChildProcess | undefined
  let printed = ""

  const project = createProjectService<ServiceProcess, never>({
    fork: () => {
      forked = spawn(process.execPath, ["-e", service, server], { stdio: ["ignore", "pipe", "ignore", "ipc"] })
      forked.stdout?.on("data", (chunk: Buffer) => (printed += chunk.toString()))

      return nodeService(forked)
    },
    handlers,
    endTree: killTree,
    windows: () => [],
    loading: () => false,
    parityPage: () => true,
    join: () => undefined,
    quitting: () => false,
    missingEntry: () => undefined,
    telemetry: {
      started: () => undefined,
      spawned: () => undefined,
      exited: () => undefined,
      crashed: () => undefined
    },
    // The crashed service isn't started again: the test checks what it left.
    restarts: { exited: () => undefined }
  })

  project.start()
  const pid = forked?.pid
  expect(pid).toBeDefined()

  // The server's id and its worker's, once main has the server's.
  const servers = await vi.waitFor(
    () => {
      const lines = printed.split(/\r?\n/).filter(Boolean)
      expect(lines).toContain("answered")
      const pids = lines.filter((line) => line !== "answered").map(Number)
      expect(pids).toHaveLength(2)

      return pids
    },
    { timeout: 10_000, interval: 50 }
  )

  // Whatever the test finds, it leaves nothing running.
  onTestFinished(() => [pid!, ...servers].filter(running).forEach((each) => process.kill(each)))
  expect(servers.every(running)).toBe(true)

  crash(pid!)

  await vi.waitFor(() => expect([pid!, ...servers].filter(running)).toEqual([]), { timeout: 10_000, interval: 100 })
})
