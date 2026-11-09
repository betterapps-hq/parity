import { EventEmitter } from "node:events"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"
import type { Envelope } from "@parity-app/telemetry"
import { build } from "esbuild"
import { beforeAll, describe, expect, it, vi } from "vite-plus/test"
import type { BuildInfo, CanvasHost } from "../shared/protocol.ts"
import { secretScrubbing } from "../shared/secret-scrubbing.ts"
import { projectEnvSecrets } from "../utility/env-secrets.ts"
import type { TelemetryHost } from "./telemetry.ts"

let code = ""

beforeAll(async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("./index.ts", import.meta.url))],
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    write: false
  })

  code = result.outputFiles[0]!.text
})

/** Run the real preload against Electron's IPC boundary, without a browser or an app process. */
function preload() {
  const ipc = new EventEmitter()

  const invoke = vi.fn<(channel: string) => Promise<Partial<BuildInfo> | string[] | undefined>>(async () => ({
    version: "0.3.0",
    channel: "beta"
  }))

  const send = vi.fn<(channel: string, value?: Envelope) => void>()
  let host: CanvasHost | undefined
  let telemetry: TelemetryHost | undefined
  runInNewContext(code, {
    require: (name: string) => {
      if (name !== "electron") {
        throw new Error(`Unexpected preload dependency ${name}`)
      }

      return {
        ipcRenderer: Object.assign(ipc, { invoke, send }),
        contextBridge: {
          exposeInMainWorld: (key: string, value: CanvasHost | TelemetryHost) => {
            if (key === "canvasHost" && "ask" in value) {
              host = value
            }

            if (key === "parityTelemetry" && "record" in value) {
              telemetry = value
            }
          }
        }
      }
    },
    process: { argv: [`--parity-telemetry-run=${encodeURIComponent(JSON.stringify(run))}`] }
  })

  if (!host) {
    throw new Error("Preload did not expose the canvas host")
  }

  if (!telemetry) {
    throw new Error("Preload did not expose telemetry")
  }

  return { ipc, host, invoke, send, telemetry }
}

const run = { installId: "install", sessionId: "session", check: true }

it("scrubs a value from the open project's .env from what a window sends", async () => {
  const root = await mkdtemp(join(tmpdir(), "parity-env-"))
  await writeFile(join(root, ".env"), "DATABASE_PASSWORD=hunter2-correct-horse\nPORT=5173\n")
  await writeFile(join(root, ".env.local"), "export SHOP_NAME='quiet-meadow-shop'\n")
  await writeFile(join(root, "notes.txt"), "NOT_READ=not-an-env-value\n")
  const secrets = await projectEnvSecrets([root])
  expect(secrets).toEqual(["hunter2-correct-horse", "quiet-meadow-shop"])

  // Main answers the window's ask with what the service read, and tells it of changes.
  const { ipc, invoke, telemetry } = preload()
  invoke.mockImplementation(async (channel) => (channel === "canvas:telemetry-secrets" ? [] : undefined))
  const scrubber = secretScrubbing()
  const recorded = { setSecrets: vi.fn<(secrets: Iterable<string>) => void>() }
  scrubber.follow(recorded)
  telemetry.onSecrets((next) => scrubber.use(next))
  await vi.waitFor(() => expect(recorded.setSecrets).toHaveBeenCalledTimes(2))
  ipc.emit("canvas:telemetry-secrets-changed", {}, secrets)

  const event = {
    message: "Couldn't connect with hunter2-correct-horse",
    extra: { shop: "quiet-meadow-shop", port: "5173" }
  }

  const sent = scrubber.value(event)
  expect(JSON.stringify(sent)).not.toMatch(/hunter2|quiet-meadow/)
  expect(sent.extra.port).toBe("5173")
  expect(recorded.setSecrets).toHaveBeenLastCalledWith(secrets)
})

it("gives the page main's run and sends main what it records", () => {
  const { telemetry, send } = preload()
  expect(telemetry.run).toEqual(run)

  const envelope = {
    installId: "install",
    sessionId: "session",
    process: "renderer",
    name: "app.started",
    time: "2026-11-06T17:00:00.000Z",
    level: "info",
    attributes: {}
  } as const

  telemetry.record(envelope)
  expect(send).toHaveBeenCalledExactlyOnceWith("canvas:telemetry", envelope)
})

