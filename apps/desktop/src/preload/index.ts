import { createChannel, domPort, type Handlers, plainErrors } from "@parity-app/channel"
import type { Found } from "@parity-app/connectors"
import { contextBridge, ipcRenderer } from "electron"
import type { SignInRequest } from "../shared/account.ts"
import { ipc } from "../shared/channels.ts"
import type { ConnectorSearch } from "../shared/connectors.ts"
import {
  type CanvasHost,
  type ConsoleChange,
  type LoggedEntry,
  type OpenInEditorRequest,
  type ProblemReportRequest,
  type ProcessUsage,
  type SaveDialogOptions,
  type ServeAnswer,
  type ServiceMethods,
  type WindowMethod,
  type WindowMethods,
  type WindowParams,
  windowMethods
} from "../shared/protocol.ts"
import { exposeTelemetry, withTrace } from "./telemetry.ts"

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
 * Asks main over IPC, in the page's trace (PAR-810). Main's handler for each channel, in `main/index.ts`, returns what
 * the matching `CanvasHost` method promises, and main checks what it's sent; this script and main ship together.
 */
function invoke<Result>(channel: string, argument?: InvokeArgument): Promise<Result> {
  // SAFETY: main's handler for `channel` answers with the `Result` its `CanvasHost` method names.
  return ipcRenderer.invoke(channel, ...withTrace(argument)) as Promise<Result>
}

/** Tells main something over IPC, in the page's trace, without waiting for an answer. */
function send(channel: string, argument?: ConsoleAnnouncement): void {
  ipcRenderer.send(channel, ...withTrace(argument))
}

/**
 * What a window sends main with a request: text, such as an email, a path or a theme, a setting, or one of these
 * requests.
 */
type InvokeArgument =
  | string
  | boolean
  | SignInRequest
  | SaveDialogOptions
  | OpenInEditorRequest
  | ProblemReportRequest
  | ConnectorSearch
  | { connector: string; key: string }
  | Found

/** What a window says before a console message: its level and the frame it comes from. */
type ConsoleAnnouncement = { level: Parameters<CanvasHost["console"]["announce"]>[0] } & Parameters<
  CanvasHost["console"]["announce"]
>[1]

const host: CanvasHost = {
  appVersion:
    process.argv.find((argument) => argument.startsWith("--parity-version="))?.slice("--parity-version=".length) ??
    "unknown",
  getBuildInfo: () => invoke(ipc.buildInfo),
  telemetry: {
    get: () => invoke(ipc.telemetryState),
    setLevel: (level) => invoke(ipc.telemetryLevel, level)
  },
  report: {
    prepare: () => invoke(ipc.reportPrepare),
    send: (report) => invoke(ipc.reportSend, report),
    lastCrash: () => invoke(ipc.reportLastCrash)
  },
  updates: {
    get: () => invoke(ipc.updateState),
    check: () => invoke(ipc.updateCheck),
    setBeta: (beta) => invoke(ipc.updateBeta, beta),
    act: () => invoke(ipc.updateAct),
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
    get: () => invoke(ipc.accountState),
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
  connectors: {
    get: () => invoke(ipc.connectorsState),
    search: (search) => invoke(ipc.connectorsSearch, search),
    recent: () => invoke(ipc.connectorsRecent),
    picked: (found) => invoke<void>(ipc.connectorsPicked, found)
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
    announce: (level, context) => send(ipc.consoleAnnounce, { level, ...context }),
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
        (close) => send(close ? ipc.closeReady : ipc.closeCancel),
        () => send(ipc.closeCancel)
      )
    })
  }
}

contextBridge.exposeInMainWorld("canvasHost", host)

exposeTelemetry()
