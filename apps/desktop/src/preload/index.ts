import { createChannel, domPort, type Handlers, plainErrors } from "@parity-app/channel"
import { contextBridge, ipcRenderer } from "electron"
import { ipc } from "../shared/channels.ts"
import {
  type CanvasHost,
  type ConsoleChange,
  type LoggedEntry,
  type ProcessUsage,
  type ServeAnswer,
  type ServiceMethods,
  type WindowMethod,
  type WindowMethods,
  windowMethods
} from "../shared/protocol.ts"
import { exposeTelemetry } from "./telemetry.ts"

/**
 * The window's channel to the project service. Requests wait until main gives the page its port, and a second port
 * means the service restarted: what was asked of the old one won't be answered.
 */
const service = createChannel<WindowMethods, ServiceMethods>({
  notServing: () => new Error("The canvas window isn't ready yet"),
  disconnected: () => new Error("The project service restarted")
})
const reconnectListeners = new Set<() => void>()
const showUpdateListeners = new Set<() => void>()
let pendingShowUpdate = false
let connections = 0

// A native menu action may arrive after load but before React mounts and subscribes.
ipcRenderer.on(ipc.showUpdates, () => {
  if (showUpdateListeners.size === 0) pendingShowUpdate = true
  else for (const listener of showUpdateListeners) listener()
})

ipcRenderer.on(ipc.port, (event) => {
  const next = event.ports[0]
  if (!next) return
  service.connect(domPort(next))
  connections++
  if (connections > 1) for (const listener of reconnectListeners) listener()
})

/**
 * The page's one handler as the channel's handlers. The page answers with data, since a failure thrown across the
 * bridge keeps only its message; its details go back to the service as they came.
 */
function windowHandlers(
  handler: (method: WindowMethod, params: unknown) => Promise<ServeAnswer>
): Handlers<WindowMethods> {
  const answer = async (method: WindowMethod, params: unknown) => {
    const reply = await handler(method, params)
    if ("error" in reply) throw plainErrors.decode(reply.error, reply.details)
    return reply.result
  }
  return Object.fromEntries(
    windowMethods.map((method) => [method, (params: unknown) => answer(method, params)])
  ) as Handlers<WindowMethods>
}
const host: CanvasHost = {
  appVersion:
    process.argv.find((argument) => argument.startsWith("--parity-version="))?.slice("--parity-version=".length) ??
    "unknown",
  getBuildInfo: () => ipcRenderer.invoke(ipc.buildInfo),
  telemetry: {
    get: () => ipcRenderer.invoke(ipc.telemetryState),
    setLevel: (level) => ipcRenderer.invoke(ipc.telemetryLevel, level)
  },
  report: {
    prepare: () => ipcRenderer.invoke(ipc.reportPrepare),
    send: (report) => ipcRenderer.invoke(ipc.reportSend, report),
    lastCrash: () => ipcRenderer.invoke(ipc.reportLastCrash)
  },
  updates: {
    get: () => ipcRenderer.invoke(ipc.updateState),
    check: () => ipcRenderer.invoke(ipc.updateCheck),
    setBeta: (beta) => ipcRenderer.invoke(ipc.updateBeta, beta),
    act: () => ipcRenderer.invoke(ipc.updateAct),
    subscribe: (listener) => {
      const changed = (_event: Electron.IpcRendererEvent, state: Parameters<typeof listener>[0]) => listener(state)
      ipcRenderer.on(ipc.updateChanged, changed)
      return () => {
        ipcRenderer.removeListener(ipc.updateChanged, changed)
      }
    },
    onShow: (listener) => {
      showUpdateListeners.add(listener)
      if (pendingShowUpdate) {
        pendingShowUpdate = false
        listener()
      }
      return () => {
        showUpdateListeners.delete(listener)
      }
    }
  },
  account: {
    get: () => ipcRenderer.invoke(ipc.accountState),
    subscribe: (listener) => {
      const changed = (_event: Electron.IpcRendererEvent, state: unknown) => listener(state)
      ipcRenderer.on(ipc.accountChanged, changed)
      return () => {
        ipcRenderer.removeListener(ipc.accountChanged, changed)
      }
    },
    signIn: (request) => ipcRenderer.invoke(ipc.accountSignIn, request) as Promise<void>,
    reopen: () => ipcRenderer.invoke(ipc.accountReopen) as Promise<void>,
    cancel: () => ipcRenderer.invoke(ipc.accountCancel) as Promise<void>,
    signOut: (email) => ipcRenderer.invoke(ipc.accountSignOut, email) as Promise<void>,
    switchOrganization: (organizationId) => ipcRenderer.invoke(ipc.accountSwitch, organizationId) as Promise<void>,
    use: (email) => ipcRenderer.invoke(ipc.accountUse, email) as Promise<void>
  },
  initialProject: process.argv
    .find((argument) => argument.startsWith("--parity-initial-project="))
    ?.split("=")
    .slice(1)
    .join("="),
  ask: (method, params, trace) =>
    service.request(method, params, trace).then(
      (result) => ({ result }),
      (error: unknown) => plainErrors.encode(error)
    ),
  serve(next) {
    service.serve(windowHandlers(next))
  },
  onReconnect(listener) {
    reconnectListeners.add(listener)
  },
  pickFolder: (title) => ipcRenderer.invoke(ipc.pickFolder, title) as Promise<string | undefined>,
  pickProjectFile: () => ipcRenderer.invoke(ipc.pickProjectFile) as Promise<string | undefined>,
  saveFile: (options) => ipcRenderer.invoke(ipc.saveDialog, options) as Promise<string | undefined>,
  showItem: (path) => ipcRenderer.invoke(ipc.showItem, path) as Promise<void>,
  openInEditor: (request) => ipcRenderer.invoke(ipc.openInEditor, request) as Promise<{ opened: string }>,
  quit: () => ipcRenderer.invoke(ipc.quit) as Promise<void>,
  toggleDevTools: () => ipcRenderer.invoke(ipc.toggleDevTools) as Promise<void>,
  setTheme: (theme) => ipcRenderer.invoke(ipc.setTheme, theme) as Promise<void>,
  metrics: () => ipcRenderer.invoke(ipc.metrics) as Promise<ProcessUsage[]>,
  console: {
    announce: (level, context) => ipcRenderer.send(ipc.consoleAnnounce, { level, ...context }),
    read: (origin) => ipcRenderer.invoke(ipc.consoleRead, origin) as Promise<LoggedEntry[]>,
    clear: (origin) => ipcRenderer.invoke(ipc.consoleClear, origin) as Promise<void>,
    subscribe: (listener) => {
      const changed = (_event: Electron.IpcRendererEvent, change: ConsoleChange) => listener(change)
      ipcRenderer.on(ipc.consoleChanged, changed)
      return () => {
        ipcRenderer.removeListener(ipc.consoleChanged, changed)
      }
    }
  },
  onClosing(listener) {
    ipcRenderer.on(ipc.closing, () => {
      ipcRenderer.send(ipc.closePending)
      listener().then(
        (close) => ipcRenderer.send(close ? ipc.closeReady : ipc.closeCancel),
        () => ipcRenderer.send(ipc.closeCancel)
      )
    })
  }
}

contextBridge.exposeInMainWorld("canvasHost", host)
exposeTelemetry()
