import { EventEmitter } from "node:events"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"
import { build } from "esbuild"
import { beforeAll, describe, expect, it, vi } from "vite-plus/test"
import type { CanvasHost } from "../shared/protocol.ts"

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
  const invoke = vi.fn<(channel: string) => Promise<unknown>>(async () => ({ version: "0.3.0", channel: "beta" }))
  let host: CanvasHost | undefined
  runInNewContext(code, {
    require: (name: string) => {
      if (name !== "electron") throw new Error(`Unexpected preload dependency ${name}`)
      return {
        ipcRenderer: Object.assign(ipc, { invoke }),
        contextBridge: {
          exposeInMainWorld: (_key: string, value: CanvasHost) => {
            host = value
          }
        }
      }
    },
    process: { argv: [] }
  })
  if (!host) throw new Error("Preload did not expose the canvas host")
  return { ipc, host, invoke }
}

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

/** A DOM `MessagePort` the test holds the other end of: what the preload sends, and a way to answer. */
function fakePort() {
  const listeners = new Map<string, ((event: { data?: unknown }) => void)[]>()
  const sent: { type: string; id: number; method?: string }[] = []
  return {
    sent,
    port: {
      postMessage: (message: { type: string; id: number; method?: string }) => sent.push(message),
      addEventListener: (type: string, listener: (event: { data?: unknown }) => void) =>
        listeners.set(type, [...(listeners.get(type) ?? []), listener]),
      start: () => undefined,
      close: () => undefined
    },
    deliver: (data: unknown) => {
      for (const listener of listeners.get("message") ?? []) listener({ data })
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
