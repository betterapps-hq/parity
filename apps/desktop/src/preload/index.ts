import { createChannel, domPort, type Handlers, plainErrors } from "@parity-app/channel"
import { contextBridge, ipcRenderer } from "electron"
import { ipc } from "../shared/channels.ts"
import {
  type CanvasHost,
  type ConsoleChange,
  type ServeAnswer,
  type ServiceMethods,
  type WindowMethod,
  type WindowMethods,
  type WindowParams,
  windowMethods
} from "../shared/protocol.ts"
import { ask, tell } from "./main.ts"
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
  if (showUpdateListeners.size === 0) {
    pendingShowUpdate = true
  } else {
    for (const listener of showUpdateListeners) {
      listener()
    }
  }
})

ipcRenderer.on(ipc.port, (event) => {
  const next = event.ports[0]

  if (!next) {
    return
  }

  service.connect(domPort(next))
  connections++

  if (connections > 1) {
    for (const listener of reconnectListeners) {
      listener()
    }
  }
})

/**
 * The page's one handler as the channel's handlers. The page answers with data, since a failure thrown across the
 * bridge keeps only its message; its details go back to the service as they came.
 */
function windowHandlers(
  handler: (method: WindowMethod, params: WindowParams) => Promise<ServeAnswer>
): Handlers<WindowMethods> {
  const answer = async (method: WindowMethod, params: WindowParams) => {
    const reply = await handler(method, params)

    if ("error" in reply) {
      throw plainErrors.decode(reply.error, reply.details)
    }

    return reply.result
  }

  // SAFETY: `windowMethods` lists every key of `WindowMethods`, and each entry answers through the page's one handler.
  return Object.fromEntries(
    windowMethods.map((method) => [method, (params: WindowParams) => answer(method, params)])
  ) as Handlers<WindowMethods>
}

/**
 * The bridge to the page. What it asks main is one line a method, each typed by `hostMethods` through `ask` and `tell`,
 * so a line that sends the wrong thing, or promises the page something main doesn't answer, doesn't compile (PAR-965).
 */
const host: CanvasHost = {
  appVersion:
    process.argv.find((argument) => argument.startsWith("--parity-version="))?.slice("--parity-version=".length) ??
    "unknown",
  getBuildInfo: () => ask("buildInfo"),
  telemetry: {
    get: () => ask("telemetryState"),
    setLevel: (level) => ask("telemetryLevel", level)
  },
  report: {
    prepare: () => ask("reportPrepare"),
    send: (report) => ask("reportSend", report),
    lastCrash: () => ask("reportLastCrash")
  },
  updates: {
    get: () => ask("updateState"),
    check: () => ask("updateCheck"),
    setBeta: (beta) => ask("updateBeta", beta),
    act: () => ask("updateAct"),
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
    get: () => ask("accountState"),
    subscribe: (listener) => {
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- account state as main sends it, which the window checks against `accountState` as it arrives
      const changed = (_event: Electron.IpcRendererEvent, state: unknown) => listener(state)
      ipcRenderer.on(ipc.accountChanged, changed)

      return () => {
        ipcRenderer.removeListener(ipc.accountChanged, changed)
      }
    },
    signIn: (request) => ask("accountSignIn", request),
    reopen: () => ask("accountReopen"),
    cancel: () => ask("accountCancel"),
    signOut: (email) => ask("accountSignOut", email),
    switchOrganization: (organizationId) => ask("accountSwitch", organizationId),
    use: (email) => ask("accountUse", email)
  },
  connectors: {
    get: () => ask("connectorsState"),
    search: (search) => ask("connectorsSearch", search),
    recent: () => ask("connectorsRecent"),
    placed: (placed) => ask("connectorsPlaced", placed)
  },
  initialProject: process.argv
    .find((argument) => argument.startsWith("--parity-initial-project="))
    ?.split("=")
    .slice(1)
    .join("="),
  ask: (method, params, trace) =>
    service.request(method, params, trace).then(
      (result) => ({ result }),
      (cause: unknown) => plainErrors.encode(cause)
    ),
  serve(next) {
    service.serve(windowHandlers(next))
  },
  onReconnect(listener) {
    reconnectListeners.add(listener)
  },
  pickFolder: (title) => ask("pickFolder", title),
  pickProjectFile: () => ask("pickProjectFile"),
  saveFile: (options) => ask("saveDialog", options),
  showItem: (path) => ask("showItem", path),
  copiedFiles: () => ask("copiedFiles"),
  openInEditor: (request) => ask("openInEditor", request),
  installCli: () => ask("installCli"),
  quit: () => ask("quit"),
  toggleDevTools: () => ask("toggleDevTools"),
  setTheme: (theme) => ask("setTheme", theme),
  metrics: () => ask("metrics"),
  console: {
    announce: (level, context) => tell("consoleAnnounce", { level, ...context }),
    read: (origin) => ask("consoleRead", origin),
    clear: (origin) => ask("consoleClear", origin),
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
      tell("closePending")
      listener().then(
        (close) => tell(close ? "closeReady" : "closeCancel"),
        () => tell("closeCancel")
      )
    })
  }
}

contextBridge.exposeInMainWorld("canvasHost", host)

exposeTelemetry()
