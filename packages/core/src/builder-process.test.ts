import { describe, expect, it, vi } from "vite-plus/test"
import type { BuilderAdapter, BuilderStartOptions, RendererAdapter } from "./adapters.ts"
import {
  type BuilderProcessClientOptions,
  type BuilderProcessOptions,
  type BuilderProcessReply,
  type BuilderProcessRequest,
  builderProcessOptions,
  connectBuilderProcess,
  type ProcessTimes,
  serveBuilderProcess
} from "./builder-process.ts"
import type { ServedRecord } from "./served.ts"

const renderer: RendererAdapter = {
  id: "react",
  name: "React",
  detect: () => true,
  guestModule: "@parity-app/renderer-react/guest",
  runtimePackages: ["react"],
  runtimeImports: [],
  componentExtensions: [".tsx"],
  findComponents: () => []
}

const startOptions: BuilderStartOptions = {
  root: "/app",
  config: {
    styles: [],
    components: { Button: { path: "src/button.tsx", export: "Button" } },
    documents: [],
    libraries: []
  },
  renderer,
  rendererGuestPath: "/parity/guest.ts",
  allowedOrigins: ["http://localhost:5310"],
  port: 5400
}

/** A builder that records what it was started with, and closes when told, saying what it served with `served`. */
function fakeBuilder(start?: (options: BuilderStartOptions) => Promise<void>, served?: () => Promise<ServedRecord>) {
  const started: BuilderStartOptions[] = []
  const close = vi.fn<() => Promise<void>>(() => Promise.resolve())
  const builder: BuilderAdapter = {
    id: "vite",
    name: "Vite",
    detect: () => Promise.resolve({ found: true, summary: "" }),
    async start(options) {
      started.push(options)
      await start?.(options)
      return {
        guestUrl: `http://127.0.0.1:${options.port ?? 5173}/guest`,
        toolVersion: "8.0.0",
        close,
        ...(served ? { served } : {})
      }
    }
  }
  return { builder, started, close }
}

const servedRecord: ServedRecord = {
  files: { "/app/src/button.tsx": { mtime: 1, size: 120 } },
  modules: { "/src/button.tsx": { hash: "abc", files: ["/app/src/button.tsx"] } },
  made: { "virtual:canvas/guest": "def" },
  build: []
}

/**
 * A builder's process and the service's side of it, joined as Node's IPC would join them: each message is a copy,
 * delivered a moment later. The process ends when it exits, or when the service kills it.
 */
function connect(
  builder: BuilderAdapter,
  settings: BuilderProcessClientOptions = {},
  times: () => ProcessTimes = () => ({ cpu: 0, uptime: 1, memory: 0 })
) {
  const later = (deliver: () => void) => setTimeout(deliver, 0)
  // oxlint-disable-next-line unicorn/prefer-structured-clone -- messages cross the process boundary as JSON
  const copy = <T>(message: T): T => JSON.parse(JSON.stringify(message)) as T
  const exit = vi.fn<(reason: string) => void>((reason) => later(() => client.exited(reason)))
  const kill = vi.fn<() => void>(() => exit("killed"))
  const serve = serveBuilderProcess(
    {
      send: (reply: BuilderProcessReply) => later(() => client.receive(copy(reply))),
      usage: times,
      exit: () => exit("exit code 0")
    },
    [builder]
  )
  const sent: BuilderProcessRequest[] = []
  const client = connectBuilderProcess(
    {
      send: (request) => {
        sent.push(request)
        later(() => serve(copy(request)))
      },
      kill
    },
    builderProcessOptions(builder, startOptions),
    settings
  )
  return { client, sent, exit, kill }
}

describe("builderProcessOptions", () => {
  it("names the builder by id and keeps the renderer's data, so the options cross as data", () => {
    const { builder } = fakeBuilder()
    const options = builderProcessOptions(builder, startOptions)
    expect(options.builder).toBe("vite")
    expect(options.renderer).toEqual({
      id: "react",
      name: "React",
      guestModule: "@parity-app/renderer-react/guest",
      runtimePackages: ["react"],
      runtimeImports: []
    })
    expect(structuredClone(options)).toEqual(options)
    // oxlint-disable-next-line unicorn/prefer-structured-clone -- the test checks the options survive JSON
    expect(JSON.parse(JSON.stringify(options)) as BuilderProcessOptions).toEqual(options)
  })
})

