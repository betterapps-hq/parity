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
  let host: CanvasHost | undefined
  runInNewContext(code, {
    require: (name: string) => {
      if (name !== "electron") throw new Error(`Unexpected preload dependency ${name}`)
      return {
        ipcRenderer: ipc,
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
  return { ipc, host }
}

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
