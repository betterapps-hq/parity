import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createTelemetry, createTestSink, registeredEvents, type TestSink } from "@parity-app/telemetry"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { traceWith } from "../shared/tracing.ts"
import { freePort } from "./ports.ts"
import { adoptProcess, type ManagedSpec, managedProcess, startProcess, stopProject } from "./process-manager.ts"
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

const env = { PATH: process.env.PATH ?? "" }

/** A server like an extension's Storybook, on a free port, ready once it answers. */
async function storybook(overrides: Partial<ManagedSpec> = {}, code = httpServer): Promise<ManagedSpec> {
  const port = await freePort()

  return {
    ...project,
    id: "storybook:shop",
    name: "Storybook",
    lifetime: "server",
    owner: { kind: "extension", extension: "@parity-app/extension-storybook" },
    runKind: "bin",
    command: "storybook",
    fingerprint: "storybook",
    ready: { http: "/" },
    launch: () =>
      Promise.resolve({ command: process.execPath, args: ["-e", code, String(port)], cwd: process.cwd(), env, port }),
    ...overrides
  }
}

/** A task that runs `code` on Node. */
function task(code: string, overrides: Partial<ManagedSpec> = {}): ManagedSpec {
  return {
    ...project,
    id: "vitest:shop",
    name: "Unit tests",
    lifetime: "task",
    owner: { kind: "extension", extension: "tests" },
    runKind: "bin",
    command: "vitest",
    fingerprint: code,
    launch: () => Promise.resolve({ command: process.execPath, args: ["-e", code], cwd: process.cwd(), env }),
    ...overrides
  }
}