describe("a builder in its own process", () => {
  it("starts the builder named, on the port asked for", async () => {
    const { builder, started } = fakeBuilder()
    const session = await connect(builder).client.session
    expect(session.guestUrl).toBe("http://127.0.0.1:5400/guest")
    expect(session.toolVersion).toBe("8.0.0")
    expect(started[0]?.renderer.runtimePackages).toEqual(["react"])
    expect(started[0]?.port).toBe(5400)
  })

  it("serves the guest from the components it's sent, in place", async () => {
    const { builder, started } = fakeBuilder()
    const session = await connect(builder).client.session
    const served = started[0]!.config.components
    session.setComponents({ Card: { path: "src/card.tsx", export: "Card" } })
    await vi.waitFor(() => expect(Object.keys(served)).toEqual(["Card"]))
    expect(started[0]!.config.components).toBe(served)
  })

  it("closes the builder, then the process, and resolves once the process has ended", async () => {
    const { builder, close } = fakeBuilder()
    const { client, exit } = connect(builder)
    const session = await client.session
    await session.close()
    expect(close).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledWith("exit code 0")
  })

  it("hands on what the builder served as it closes, asked before the builder closes", async () => {
    const order: string[] = []
    const { builder, close } = fakeBuilder(undefined, () => {
      order.push("served")
      return Promise.resolve(servedRecord)
    })
    close.mockImplementation(() => {
      order.push("close")
      return Promise.resolve()
    })
    const { client } = connect(builder)
    const session = await client.session
    expect(session.servedRecord()).toBeUndefined()
    await session.close()
    expect(session.servedRecord()).toEqual(servedRecord)
    expect(order).toEqual(["served", "close"])
  })

  it("has no record from a builder that can't say what it served, or that ended by itself", async () => {
    const silent = await connect(fakeBuilder().builder).client.session
    await silent.close()
    expect(silent.servedRecord()).toBeUndefined()

    const crashing = connect(fakeBuilder(undefined, () => Promise.resolve(servedRecord)).builder)
    const crashed = await crashing.client.session
    crashing.client.exited("Vite stopped by itself, with exit code 1")
    await crashed.close()
    expect(crashed.servedRecord()).toBeUndefined()
  })

  it("ends a process whose builder doesn't close in time", async () => {
    const { builder, close } = fakeBuilder()
    close.mockImplementation(() => new Promise(() => undefined))
    const { client, kill } = connect(builder, { closeTimeout: 10 })
    await (await client.session).close()
    expect(kill).toHaveBeenCalledTimes(1)
  })

  it("fails the start with the builder's error, and ends the process", async () => {
    const { builder } = fakeBuilder(() => Promise.reject(new Error("Vite is not installed in /app")))
    const { client, exit } = connect(builder)
    await expect(client.session).rejects.toThrow("Vite is not installed in /app")
    await vi.waitFor(() => expect(exit).toHaveBeenCalled())
  })

  it("fails the start with why, when the process ends before the builder starts", async () => {
    const { builder } = fakeBuilder(() => new Promise(() => undefined))
    const { client } = connect(builder)
    client.exited("Vite stopped by itself, with exit code 3")
    await expect(client.session).rejects.toThrow("Vite stopped by itself, with exit code 3")
  })

  it("reports a process that ends by itself once started, but not one it closed", async () => {
    const onCrash = vi.fn<(reason: string) => void>()
    const crashing = connect(fakeBuilder().builder, { onCrash })
    await crashing.client.session
    crashing.client.exited("Vite stopped by itself, with exit code 1")
    expect(onCrash).toHaveBeenCalledWith("Vite stopped by itself, with exit code 1")

    const closing = connect(fakeBuilder().builder, { onCrash })
    await (await closing.client.session).close()
    expect(onCrash).toHaveBeenCalledTimes(1)
  })

  it("reads its CPU as a share of the computer since it was last asked, and since it started at first", async () => {
    const readings = [
      { cpu: 2_000_000, uptime: 4000, memory: 300 },
      { cpu: 3_000_000, uptime: 5000, memory: 310 }
    ]
    const { client } = connect(fakeBuilder().builder, { cores: 4 }, () => readings.shift()!)
    const session = await client.session
    // Two seconds of CPU in four: half a core, an eighth of four.
    expect(await session.usage()).toEqual({ cpu: 12.5, memory: 300 })
    // One second in the next one: a whole core.
    expect(await session.usage()).toEqual({ cpu: 25, memory: 310 })
  })

  it("answers usage with nothing once the process has ended", async () => {
    const { client } = connect(fakeBuilder().builder)
    const session = await client.session
    client.exited("killed")
    expect(await session.usage()).toBeUndefined()
  })
})