it("exposes installed build identity through its own IPC request", async () => {
  const { host, invoke } = preload()
  expect(await host.getBuildInfo()).toEqual({ version: "0.3.0", channel: "beta" })
  expect(invoke).toHaveBeenCalledExactlyOnceWith("canvas:build-info")
})

describe("native update menu handoff", () => {
  it("delivers a menu action that arrived before React registered its listener", () => {
    const { ipc, host } = preload()
    ipc.emit("canvas:show-updates")
    const show = vi.fn<() => void>()
    host.updates.onShow(show)
    expect(show).toHaveBeenCalledOnce()
  })

  it("coalesces early clicks and does not replay them to another subscription", () => {
    const { ipc, host } = preload()
    ipc.emit("canvas:show-updates")
    ipc.emit("canvas:show-updates")
    const first = vi.fn<() => void>()
    host.updates.onShow(first)
    const second = vi.fn<() => void>()
    host.updates.onShow(second)
    expect(first).toHaveBeenCalledOnce()
    expect(second).not.toHaveBeenCalled()
  })

  it("removes a listener and queues the next action for its replacement", () => {
    const { ipc, host } = preload()
    const old = vi.fn<() => void>()
    const remove = host.updates.onShow(old)
    ipc.emit("canvas:show-updates")
    remove()
    ipc.emit("canvas:show-updates")
    const next = vi.fn<() => void>()
    host.updates.onShow(next)
    expect(old).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledOnce()
  })
})

/** A message on the window's port to the service, as the channel sends and answers them. */
interface PortMessage {
  type: string
  id: number
  method?: string
  params?: object
  result?: object
}

/** A DOM `MessagePort` the test holds the other end of: what the preload sends, and a way to answer. */
function fakePort() {
  const listeners = new Map<string, ((event: { data?: PortMessage }) => void)[]>()
  const sent: PortMessage[] = []

  return {
    sent,
    port: {
      postMessage: (message: PortMessage) => sent.push(message),
      addEventListener: (type: string, listener: (event: { data?: PortMessage }) => void) =>
        listeners.set(type, [...(listeners.get(type) ?? []), listener]),
      start: () => undefined,
      close: () => undefined
    },
    deliver: (data: PortMessage) => {
      for (const listener of listeners.get("message") ?? []) {
        listener({ data })
      }
    }
  }
}

describe("the window's channel to the project service", () => {
  it("holds requests until main gives the page its port, then matches the reply", async () => {
    const { ipc, host } = preload()
    const opened = host.ask("project.open", { root: "D:/shop" })
    const first = fakePort()
    ipc.emit("canvas:port", { ports: [first.port] })
    expect(first.sent).toEqual([{ type: "request", id: 1, method: "project.open", params: { root: "D:/shop" } }])
    first.deliver({ type: "response", id: 1, result: { id: "D:/shop" } })
    expect(await opened).toEqual({ result: { id: "D:/shop" } })
  })

  it("fails what the old service was asked when a new port comes, and says it reconnected", async () => {
    const { ipc, host } = preload()
    const reconnected = vi.fn<() => void>()
    host.onReconnect(reconnected)
    ipc.emit("canvas:port", { ports: [fakePort().port] })
    const lost = host.ask("processes.list", {})
    ipc.emit("canvas:port", { ports: [fakePort().port] })
    expect(await lost).toEqual({ error: "The project service restarted" })
    expect(reconnected).toHaveBeenCalledOnce()
  })

  it("answers the service through the page's handler, passing a failure's details back", async () => {
    const { ipc, host } = preload()
    const { port, sent, deliver } = fakePort()
    ipc.emit("canvas:port", { ports: [port] })
    deliver({ type: "request", id: 7, method: "agent.tabs" })
    await vi.waitFor(() => expect(sent).toContainEqual(expect.objectContaining({ id: 7 })))
    expect(sent.at(-1)).toEqual({ type: "response", id: 7, error: "The canvas window isn't ready yet" })

    host.serve(async (method) =>
      method === "agent.tabs"
        ? { result: [] }
        : { error: "No tab is open", details: { code: "unknown_tab", retryable: false } }
    )
    deliver({ type: "request", id: 8, method: "agent.tabs" })
    deliver({ type: "request", id: 9, method: "agent.snapshot", params: {} })
    await vi.waitFor(() => expect(sent).toHaveLength(3))
    expect(sent.slice(1)).toEqual([
      { type: "response", id: 8, result: [] },
      { type: "response", id: 9, error: "No tab is open", details: { code: "unknown_tab", retryable: false } }
    ])
  })
})