// Each test starts real Node processes, which take seconds on a busy machine.
describe("starting a server", { timeout: 60_000 }, () => {
  it("waits until it answers, then knows its endpoint and keeps what it printed", async () => {
    const server = await startProcess(await storybook())
    expect((await listProcesses())[0]).toMatchObject({ state: "starting", canStop: true, run: 1 })

    const info = await server.ready()
    expect(info).toMatchObject({ state: "running", owner: { kind: "extension" }, endpoint: { protocol: "http" } })
    expect((await listProcesses())[0]).toMatchObject({ state: "running", opens: info.endpoint?.url })
    await vi.waitFor(() => expect(server.tail().join("\n")).toContain(`listening on ${info.endpoint?.port}`))
    expect(sink.named("processes.started").map((event) => event.attributes)).toEqual([
      {
        lifetime: "server",
        name: "Storybook",
        owner: "@parity-app/extension-storybook",
        role: "",
        runKind: "bin",
        command: "storybook",
        durationMs: expect.any(Number),
        ready: "http",
        portMoved: false,
        run: 1
      }
    ])
  })

  it("shares one start between two at once with the same spec, and refuses another spec under its id", async () => {
    const spec = await storybook()
    const [one, two] = await Promise.all([startProcess(spec), startProcess(spec)])
    expect(one).toBe(two)

    await expect(startProcess({ ...spec, fingerprint: "other" })).rejects.toMatchObject({
      code: "process_spec_differs"
    })
    expect(sink.named("processes.refused").map((event) => event.attributes.code)).toEqual(["process_spec_differs"])
    // Ready, so no ready check is still asking it when it stops: on macOS, Node's fetch threw `setTypeOfService EINVAL`
    // from a request in flight as the server went.
    await one.ready()
    await one.stop("extension")
  })

  it("starts once for two starts that wait for the run being stopped", async () => {
    const spec = await storybook()
    const first = await startProcess(spec)
    await first.ready()

    const stopping = first.stop("extension")
    const [one, two] = await Promise.all([startProcess(spec), startProcess(spec)])
    await stopping

    expect(one).toBe(two)
    await expect(one.ready()).resolves.toMatchObject({ run: 1, state: "running" })
    // Stopped here, so its stop isn't recorded in the next test's events.
    await one.stop("extension")
  })

  it("doesn't spawn a run whose project closed while it was being launched", async () => {
    let launched: () => void = () => undefined
    const spec = await storybook()

    const starting = startProcess({
      ...spec,
      launch: () => new Promise<void>((resolve) => (launched = resolve)).then(() => spec.launch())
    })

    stopProject("D:/projects/shop")
    launched()

    await expect(starting).rejects.toThrow("Storybook was stopped before it started")
    expect(managedProcess("storybook:shop")).toBeUndefined()
    expect(sink.named("processes.started")).toEqual([])
  })

  it("stops everything it started for a project when the project closes", async () => {
    const server = await startProcess(await storybook())
    await server.ready()

    stopProject("D:/projects/shop")
    await expect(server.ended()).resolves.toMatchObject({ how: "stopped", run: 1 })
    expect(managedProcess("storybook:shop")).toBeUndefined()
    expect(sink.named("processes.stopped").map((event) => event.attributes.by)).toEqual(["project"])
  })

  it("shows a server stopped on purpose as stopped, not crashed", async () => {
    const server = await startProcess(await storybook())
    await server.ready()

    await server.stop("person")
    const [listed] = await listProcesses()
    expect(listed?.state).toBe("stopped")
    expect(listed?.error).toBeUndefined()
    await expect(server.ready()).rejects.toThrow("isn't running")
  })

  it("stops the processes a server started along with it", async () => {
    // A server that starts a worker of its own, as Storybook does, and prints the worker's id.
    const withWorker = `
const worker = require("node:child_process").spawn(process.execPath, ["-e", "setInterval(() => undefined, 60_000)"])
console.log("worker " + worker.pid)
${httpServer}`

    const server = await startProcess(await storybook({}, withWorker))
    await server.ready()
    await vi.waitFor(() => expect(server.tail().join("\n")).toMatch(/worker \d+/))
    const worker = Number(/worker (\d+)/.exec(server.tail().join("\n"))?.[1])
    expect(running(worker)).toBe(true)

    await server.stop()
    await vi.waitFor(() => expect(running(worker)).toBe(false), { timeout: 10_000, interval: 100 })
  })

  it("fails with the end of what it printed when it stops by itself before it's ready", async () => {
    const server = await startProcess(await storybook({}, 'console.error("Port 6006 is in use"); process.exit(2)'))

    await expect(server.ready()).rejects.toThrow(/exit code 2[\s\S]*Port 6006 is in use/)
    const [listed] = await listProcesses()
    expect(listed?.state).toBe("failed")
    expect(listed?.error).toMatch(/exit code 2[\s\S]*Port 6006 is in use/)
    await expect(server.ended()).resolves.toMatchObject({ how: "crashed", exitCode: 2 })
    expect(sink.named("processes.failed").map((event) => event.attributes)).toEqual([
      expect.objectContaining({ reason: "exited", exitCode: 2, output: "Port 6006 is in use" })
    ])
  })

  it("stops a server that isn't ready in time", async () => {
    const server = await startProcess(
      await storybook({ ready: { http: "/never" }, timeoutMs: 500 }, "setInterval(() => {}, 1000)")
    )

    await expect(server.ready()).rejects.toThrow("wasn't ready within 0.5 seconds")
    await expect(server.ended()).resolves.toMatchObject({ how: "timeout" })
    expect((await listProcesses())[0]).toMatchObject({
      state: "failed",
      error: expect.stringContaining("wasn't ready")
    })
    expect(sink.named("processes.failed").map((event) => event.attributes)).toMatchObject([{ reason: "timeout" }])
  })

  it("is ready once its owner saw the line its output check waits for, and keeps the match", async () => {
    const server = await startProcess(
      await storybook(
        { ready: { output: "https://\\S+" } },
        'console.log("Visit https://a.example"); setInterval(() => {}, 1000)'
      )
    )

    server.onLines((lines) => {
      const match = lines.join("\n").match(/https:\/\/\S+/)

      if (match) {
        server.markReady(match[0])
      }
    })

    await expect(server.ready()).resolves.toMatchObject({ state: "running", readyMatch: "https://a.example" })
  })

  it("starts a server that crashes again when its spec asks, as its next run", async () => {
    const crashOnce = `
const fs = require("node:fs")
const marker = ${JSON.stringify(join(tmpdir(), `parity-crash-${process.pid}-${Date.now()}`))}
${httpServer}
if (!fs.existsSync(marker)) { fs.writeFileSync(marker, ""); setTimeout(() => process.exit(1), 2500) }`

    const server = await startProcess(await storybook({ restart: "onCrash" }, crashOnce))
    await server.ready()
    await expect(server.ended()).resolves.toMatchObject({ how: "crashed", run: 1 })

    await vi.waitFor(() => expect(server.info()).toMatchObject({ state: "running", run: 2 }), { timeout: 20_000 })
    expect(sink.named("processes.crashed").map((event) => event.attributes.restarting)).toEqual([true])
    await vi.waitFor(() =>
      expect(sink.named("processes.restarted").map((event) => event.attributes.by)).toEqual(["crash"])
    )
  })
})

