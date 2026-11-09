import { createChannel, domPort, type Handlers, plainErrors } from "@parity-app/channel"
import { contextBridge, ipcRenderer } from "electron"
import type { SignInRequest } from "../shared/account.ts"
import { ipc } from "../shared/channels.ts"
import {
  type CanvasHost,
  type ConsoleChange,
  type LoggedEntry,
  type OpenInEditorRequest,
  type ProcessUsage,
  type SaveDialogOptions,
  type ServeAnswer,
  type ServiceMethods,
  type WindowMethod,
  type WindowMethods,
  type WindowParams,
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
 * Asks main over IPC. Main's handler for each channel, in `main/index.ts`, returns what the matching `CanvasHost`
 * method promises, and main checks what it's sent; this script and main ship together.
 */
function invoke<Result>(channel: string, argument?: InvokeArgument): Promise<Result> {
  // SAFETY: main's handler for `channel` answers with the `Result` its `CanvasHost` method names.
  return ipcRenderer.invoke(channel, argument) as Promise<Result>
}

/** What a window sends main with a request: text, such as an email, a path or a theme, or one of these requests. */
type InvokeArgument = string | SignInRequest | SaveDialogOptions | OpenInEditorRequest

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
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- account state as main sends it, which the window checks against `accountState` as it arrives
      const changed = (_event: Electron.IpcRendererEvent, state: unknown) => listener(state)
      ipcRenderer.on(ipc.accountChanged, changed)

      return () => {
        ipcRenderer.removeListener(ipc.accountChanged, changed)
      }
    },
    signIn: (request) => invoke<void>(ipc.accountSignIn, request),
    reopen: () => invoke<void>(ipc.accountReopen),
    cancel: () => invoke<void>(ipc.accountCancel),
    signOut: (email) => invoke<void>(ipc.accountSignOut, email),
    switchOrganization: (organizationId) => invoke<void>(ipc.accountSwitch, organizationId),
    use: (email) => invoke<void>(ipc.accountUse, email)
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
  pickFolder: (title) => invoke<string | undefined>(ipc.pickFolder, title),
  pickProjectFile: () => invoke<string | undefined>(ipc.pickProjectFile),
  saveFile: (options) => invoke<string | undefined>(ipc.saveDialog, options),
  showItem: (path) => invoke<void>(ipc.showItem, path),
  openInEditor: (request) => invoke<{ opened: string }>(ipc.openInEditor, request),
  quit: () => invoke<void>(ipc.quit),
  toggleDevTools: () => invoke<void>(ipc.toggleDevTools),
  setTheme: (theme) => invoke<void>(ipc.setTheme, theme),
  metrics: () => invoke<ProcessUsage[]>(ipc.metrics),
  console: {
    announce: (level, context) => ipcRenderer.send(ipc.consoleAnnounce, { level, ...context }),
    read: (origin) => invoke<LoggedEntry[]>(ipc.consoleRead, origin),
    clear: (origin) => invoke<void>(ipc.consoleClear, origin),
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
