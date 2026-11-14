import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createTelemetry, createTestSink, registeredEvents, type TestSink } from "@parity-app/telemetry"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { traceWith } from "../shared/tracing.ts"
import {
  adoptServer,
  freePort,
  knownServers,
  serverLog,
  type ServerSpec,
  startServer,
  stopProject
} from "./process-manager.ts"
import { listProcesses } from "./processes.ts"

let state: string
let sink: TestSink

beforeEach(async () => {
  sink = createTestSink()
  traceWith(
    createTelemetry({
      events: registeredEvents,
      context: { process: "service", installId: "install", sessionId: "session" },
      sinks: [sink],
      check: true
    })
  )
  // No Portless routes, so the list names nothing.
  state = await mkdtemp(join(tmpdir(), "parity-portless-"))
  process.env.PORTLESS_STATE_DIR = state
})

afterEach(async () => {
  stopProject("D:/projects/shop")
  delete process.env.PORTLESS_STATE_DIR
  await rm(state, { recursive: true, force: true })
})

const project = { projectId: "D:/projects/shop", project: "shop" } as const

/** A small HTTP server on Node, which says so once it listens. */
const httpServer = `
const server = require("node:http").createServer((_, response) => response.end("ok"))
server.listen(Number(process.argv[1]), () => console.log("listening on " + process.argv[1]))
`

async function storybook(overrides: Partial<ServerSpec> = {}): Promise<ServerSpec> {
  const port = await freePort()

  return {
    ...project,
    id: "storybook:shop",
    kind: "extension",
    name: "Storybook",
    command: process.execPath,
    args: ["-e", httpServer, String(port)],
    cwd: process.cwd(),
    url: `http://localhost:${port}`,
    ready: (url) => fetch(url).then((response) => response.ok),
    ...overrides
  }
}

// Each test starts real Node processes, which take seconds on a busy machine.
describe("startServer", { timeout: 60_000 }, () => {
  it("waits until a server answers, then knows its port and keeps what it printed", async () => {
    const spec = await storybook()
    const server = startServer(spec)
    expect((await listProcesses())[0]).toMatchObject({ status: "starting", canStop: true, startedBy: "parity" })

    await expect(server.ready).resolves.toBe(spec.url)
    expect((await listProcesses())[0]).toMatchObject({ status: "running", url: spec.url, pid: server.pid })
    expect(knownServers("D:/projects/shop")).toEqual([
      {
        id: "storybook:shop",
        kind: "extension",
        projectId: "D:/projects/shop",
        url: spec.url,
        port: server.port,
        pid: server.pid,
        startedBy: "parity"
      }
    ])
    expect(serverLog("storybook:shop")).toContain(`listening on ${server.port}`)
    expect(sink.named("server.started").map((event) => event.attributes)).toEqual([
      { kind: "extension", name: "Storybook", durationMs: expect.any(Number) }
    ])
  })

  it("stops everything it started for a project when the project closes", async () => {
    const server = startServer(await storybook())
    await server.ready

    stopProject("D:/projects/shop")
    await server.exited
    expect(knownServers()).toEqual([])
    expect(await listProcesses()).toEqual([])
  })

  it("shows a server stopped from the list as stopped, not crashed", async () => {
    const server = startServer(await storybook())
    await server.ready

    server.stop()
    await server.exited
    const [listed] = await listProcesses()
    expect(listed?.status).toBe("stopped")
    expect(listed?.error).toBeUndefined()
  })

  it("stops the processes a server started along with it", async () => {
    // A server that starts a worker of its own, as Storybook does, and prints the worker's id.
    const withWorker = `
const worker = require("node:child_process").spawn(process.execPath, ["-e", "setInterval(() => undefined, 60_000)"])
console.log("worker " + worker.pid)
${httpServer}`

    const spec = await storybook()
    const server = startServer({ ...spec, args: ["-e", withWorker, spec.args[2]!] })
    await server.ready
    const worker = Number(/worker (\d+)/.exec(server.log())?.[1])
    expect(running(worker)).toBe(true)

    server.stop()
    await server.exited
    await vi.waitFor(() => expect(running(worker)).toBe(false), { timeout: 10_000, interval: 100 })
  })

  it("fails with the end of what a server printed when it stops by itself before answering", async () => {
    const server = startServer(
      await storybook({ args: ["-e", 'console.error("Port 6006 is in use"); process.exit(2)'] })
    )

    await expect(server.ready).rejects.toThrow(/exit code 2[\s\S]*Port 6006 is in use/)
    const [listed] = await listProcesses()
    expect(listed?.status).toBe("failed")
    expect(listed?.error).toMatch(/exit code 2[\s\S]*Port 6006 is in use/)
    expect(knownServers()).toEqual([])
    expect(sink.named("server.failed").map((event) => event.attributes)).toEqual([
      {
        kind: "extension",
        name: "Storybook",
        durationMs: expect.any(Number),
        reason: "exited",
        output: "Port 6006 is in use"
      }
    ])
  })

  it("stops a server that doesn't answer in time", async () => {
    const server = startServer(await storybook({ ready: () => Promise.resolve(false), startTimeout: 500 }))

    await expect(server.ready).rejects.toThrow("didn't start within 0.5 seconds")
    await server.exited
    expect((await listProcesses())[0]).toMatchObject({
      status: "failed",
      error: expect.stringContaining("didn't start")
    })
    expect(sink.named("server.failed").map((event) => event.attributes)).toMatchObject([{ reason: "timeout" }])
  })
})

describe("adoptServer", () => {
  it("lists a server it didn't start, knows its port, and only lets go of it when the project closes", async () => {
    adoptServer({
      ...project,
      id: "storybook:shop",
      kind: "extension",
      name: "Storybook",
      url: "http://localhost:6006"
    })
    expect((await listProcesses())[0]).toMatchObject({ status: "running", startedBy: "elsewhere", canStop: false })
    expect(knownServers()).toMatchObject([{ port: 6006, startedBy: "elsewhere" }])

    stopProject("D:/projects/shop")
    expect(knownServers()).toEqual([])
    expect(await listProcesses()).toEqual([])
  })
})

function running(pid: number): boolean {
  try {
    process.kill(pid, 0)

    return true
  } catch {
    return false
  }
}
