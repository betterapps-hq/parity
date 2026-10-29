import { contextBridge, ipcRenderer } from "electron"
import type { CanvasHost, ChannelMessage, ProcessUsage, WindowMethod } from "../shared/protocol.ts"

interface Pending {
  resolve(value: unknown): void
  reject(error: Error): void
}

let port: MessagePort | undefined
let nextId = 1
const pending = new Map<number, Pending>()
const queued: ChannelMessage[] = []
let handler: ((method: WindowMethod, params: unknown) => Promise<unknown>) | undefined
const reconnectListeners = new Set<() => void>()

function send(message: ChannelMessage): void {
  if (port) port.postMessage(message)
  else queued.push(message)
}

ipcRenderer.on("canvas:port", (event) => {
  const next = event.ports[0]
  if (!next) return
  // A second channel means the service restarted: what was asked of the old one won't be answered.
  const reconnected = port !== undefined
  port?.close()
  port = next
  if (reconnected) {
    for (const request of pending.values()) request.reject(new Error("The project service restarted"))
    pending.clear()
  }
  port.onmessage = ({ data }: MessageEvent<ChannelMessage>) => {
    if (data.type === "response") {
      const request = pending.get(data.id)
      if (!request) return
      pending.delete(data.id)
      if (data.error === undefined) request.resolve(data.result)
      else request.reject(new Error(data.error))
      return
    }
    const answer = handler
      ? handler(data.method as WindowMethod, data.params)
      : Promise.reject(new Error("The canvas window isn't ready yet"))
    answer.then(
      (result) => send({ type: "response", id: data.id, result }),
      (error: unknown) =>
        send({ type: "response", id: data.id, error: error instanceof Error ? error.message : String(error) })
    )
  }
  for (const message of queued.splice(0)) port.postMessage(message)
  if (reconnected) for (const listener of reconnectListeners) listener()
})

const host: CanvasHost = {
  request(method, params) {
    return new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      send({ type: "request", id, method, params })
    })
  },
  serve(next) {
    handler = next
  },
  onReconnect(listener) {
    reconnectListeners.add(listener)
  },
  pickFolder: (title) => ipcRenderer.invoke("canvas:pick-folder", title) as Promise<string | undefined>,
  pickProjectFile: () => ipcRenderer.invoke("canvas:pick-project-file") as Promise<string | undefined>,
  saveFile: (options) => ipcRenderer.invoke("canvas:save-dialog", options) as Promise<string | undefined>,
  showItem: (path) => ipcRenderer.invoke("canvas:show-item", path) as Promise<void>,
  quit: () => ipcRenderer.invoke("canvas:quit") as Promise<void>,
  setTheme: (theme) => ipcRenderer.invoke("canvas:set-theme", theme) as Promise<void>,
  metrics: () => ipcRenderer.invoke("canvas:metrics") as Promise<ProcessUsage[]>,
  onClosing(listener) {
    ipcRenderer.on("canvas:closing", () => {
      ipcRenderer.send("canvas:close-pending")
      listener().then(
        (close) => ipcRenderer.send(close ? "canvas:close-ready" : "canvas:close-cancel"),
        () => ipcRenderer.send("canvas:close-ready")
      )
    })
  }
}

contextBridge.exposeInMainWorld("canvasHost", host)
