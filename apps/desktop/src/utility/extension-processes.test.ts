import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer, type Server } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ProcessCaller, ProcessListener } from "@parity-app/extensions"
import { createTelemetry, createTestSink, registeredEvents, type TestSink } from "@parity-app/telemetry"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { traceWith } from "../shared/tracing.ts"
import { extensionProcesses } from "./extension-processes.ts"
import { freePort, stopProject } from "./process-manager.ts"

let root: string
let state: string
let sink: TestSink

/** A package's command line that serves HTTP on the port it's given, and says so. */
const server = `
const server = require("node:http").createServer((_, response) => response.end("ok"))
server.listen(Number(process.argv[2]), () => console.log("listening on " + process.argv[2]))
`

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
  // No Portless routes.
  state = await mkdtemp(join(tmpdir(), "parity-portless-"))
  process.env.PORTLESS_STATE_DIR = state
  // A project with a package installed whose command line is a server.
  root = await mkdtemp(join(tmpdir(), "parity-project-"))
  const folder = join(root, "node_modules", "fake-server")
  await mkdir(folder, { recursive: true })
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "shop" }))
  await writeFile(join(folder, "package.json"), JSON.stringify({ name: "fake-server", bin: { serve: "serve.cjs" } }))
  await writeFile(join(folder, "serve.cjs"), server)
})

afterEach(async () => {
  stopProject("shop")
  delete process.env.PORTLESS_STATE_DIR
  await rm(state, { recursive: true, force: true })
  await rm(root, { recursive: true, force: true })
})

/** No discovery providers. */
const noProviders = {
  discover: () => Promise.resolve({ servers: [], providers: 0, cached: 0 }),
  found: () => undefined
}

/** An extension asking for processes in the project, allowed to run what `processes` lists. */
function caller(extension: string, processes: string[] = []): ProcessCaller {
  return { projectId: "shop", extension, permissions: { processes, observe: false }, main: join(root, "main.mjs") }
}

describe("parity.processes in the service", () => {
  it("starts a package's command line from the project, lists it under the extension's id, and sends its lines", async () => {
    const processes = extensionProcesses(() => ({ root, name: "shop" }), noProviders)
    const tools = caller("tools", ["bin:fake-server"])
    const lines: string[] = []

    const listener: ProcessListener = {
      changed: () => undefined,
      lines: (_id, printed) => void lines.push(...printed),
      ended: () => undefined
    }

    const unwatch = processes.watch(tools, listener)
    const port = await freePort()

    await processes.start(tools, {
      id: "server",
      name: "Server",
      lifetime: "server",
      run: { bin: "serve", package: "fake-server" },
      args: ["{port}"],
      port: { prefer: port },
      ready: { http: "/" }
    })

    const ready = await processes.ready(tools, "server")

    expect(ready).toMatchObject({
      id: "tools:server",
      state: "running",
      owner: { kind: "extension", extension: "tools" },
      endpoint: { port }
    })
    await vi.waitFor(() => expect(lines).toContain(`listening on ${port}`))
    expect(processes.snapshot(tools).output.server).toContain(`listening on ${port}`)
    expect(processes.snapshot(caller("other")).list.map((info) => info.id)).toEqual(["tools:server"])

    await processes.stop(tools, "server")
    expect(await processes.ended(tools, "server")).toMatchObject({ how: "stopped" })
    unwatch()
  })

  it("refuses a run the manifest doesn't list, and a package the project hasn't installed", async () => {
    const processes = extensionProcesses(() => ({ root, name: "shop" }), noProviders)
    const spec = { id: "server", name: "Server", lifetime: "server", run: { bin: "fake-server" } } as const

    await expect(processes.start(caller("tools"), spec)).rejects.toMatchObject({ code: "process_not_permitted" })
    await expect(
      processes.start(caller("tools", ["bin:missing"]), { ...spec, run: { bin: "missing" } })
    ).rejects.toMatchObject({ code: "process_not_found" })
    expect(sink.named("processes.refused").map((event) => event.attributes)).toEqual([
      { owner: "tools", runKind: "bin", command: "fake-server", code: "process_not_permitted" },
      { owner: "tools", runKind: "bin", command: "missing", code: "process_not_found" }
    ])
  })

  it("gives an adopted server's end once it's let go", async () => {
    const processes = extensionProcesses(() => ({ root, name: "shop" }), noProviders)
    const tools = caller("tools")
    const port = await freePort()

    processes.adopt(tools, {
      id: "server",
      name: "Server",
      endpoint: { url: `http://localhost:${port}`, port, protocol: "http" },
      foundBy: "endpoint"
    })
    await processes.stop(tools, "server")

    await expect(processes.ended(tools, "server")).resolves.toMatchObject({ how: "stopped", run: 1 })
  })

  it("finds a server answering on a port nothing lists", async () => {
    const processes = extensionProcesses(() => ({ root, name: "shop" }), noProviders)
    const port = await freePort()

    const listening = await new Promise<Server>((resolve) => {
      const found = createServer()
      found.listen(port, () => resolve(found))
    })

    try {
      const candidates = await processes.find(caller("tools"), { ports: [port] })

      expect(candidates).toEqual([
        {
          key: `port:${port}`,
          endpoint: { url: `http://localhost:${port}`, port, protocol: "http" },
          addresses: [],
          foundBy: { kind: "port" }
        }
      ])
    } finally {
      listening.close()
    }
  })
})