describe("tasks", { timeout: 60_000 }, () => {
  it("passes with exit code 0, keeps its summary, and reports once its owner summarizes it", async () => {
    const run = await startProcess(task('console.log("3 tests")'))
    await run.ready()
    await expect(run.ended()).resolves.toMatchObject({ how: "exited", outcome: "passed", exitCode: 0 })

    run.summarize("All tests pass")
    expect(run.info()).toMatchObject({ state: "passed", summary: "All tests pass" })
    await vi.waitFor(() =>
      expect(sink.named("processes.taskFinished").map((event) => event.attributes)).toEqual([
        expect.objectContaining({ outcome: "passed", how: "exited", reported: true })
      ])
    )
  })

  it("fails otherwise, and is canceled when it's stopped", async () => {
    const failing = await startProcess(task("process.exit(3)"))
    await expect(failing.ended()).resolves.toMatchObject({ outcome: "failed", exitCode: 3 })

    const long = await startProcess(task("setInterval(() => {}, 1000)", { id: "long:shop" }))
    await long.stop()
    await expect(long.ended()).resolves.toMatchObject({ how: "stopped", outcome: "canceled" })
  })

  it("can be started again once it has ended, as its next process", async () => {
    const first = await startProcess(task("process.exit(0)"))
    await first.ended()

    const again = await startProcess(task("process.exit(0)"))
    await expect(again.ended()).resolves.toMatchObject({ outcome: "passed" })
  })
})

describe("adopting a server", () => {
  it("lists a server it didn't start, and only lets go of it when the project closes", async () => {
    adoptProcess({
      ...project,
      id: "storybook:shop",
      name: "Storybook",
      owner: { kind: "adopted", by: "@parity-app/extension-storybook" },
      endpoint: { url: "http://localhost:6006", port: 6006, protocol: "http" },
      foundBy: "port"
    })
    expect((await listProcesses())[0]).toMatchObject({ state: "running", owner: { kind: "adopted" }, canStop: true })
    expect(sink.named("processes.adopted").map((event) => event.attributes.foundBy)).toEqual(["port"])

    stopProject("D:/projects/shop")
    expect(managedProcess("storybook:shop")).toBeUndefined()
    expect(await listProcesses()).toEqual([])
  })

  it("refuses an endpoint not on this machine, and an id already in use", async () => {
    const adopted = {
      ...project,
      id: "storybook:shop",
      name: "Storybook",
      owner: { kind: "adopted", by: "x" },
      foundBy: "endpoint"
    } as const

    expect(() =>
      adoptProcess({ ...adopted, endpoint: { url: "http://example.com:6006", port: 6006, protocol: "http" } })
    ).toThrow("isn't on this machine")

    adoptProcess({ ...adopted, endpoint: { url: "http://localhost:6006", port: 6006, protocol: "http" } })
    expect(() =>
      adoptProcess({ ...adopted, endpoint: { url: "http://localhost:6007", port: 6007, protocol: "http" } })
    ).toThrow(expect.objectContaining({ code: "process_id_taken" }))
  })

  it("refuses to start an id it adopted", async () => {
    adoptProcess({
      ...project,
      id: "storybook:shop",
      name: "Storybook",
      owner: { kind: "adopted", by: "x" },
      endpoint: { url: "http://localhost:6006", port: 6006, protocol: "http" },
      foundBy: "endpoint"
    })

    await expect(startProcess(await storybook())).rejects.toMatchObject({ code: "process_adopted" })
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
