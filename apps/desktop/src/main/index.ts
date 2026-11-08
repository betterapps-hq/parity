import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, watch, writeFileSync } from "node:fs"
import { readFile, utimes } from "node:fs/promises"
import { availableParallelism, homedir } from "node:os"
import { join } from "node:path"
import { agentRegistry, readEntries, removeEntry } from "@parity-app/agent/registry"
import { type Channel, createChannel, nodePort } from "@parity-app/channel"
import {
  drawsNothing,
  fitInside,
  offscreenWindows,
  previewSizes,
  type RenderPriority,
  renderQueue
} from "@parity-app/core"
import { type Span, telemetryFileName } from "@parity-app/telemetry"
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  MessageChannelMain,
  nativeTheme,
  net,
  protocol,
  safeStorage,
  screen,
  shell,
  type UtilityProcess,
  utilityProcess,
  webContents
} from "electron"
import { type AccountState, accountEmail, organizationId, signInRequest } from "../shared/account.ts"
import { ipc } from "../shared/channels.ts"
import { codedErrors } from "../shared/coded-errors.ts"
import {
  betaSetting,
  checked,
  consoleAnnouncement,
  consoleOrigin,
  folderPickerTitle,
  openInEditorRequest,
  saveDialogOptions,
  shownItem,
  problemReport,
  telemetrySetting as telemetryLevelCheck,
  themeSource
} from "../shared/ipc-checks.ts"
import type { ConsoleContext, ProcessUsage, RenderedFrame, RenderJob } from "../shared/protocol.ts"
import { deviceBox, devicePixels } from "../shared/render-job.ts"
import type {
  BuilderReading,
  ConnectMessage,
  MainMethods,
  PreviewDrawn,
  PreviewPictures,
  ServiceProcessMethods
} from "../shared/service.ts"
import { telemetryRunArgument, telemetryRunVariable, writeTelemetryRun } from "../shared/telemetry-run.ts"
import { currentTrace, currentTraceHeaders, handleInSpan, inSpan, traceWith } from "../shared/tracing.ts"
import { createAccount, schemeRedirect, workosClientId } from "./account.ts"
import { recordAppLife } from "./app-life.ts"
import { builtRelease, InstalledBuild } from "./build-info.ts"
import { openInEditor } from "./code-editor.ts"
import { announcedContexts, batchedChanges, createConsoleLog, recordConsole } from "./console-log.ts"
import { readEnvironment } from "./environment.ts"
import { watchFrame } from "./frame-telemetry.ts"
import { idleClose } from "./idle-close.ts"
import { readLogEvents } from "./log-files.ts"
import { listenOnLoopback } from "./loopback.ts"
import { isPackaged } from "./packaged.ts"
import { launchLink, passLink } from "./pass-link.ts"
import { privateMemory } from "./private-memory.ts"
import { auditResult, canvasHeightResult, renderResult } from "./render-results.ts"
import { createReports, offersCrashReports } from "./report.ts"
import { sessionStore } from "./session-store.ts"
import { TelemetrySetting } from "./telemetry-setting.ts"
import {
  agentCalled,
  applyTelemetry,
  keepFailedFrame,
  personActed,
  recordForwarded,
  scrubber,
  serviceStarted,
  startEvents,
  startTelemetry,
  watchWindowHangs
} from "./telemetry.ts"
import { savedTheme } from "./theme-file.ts"
import type { UpdateSession } from "./update-session.ts"
import { createUpdates } from "./updates.ts"

/** Main's environment variables, read once, as it starts. */
const environment = readEnvironment(process.env)
// A second copy, such as the one `pnpm perf` starts, keeps its own tabs, storage and theme. The app's own stay where
// its package's first name put them, under @parity/desktop, now that the app is named Parity and the package
// @parity-app/desktop (PAR-425). Set before Sentry starts, which keeps its queue there, and before the Telemetry setting
// is read from it.
app.setPath("userData", environment.PARITY_USER_DATA ?? join(app.getPath("appData"), "@parity", "desktop"))
/** The Telemetry setting and install ID, in a file the CLI reads too (PAR-626). */
const telemetryFile = join(app.getPath("userData"), telemetryFileName)
const telemetrySetting = new TelemetrySetting({
  env: process.env,
  read: () => {
    try {
      return readFileSync(telemetryFile, "utf8")
    } catch {
      return undefined
    }
  },
  save: (text) => {
    mkdirSync(app.getPath("userData"), { recursive: true })
    writeFileSync(telemetryFile, text)
  },
  newId: () => randomUUID()
})
/** The app's own package.json: the build's, or the checkout's when run from source. */
const appManifest = () => JSON.parse(readFileSync(join(app.getAppPath(), "package.json"), "utf8")) as unknown
const built = builtRelease(appManifest)
const installed = isPackaged(app.isPackaged, environment.PARITY_DEV_RUNNER)
// Before any scheme is registered or the service forked, so windows and the service can send through it (PAR-620).
const telemetryStart = startTelemetry(process.env, {
  sending: telemetrySetting.get(),
  installed,
  published: installed && built.published,
  commit: built.commit ?? environment.PARITY_COMMIT,
  rendererName: (contents) => {
    const window = BrowserWindow.fromWebContents(contents)
    if (!window) return undefined
    return isRenderWindow(window) ? "render" : "window"
  }
})
const rendererUrl = environment.PARITY_RENDERER_URL
// A standard, secure origin keeps storage and project CORS working when the UI comes from the installed files.
protocol.registerSchemesAsPrivileged([
  { scheme: "parity", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  // Component previews, which the window shows as plain images straight from the store (PAR-207).
  { scheme: "parity-preview", privileges: { standard: true, secure: true } }
])
const rendererOrigin = rendererUrl.startsWith("parity://app/") ? "parity://app" : new URL(rendererUrl).origin

// Lets agents and scripts inspect the running canvas over the Chrome DevTools Protocol.
if (environment.PARITY_DEBUG_PORT !== undefined) {
  app.commandLine.appendSwitch("remote-debugging-port", String(environment.PARITY_DEBUG_PORT))
}
// A copy being measured keeps drawing while other windows cover it, which a window otherwise stops doing on Windows.
if (environment.PARITY_WINDOW_SIZE) app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion")
app.setName("Parity")
// Events from every process are recorded from here on, and the other processes start theirs with this run (PAR-627).
const events = startEvents({
  userData: app.getPath("userData"),
  installed: isPackaged(app.isPackaged, environment.PARITY_DEV_RUNNER),
  installId: telemetrySetting.get().installId
})
const telemetryRun = writeTelemetryRun(events.run)
// What main does for the service is a span in the trace the service's request came with (PAR-629).
traceWith(events.telemetry)
// Startup, quitting, updates and memory (PAR-631).
const appLife = recordAppLife(events.telemetry, async () =>
  (await processUsage()).map(({ role, memory }) => ({ role, memory }))
)

let service: UtilityProcess | undefined
let updates: UpdateSession | undefined
const updateRestarts = new Set<number>()
/** Services replaced by a fresh one; their exit is expected. */
const retired = new WeakSet<UtilityProcess>()
/** Each service's channel, which its requests to draw and read consoles come over. */
const serviceChannels = new WeakMap<UtilityProcess, Channel<MainMethods, ServiceProcessMethods>>()

/** The app's theme is kept here too, so the window opens in it before the page loads. */
const themeFile = join(app.getPath("userData"), "theme.json")

function readThemeFile(): string | undefined {
  try {
    return readFileSync(themeFile, "utf8")
  } catch {
    return undefined
  }
}

nativeTheme.themeSource = savedTheme(readThemeFile())

/** The title bar's colors, which the system's window buttons sit on, matching the tab strip. */
function titleBarColors(): { background: string; symbols: string } {
  return nativeTheme.shouldUseDarkColors
    ? { background: "#0a0a0a", symbols: "#a3a3a3" }
    : { background: "#f5f5f5", symbols: "#525252" }
}

nativeTheme.on("updated", () => {
  if (process.platform === "darwin") return
  const { background, symbols } = titleBarColors()
  for (const window of BrowserWindow.getAllWindows()) {
    if (isRenderWindow(window)) continue
    window.setBackgroundColor(background)
    window.setTitleBarOverlay({ color: background, symbolColor: symbols, height: 40 })
  }
})

const serviceName = "Parity project service"
const serviceDirectory = isPackaged(app.isPackaged, environment.PARITY_DEV_RUNNER)
  ? join(process.resourcesPath, "app.asar.unpacked")
  : import.meta.dirname
const serviceEntry = join(serviceDirectory, "utility.mjs")

/** When this copy started, which its agent registry entry gives. */
const appStarted = Date.now()

/** How many services this copy has started, so a second is reported as a restart. */
let serviceStarts = 0

/** Builders, file access, agents and other heavy work run here, never in the UI process. */
function startService(): UtilityProcess {
  serviceStarted(serviceStarts++ > 0)
  const child = utilityProcess.fork(serviceEntry, [], {
    serviceName,
    stdio: "inherit",
    env: {
      ...process.env,
      PARITY_ALLOWED_ORIGINS: rendererOrigin,
      // Which projects were open, so the service opens them again as it starts, before the window asks (PAR-179).
      PARITY_REOPEN_FILE: join(app.getPath("userData"), "open-projects.json"),
      // Frame bitmaps and component previews are kept in the app's own data, so an installed Parity never writes them
      // into a project.
      PARITY_BITMAP_DIR: bitmapFolder(),
      // Projects' pictures for the start page, kept apart from the bitmaps so clearing that cache leaves them (PAR-607).
      PARITY_PICTURE_DIR: join(app.getPath("userData"), "pictures"),
      // Names this copy's entry in the agent registry, so a restarted service writes the same one, and says how long
      // the copy has been running: a project open in two copies goes to the older (PAR-514).
      PARITY_APP_PID: String(process.pid),
      PARITY_APP_STARTED: String(appStarted),
      [telemetryRunVariable]: telemetryRun
    }
  })
  const channel = createChannel<MainMethods, ServiceProcessMethods>({
    errors: codedErrors,
    handlers: {
      render: ({ job, capture }) => renderFrame(job, capture),
      preview: ({ job, crop, priority }) => renderPreview(job, crop, priority),
      // Agents get the entries without the id windows keep them by.
      console: ({ origin, clear }) => consoleLog.read(origin, clear).map(({ id: _id, ...entry }) => entry),
      // Another copy got a sign-in link and asks whether it's this copy's: it answers at once, then trades the code.
      signInLink: ({ link }) => {
        const taken = account.owns(link)
        if (taken) void account.takeLink(link)
        return { taken }
      },
      record: (envelope) => recordForwarded(envelope),
      // The open projects' `.env` values, scrubbed here and in every window (PAR-672).
      secrets: (secrets) => {
        projectSecrets = secrets.filter((value) => typeof value === "string")
        scrubber.use(projectSecrets)
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send(ipc.telemetrySecretsChanged, projectSecrets)
        }
        return undefined
      },
      agentCalled: (caller) => agentCalled(caller)
    },
    disconnected: () => new Error("The project service stopped"),
    trace: currentTraceHeaders,
    around: handleInSpan
  })
  channel.connect(nodePort(child, { closedBy: { exit: () => undefined } }))
  serviceChannels.set(child, channel)
  child.once("spawn", () => appLife.mark("serviceReady"))
  child.on("exit", (code) => {
    channel.close(new Error("The project service stopped"))
    if (service === child) service = undefined
    if (code === 0 || retired.has(child)) return
    // A utility process whose script is missing exits with code 1 and prints nothing, even with Electron's logging on,
    // so the path it was given is named (PAR-489).
    const missing = existsSync(serviceEntry) ? "" : `, since ${serviceEntry} doesn't exist`
    console.error(`Project service exited with code ${code}${missing}`)
  })
  return child
}

/** Gives a page its own channel to the service. */
function connectWindow(window: BrowserWindow): void {
  service ??= startService()
  const { port1, port2 } = new MessageChannelMain()
  service.postMessage({ type: "connect" } satisfies ConnectMessage, [port1])
  window.webContents.postMessage(ipc.port, null, [port2])
}

/**
 * Replaces the service with a fresh one and reconnects every window to it. Pages reopen their projects and keep their
 * designs and unsaved changes, so changing the service's code doesn't close anything.
 */
function restartService(): void {
  const previous = service
  if (previous) retired.add(previous)
  service = startService()
  previous?.kill()
  for (const window of BrowserWindow.getAllWindows()) {
    if (!isRenderWindow(window) && !window.webContents.isLoading()) connectWindow(window)
  }
}

function createWindow(): void {
  const mac = process.platform === "darwin"
  const { background, symbols } = titleBarColors()
  // A size for the page itself, such as 1439x901, which `pnpm perf` asks for so every run draws the same area, in the
  // middle of the main screen, so every run draws at the same pixel ratio.
  const pageSize = environment.PARITY_WINDOW_SIZE
  const { workArea } = screen.getPrimaryDisplay()
  const window = new BrowserWindow({
    ...(pageSize
      ? {
          width: pageSize.width,
          height: pageSize.height,
          useContentSize: true,
          x: Math.round(workArea.x + Math.max(0, workArea.width - pageSize.width) / 2),
          y: Math.round(workArea.y + Math.max(0, workArea.height - pageSize.height) / 2)
        }
      : { width: 1440, height: 900 }),
    minWidth: 960,
    minHeight: 600,
    title: "Parity",
    // The taskbar's icon on Windows and the window list's on Linux. macOS shows the dock's, set when the app starts.
    icon: join(import.meta.dirname, "resources", process.platform === "win32" ? "icon.ico" : "icon.png"),
    backgroundColor: background,
    // The tab strip is the title bar; the system's window buttons sit over its end.
    titleBarStyle: mac ? "hiddenInset" : "hidden",
    ...(mac ? {} : { titleBarOverlay: { color: background, symbolColor: symbols, height: 40 } }),
    webPreferences: {
      additionalArguments: [
        `--parity-version=${app.getVersion()}`,
        `${telemetryRunArgument}${telemetryRun}`,
        ...(environment.PARITY_PROJECT ? [`--parity-initial-project=${environment.PARITY_PROJECT}`] : [])
      ],
      preload: join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true
    }
  })
  watchWindowHangs(window, "window", "renderer", () => appLife.windowHung())
  appLife.mark("windowShown")
  window.once("ready-to-show", () => appLife.mark("firstPaint"))
  // A key pressed in the window is the person's, so what follows is tagged as theirs, not an agent's (PAR-630).
  window.webContents.on("before-input-event", () => personActed())
  // A message is the design's whose frame the page said was handling an event as it was written (PAR-147).
  const contents = window.webContents.id
  recordConsole(consoleLog, window.webContents, "canvas", new URL(rendererUrl).origin, (level) =>
    announced.take(contents, level)
  )
  // Every page load gets its own channel to the service.
  window.webContents.on("did-finish-load", () => connectWindow(window))
  // The page decides whether the window closes: it may ask about unsaved changes first, or finish saving. It answers
  // at once that it's deciding; a page that doesn't (hung or still loading) doesn't keep the window open.
  let ready = false
  let deciding = false
  window.on("close", (event) => {
    if (ready || window.webContents.isCrashed()) return
    event.preventDefault()
    if (deciding) return
    deciding = true
    let acknowledged = false
    ipcMain.once(ipc.closePending, () => {
      acknowledged = true
    })
    window.webContents.send(ipc.closing)
    setTimeout(() => {
      if (acknowledged || ready || window.isDestroyed()) return
      if (updateRestarts.delete(window.id)) {
        deciding = false
        updates?.fail(new Error("The window did not answer. Try restarting the update again."))
        return
      }
      ready = true
      window.close()
      if (quitting) app.quit()
    }, 3000)
  })
  ipcMain.removeAllListeners(ipc.closeCancel)
  ipcMain.on(ipc.closeCancel, (event) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return
    updateRestarts.delete(window.id)
    deciding = false
    quitting = false
  })
  ipcMain.removeAllListeners(ipc.closeReady)
  ipcMain.on(ipc.closeReady, (event) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || ready) return
    ready = true
    if (updateRestarts.delete(window.id)) {
      const resetClose = () => {
        ready = false
        deciding = false
        quitting = false
      }
      if (!updates?.install(resetClose)) resetClose()
      return
    }
    window.close()
    if (quitting) app.quit()
  })
  // Links open in the person's browser, never in a new app window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    // Web pages, and dev servers on this machine such as the project's Storybook.
    if (url.startsWith("https://") || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url)) {
      void shell.openExternal(url)
    }
    return { action: "deny" }
  })
  // The hidden render windows would otherwise keep the app running.
  window.on("closed", closeRenderWindows)
  window.on("closed", () => updateRestarts.delete(window.id))
  void window.loadURL(rendererUrl)
}

let quitting = false
app.on("before-quit", () => {
  quitting = true
})

/**
 * The window's menus are drawn by the app itself, in its title bar. The application menu only keeps what the system
 * expects: clipboard and window commands on macOS, and developer tools everywhere. Electron's default menu would
 * otherwise close the window on Ctrl+W and reload it on Ctrl+R. Its keys aren't registered: the window's own keymap
 * opens developer tools (Ctrl+Shift+I), the same on every system, and Ctrl+R renames, as in Figma.
 */
function applicationMenu(): Menu {
  const developer: Electron.MenuItemConstructorOptions = {
    label: "Developer",
    submenu: [
      { role: "toggleDevTools", registerAccelerator: false },
      { role: "reload", registerAccelerator: false }
    ]
  }
  app.setAboutPanelOptions({ applicationName: "Parity", applicationVersion: app.getVersion() })
  if (process.platform !== "darwin") return Menu.buildFromTemplate([developer])
  return Menu.buildFromTemplate([
    {
      label: "Parity",
      submenu: [
        { role: "about" },
        {
          label: "Check for updates",
          click: () => {
            let window = BrowserWindow.getAllWindows().find((candidate) => !isRenderWindow(candidate))
            if (!window) {
              createWindow()
              window = BrowserWindow.getAllWindows().find((candidate) => !isRenderWindow(candidate))
            }
            if (!window) return
            const contents = window.webContents
            const show = () => contents.send(ipc.showUpdates)
            if (contents.isLoadingMainFrame()) contents.once("did-finish-load", show)
            else show()
            window.show()
            window.focus()
          }
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [{ role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }]
    },
    developer,
    { role: "windowMenu" }
  ])
}

function ownerOf(event: Electron.IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined
}

/** The Parity window a request came from, refused from a guest, an offscreen renderer or anything else. */
function appWindowOf(event: Electron.IpcMainInvokeEvent, refusal: string): BrowserWindow {
  const window = ownerOf(event)
  if (
    !window ||
    isRenderWindow(window) ||
    event.senderFrame !== event.sender.mainFrame ||
    event.sender.getURL() !== rendererUrl
  ) {
    throw new Error(refusal)
  }
  return window
}

/** Updater commands come only from the app's own main frame, never a guest or offscreen renderer. */
function updateOwner(event: Electron.IpcMainInvokeEvent): BrowserWindow {
  return appWindowOf(event, "Only the Parity window can control updates.")
}

/** The app's windows, as against the offscreen renderers. */
function appWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter((window) => !isRenderWindow(window))
}

/**
 * Signing in (PAR-612). An installed app hands back through `parity://`, which its installer registers; a `pnpm dev`
 * copy listens on a loopback port of its own for each sign-in, since several copies run at once and only an installed
 * app gets the scheme. Both use WorkOS's Staging environment until Production exists (PAR-611).
 */
const packaged = isPackaged(app.isPackaged, environment.PARITY_DEV_RUNNER)
const account = createAccount({
  clientId: workosClientId,
  fetch: (url, init) => net.fetch(url, init),
  redirect: () =>
    packaged
      ? Promise.resolve({ uri: schemeRedirect, close: () => undefined })
      : listenOnLoopback((link) => account.takeLink(link)),
  openBrowser: (url) => shell.openExternal(url),
  store: sessionStore(join(app.getPath("userData"), "account"), safeStorage, process.platform),
  changed: (state: AccountState) => {
    for (const window of appWindows()) window.webContents.send(ipc.accountChanged, state)
  },
  focus: () => {
    const [window] = appWindows()
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  },
  now: Date.now,
  later: (run, ms) => {
    const timer = setTimeout(run, ms)
    return () => clearTimeout(timer)
  }
})

/** A sign-in link this copy got from the system: its own sign-in's, or another copy's, which it passes on. */
async function receiveLink(link: string): Promise<boolean> {
  if (account.owns(link)) {
    void account.takeLink(link)
    return true
  }
  const taken = await passLink(
    link,
    readEntries(agentRegistry(process.env, homedir()), homedir()),
    process.pid,
    (url, init) => net.fetch(url, init)
  )
  if (!taken) console.error("No copy of Parity was waiting for that sign-in")
  return taken
}

/**
 * On Windows and Linux, the system starts a new Parity process with the link, since Parity holds no single-instance
 * lock. That process only passes the link on, and quits without opening a window.
 */
const handedLink = process.platform === "darwin" ? undefined : launchLink(process.argv)

// macOS gives the running app the link; one that isn't running is started first, and gets it as it starts.
app.on("open-url", (event, url) => {
  event.preventDefault()
  void receiveLink(url)
})

const signInRefusal = "Only the Parity window can sign in."
ipcMain.handle(ipc.accountState, (event) => {
  appWindowOf(event, signInRefusal)
  return account.state()
})
ipcMain.handle(
  ipc.accountSignIn,
  checked(signInRequest, (event: Electron.IpcMainInvokeEvent, request) => {
    appWindowOf(event, signInRefusal)
    return account.signIn(request)
  })
)
ipcMain.handle(ipc.accountReopen, (event) => {
  appWindowOf(event, signInRefusal)
  return account.reopen()
})
ipcMain.handle(ipc.accountCancel, (event) => {
  appWindowOf(event, signInRefusal)
  account.cancel()
})
ipcMain.handle(
  ipc.accountSwitch,
  checked(organizationId, (event: Electron.IpcMainInvokeEvent, id) => {
    appWindowOf(event, signInRefusal)
    return account.switchOrganization(id)
  })
)
ipcMain.handle(
  ipc.accountSignOut,
  checked(accountEmail, (event: Electron.IpcMainInvokeEvent, email) => {
    appWindowOf(event, signInRefusal)
    return account.signOut(email)
  })
)
ipcMain.handle(
  ipc.accountUse,
  checked(accountEmail, (event: Electron.IpcMainInvokeEvent, email) => {
    appWindowOf(event, signInRefusal)
    return account.use(email)
  })
)

const buildInfoFile = join(app.getPath("userData"), "installed-build.json")
const installedBuild = new InstalledBuild({
  version: app.getVersion(),
  packaged: isPackaged(app.isPackaged, environment.PARITY_DEV_RUNNER),
  metadata: appManifest,
  read: () => JSON.parse(readFileSync(buildInfoFile, "utf8")),
  save: (value) => writeFileSync(buildInfoFile, JSON.stringify(value))
})
ipcMain.handle(ipc.buildInfo, (event) => {
  updateOwner(event)
  return installedBuild.get()
})

/** The open projects' `.env` values the service last sent, which a window asks for as its telemetry starts (PAR-672). */
let projectSecrets: string[] = []
ipcMain.handle(ipc.telemetrySecrets, () => projectSecrets)

/** The setting is the person's, so only the Parity window may read or change it. */
const telemetryRefusal = "Only the Parity window can change the Telemetry setting."
ipcMain.handle(ipc.telemetryState, (event) => {
  appWindowOf(event, telemetryRefusal)
  return telemetrySetting.get()
})
ipcMain.handle(
  ipc.telemetryLevel,
  checked(telemetryLevelCheck, (event: Electron.IpcMainInvokeEvent, level) => {
    appWindowOf(event, telemetryRefusal)
    const state = telemetrySetting.setLevel(level)
    applyTelemetry(state)
    return state
  })
)

// Help > Report a problem, and the last run's crash (PAR-635).
const reports = createReports({
  readEvents: () => readLogEvents(join(app.getPath("userData"), "logs")),
  flushLogs: events.flushLogs,
  sessionId: events.run.sessionId,
  offerCrash: offersCrashReports(telemetryStart.environment),
  telemetry: events.telemetry
})
const reportRefusal = "Only the Parity window can send a report."
ipcMain.handle(ipc.reportPrepare, (event) => reports.prepare(appWindowOf(event, reportRefusal)))
ipcMain.handle(
  ipc.reportSend,
  checked(problemReport, (event: Electron.IpcMainInvokeEvent, report) =>
    reports.send(appWindowOf(event, reportRefusal), report)
  )
)
ipcMain.handle(ipc.reportLastCrash, (event) => {
  appWindowOf(event, reportRefusal)
  return reports.takeLastCrash()
})

ipcMain.handle(ipc.updateState, (event) => {
  updateOwner(event)
  return updates?.get() ?? { phase: "disabled", beta: false }
})
ipcMain.handle(ipc.updateCheck, async (event) => {
  updateOwner(event)
  await updates?.check()
})
ipcMain.handle(
  ipc.updateBeta,
  checked(betaSetting, (event: Electron.IpcMainInvokeEvent, beta) => {
    updateOwner(event)
    updates?.setBeta(beta)
  })
)
ipcMain.handle(ipc.updateAct, async (event) => {
  const window = updateOwner(event)
  const state = updates?.get()
  if (state?.phase === "manual") {
    await shell.openExternal(
      `https://github.com/betterapps-hq/parity/releases/tag/v${encodeURIComponent(state.version)}`
    )
  } else if (state?.phase === "ready") {
    updateRestarts.add(window.id)
    window.close()
  }
})

async function showOpen(event: Electron.IpcMainInvokeEvent, options: Electron.OpenDialogOptions) {
  const owner = ownerOf(event)
  const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
  return result.canceled ? undefined : result.filePaths[0]
}

ipcMain.handle(
  ipc.pickFolder,
  checked(folderPickerTitle, (event: Electron.IpcMainInvokeEvent, title) =>
    showOpen(event, { title: title ?? "Open project", properties: ["openDirectory", "createDirectory"] })
  )
)

ipcMain.handle(ipc.pickProjectFile, (event) =>
  showOpen(event, {
    title: "Open project file",
    properties: ["openFile"],
    filters: [{ name: "Parity project", extensions: ["par"] }]
  })
)

ipcMain.handle(
  ipc.saveDialog,
  checked(saveDialogOptions, async (event: Electron.IpcMainInvokeEvent, settings) => {
    const owner = ownerOf(event)
    const result = owner ? await dialog.showSaveDialog(owner, settings) : await dialog.showSaveDialog(settings)
    return result.canceled ? undefined : result.filePath
  })
)

ipcMain.handle(
  ipc.showItem,
  checked(shownItem, (_event, path) => shell.showItemInFolder(path))
)

ipcMain.handle(
  ipc.openInEditor,
  checked(openInEditorRequest, (_event, request) => openInEditor(request))
)

// Windows and render windows send the events they record, named by the window that sent them (PAR-627).
ipcMain.on(ipc.telemetry, (event, envelope: unknown) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  recordForwarded(envelope, window && isRenderWindow(window) ? "render" : "renderer")
})

// The editor says which frame's event it's handling just before a console message is written there (PAR-147). Word
// that isn't one is ignored, and the message is kept as the project's.
ipcMain.on(ipc.consoleAnnounce, (event, announcement: unknown) => {
  const read = consoleAnnouncement.safeParse(announcement)
  if (!read.success) return
  const { level, ...context } = read.data
  announced.announce(event.sender.id, level, context)
})

ipcMain.handle(
  ipc.consoleRead,
  checked(consoleOrigin, (_event, origin) => consoleLog.read(origin))
)

ipcMain.handle(
  ipc.consoleClear,
  checked(consoleOrigin, (_event, origin) => consoleLog.clear(origin))
)

ipcMain.handle(ipc.quit, () => app.quit())

ipcMain.handle(ipc.toggleDevTools, (event) => event.sender.toggleDevTools())

ipcMain.handle(
  ipc.setTheme,
  checked(themeSource, (_event, theme) => {
    if (nativeTheme.themeSource === theme) return
    nativeTheme.themeSource = theme
    try {
      writeFileSync(themeFile, JSON.stringify({ theme }))
    } catch (error) {
      console.error("The theme couldn't be remembered", error)
    }
  })
)

/** The service's last answer, for when it's too busy to answer in time. */
let lastBuilders: BuilderReading[] = []

/** Each project's builder's CPU and memory, from the service, which runs each builder in a process of its own. */
function builderReadings(): Promise<BuilderReading[]> {
  const channel = service && serviceChannels.get(service)
  if (!channel) return Promise.resolve([])
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<BuilderReading[]>((resolve) => {
    timer = setTimeout(() => resolve(lastBuilders), 1000)
  })
  const asked = channel.request("builders", undefined).then(
    (builders) => (lastBuilders = builders),
    () => lastBuilders
  )
  return Promise.race([asked, late]).finally(() => clearTimeout(timer))
}

// The performance stats: each process's CPU and memory, named by what it does. Storybook and other programs the
// project service starts run outside the app, so they aren't counted, apart from each project's builder, which runs
// in a process of its own the service starts. Memory is what each process uses on its own, as the system's monitor
// counts it (see private-memory.ts), and its working set where the system won't say.
ipcMain.handle(ipc.metrics, (event) => processUsage(event.sender))

/** Each process's CPU and memory, with `asker` named as this window. */
async function processUsage(asker?: Electron.WebContents): Promise<ProcessUsage[]> {
  const cores = availableParallelism()
  const pages = new Map(webContents.getAllWebContents().map((contents) => [contents.getOSProcessId(), contents]))
  const metrics = app.getAppMetrics()
  const builders = await builderReadings()
  const privates = await privateMemory([...metrics.map((metric) => metric.pid), ...builders.map(({ pid }) => pid)])
  const usage = metrics.map((metric): ProcessUsage => {
    const page = pages.get(metric.pid)
    let role: ProcessUsage["role"]
    if (metric.type === "Browser") role = "app"
    else if (metric.type === "GPU") role = "gpu"
    else if (metric.name === serviceName) role = "service"
    else if (page && renderWindows.some((render) => render?.window.webContents === page)) role = "offscreen"
    else if (page === asker) role = "this-window"
    else role = page ? "window" : "helper"
    const names: Record<ProcessUsage["role"], string> = {
      app: "Parity",
      "this-window": "This window",
      window: page?.getTitle() || "Another window",
      offscreen: "Offscreen renderer",
      service: "Project service",
      builder: "Builder",
      gpu: "GPU",
      helper: metric.name || metric.serviceName || metric.type
    }
    return {
      role,
      name: names[role],
      pid: metric.pid,
      cpu: metric.cpu.percentCPUUsage / cores,
      memory: privates.get(metric.pid) ?? metric.memory.workingSetSize * 1024
    }
  })
  const builderUsage = builders.map((builder): ProcessUsage => ({
    role: "builder",
    ...builder,
    memory: privates.get(builder.pid) ?? builder.memory
  }))
  return [...usage, ...builderUsage]
}

// Agents measure and capture frames offscreen, so their work never moves the person's camera. A few windows draw at once,
// so a project's bitmaps are taken in a fraction of the time one window took (PAR-523).
const renderWindows: ({ window: BrowserWindow; loaded: Promise<void> } | undefined)[] = []
// One job in each window, canvas bitmaps and agents' renders before component previews (PAR-207).
const offscreen = renderQueue(offscreenWindows)
// Each window holds its page and every project module graph it imported, which only closing it returns, so they close
// a minute after the last job and the next job opens them again.
const renderIdle = idleClose(60_000, closeRenderWindows)

// What projects' code writes to the console, in every window: agents read it with `parity console`, and editor windows
// show it in the Console panel as it comes (PAR-147).
const consoleLog = createConsoleLog()
// Which frame each editor window said its next message comes from.
const announced = announcedContexts()
// The design each offscreen window is drawing, for what it writes meanwhile.
const drawing = new Map<BrowserWindow, ConsoleContext>()
consoleLog.subscribe(
  batchedChanges((change) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !isRenderWindow(window)) window.webContents.send(ipc.consoleChanged, change)
    }
  })
)

function consoleContextOf(design: NonNullable<RenderJob["design"]>): ConsoleContext {
  return {
    design: design.key,
    ...(design.state ? { state: design.state } : {}),
    ...(design.mode ? { mode: design.mode } : {})
  }
}

function isRenderWindow(window: BrowserWindow): boolean {
  return renderWindows.some((render) => render?.window === window)
}

function closeRenderWindows(): void {
  renderIdle.cancel()
  const closing = renderWindows.splice(0)
  for (const render of closing) if (render && !render.window.isDestroyed()) render.window.destroy()
}

/** Offscreen window `index`, opened and loaded if it isn't. */
function ensureRenderWindow(index: number): Promise<BrowserWindow> {
  let render = renderWindows[index]
  if (!render || render.window.isDestroyed()) {
    const window = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: {
        offscreen: true,
        contextIsolation: true,
        sandbox: true,
        // Only so the page can send main its telemetry: the project's components run in it too.
        preload: join(import.meta.dirname, "render-preload.cjs"),
        additionalArguments: [`${telemetryRunArgument}${telemetryRun}`]
      }
    })
    watchWindowHangs(window, "offscreen renderer", "render", () => appLife.windowHung())
    // A message is the design's the window is drawing as it's written (PAR-147).
    recordConsole(consoleLog, window.webContents, "offscreen", new URL(rendererUrl).origin, () => drawing.get(window))
    render = { window, loaded: window.loadURL(new URL("render.html", rendererUrl).href) }
    renderWindows[index] = render
  }
  const { window, loaded } = render
  return loaded.then(() => window)
}

function renderFrame(job: RenderJob, capture: boolean): Promise<{ frame?: RenderedFrame; png?: string }> {
  return renderOffscreen("render", job, capture || !!job.audit, async (window, frame, width, height) => {
    if (job.audit) {
      const audited = auditResult(
        await window.webContents.executeJavaScript(`window.canvasAudit(${JSON.stringify(job.colorTokens ?? [])})`, true)
      )
      frame.issues = audited.issues
      frame.contrast = audited.contrast
    }
    if (!capture) return { frame }
    const image = await window.webContents.capturePage({ x: 0, y: 0, width, height })
    // A frame that grows with its content keeps the height the canvas lays it out at, measured after the capture
    // (PAR-525).
    if (job.mode.height === undefined) {
      const canvasHeight = canvasHeightResult(await window.webContents.executeJavaScript("window.canvasHeight()", true))
      if (canvasHeight !== undefined) frame.canvasHeight = canvasHeight
    }
    return { frame, png: image.toPNG().toString("base64") }
  })
}

/**
 * Draws a component preview and crops it to the element `crop` names, scaled down to the two sizes previews are kept
 * at (PAR-207). A component that fails to draw gives its error.
 */
async function renderPreview(
  job: RenderJob,
  crop: string,
  priority: Exclude<RenderPriority, "render">
): Promise<PreviewDrawn> {
  let pictures: PreviewPictures | undefined
  let empty = false
  const { frame } = await renderOffscreen(priority, job, true, async (window, drawn) => {
    const box = drawn.nodes.find((node) => node.id === crop)
    if (!box) return { frame: drawn }
    const image = await window.webContents.capturePage(deviceBox(box, job.scale))
    const { width, height } = image.getSize()
    if (drawsNothing(image.toBitmap())) {
      empty = true
      return { frame: drawn }
    }
    const scaled = (size: { width: number; height: number }) => {
      const fitted = fitInside(width, height, size)
      return fitted.width === width && fitted.height === height ? image : image.resize({ ...fitted, quality: "best" })
    }
    const large = scaled(previewSizes.large)
    pictures = {
      thumb: scaled(previewSizes.thumbnail).toPNG().toString("base64"),
      large: large.toPNG().toString("base64"),
      ...large.getSize()
    }
    return { frame: drawn }
  })
  if (frame?.error) return { error: frame.error }
  if (empty) return { empty: true }
  if (!pictures) return { error: "It drew nothing to take a picture of" }
  return { pictures }
}

/**
 * Draws a job in a free offscreen window when its turn comes (see `renderQueue`). When it's to be looked at whole, as a
 * capture or a check does, the window is made as tall as the frame and left to settle before `then`.
 */
function renderOffscreen(
  priority: RenderPriority,
  job: RenderJob,
  whole: boolean,
  then: (
    window: BrowserWindow,
    frame: RenderedFrame,
    width: number,
    height: number
  ) => Promise<{ frame: RenderedFrame; png?: string }>
): Promise<{ frame: RenderedFrame; png?: string }> {
  // Held from the moment it's queued, so the window never closes under a job or with one waiting.
  const done = renderIdle.use()
  // Drawn under the trace it was queued in, with how long it waited for a window (PAR-629), and timed (PAR-638).
  const parent = currentTrace()
  const queued = performance.now()
  const run = (index: number) =>
    inSpan(
      "frame.rendered",
      { priority, queuedMs: Math.round(performance.now() - queued), whole },
      (span) => draw(index, span),
      parent
    )
  const draw = async (index: number, span: Span | undefined) => {
    const window = await ensureRenderWindow(index)
    const width = devicePixels(job.mode.width, job.scale)
    window.setContentSize(width, 800)
    if (job.design) drawing.set(window, consoleContextOf(job.design))
    // A frame that fails is pictured as the window shows it, for the errors that follow.
    const watch = watchFrame(job, priority, span, () => {
      if (window.isDestroyed()) return
      void window.webContents
        .capturePage()
        .then((image) => keepFailedFrame(image.toPNG()))
        .catch(() => undefined)
    })
    try {
      const result = renderResult(
        await window.webContents.executeJavaScript(`window.canvasRender(${JSON.stringify(job)})`, true)
      )
      watch.rendered(result)
      // The guest's stack is telemetry's alone; agents get the message.
      const { errorStack: _stack, ...frame } = result
      if (!whole || frame.error) {
        watch.end(frame)
        return { frame }
      }
      // The whole frame is in view, so a capture or a contrast check sees all of it.
      const height = devicePixels(frame.height, job.scale)
      window.setContentSize(width, height)
      await window.webContents.executeJavaScript("window.canvasSettle()", true)
      const done = await then(window, frame, width, height)
      watch.end(frame)
      return done
    } catch (error) {
      watch.end(undefined, true)
      throw error
    } finally {
      drawing.delete(window)
    }
  }
  return offscreen.add(priority, run).finally(done)
}

/** Where kept frame bitmaps and component previews go, under the app's own data. */
function bitmapFolder(): string {
  return join(app.getPath("userData"), "bitmaps")
}

/**
 * Serves a component preview's picture from the store, as `parity-preview://<project>/<key>-<size>.webp`, the address
 * the service gives. Showing it counts as using it, for the cache's limits. Its name is its content, so the same
 * address never shows another picture.
 */
async function servePreview(request: Request): Promise<Response> {
  const { host, pathname } = new URL(request.url)
  const name = pathname.slice(1)
  if (!/^[0-9a-f]{24}$/.test(host) || !/^[0-9a-f]{40}-(thumb|large)\.webp$/.test(name)) {
    return new Response(null, { status: 400 })
  }
  const file = join(bitmapFolder(), host, "previews", name)
  try {
    const picture = await readFile(file)
    const now = new Date()
    void utimes(file, now, now).catch(() => undefined)
    return new Response(picture, {
      headers: { "content-type": "image/webp", "cache-control": "max-age=31536000, immutable" }
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}

void app.whenReady().then(() => {
  appLife.mark("mainReady")
  if (handedLink) {
    void receiveLink(handedLink).finally(() => app.quit())
    return
  }
  // The installer registers the scheme on macOS; on Windows and Linux the app does, pointing it at itself.
  if (packaged && !app.isDefaultProtocolClient("parity")) app.setAsDefaultProtocolClient("parity")
  void installedBuild.get()
  protocol.handle("parity-preview", servePreview)
  protocol.registerSource("parity", {
    routes: [{ match: { host: "app" }, source: { type: "directory", root: join(import.meta.dirname, "renderer") } }]
  })
  // Otherwise the dock shows the icon of the app Parity runs as, which is Electron.
  app.dock?.setIcon(join(import.meta.dirname, "resources", "dock.png"))
  Menu.setApplicationMenu(applicationMenu())
  updates = createUpdates((state) => {
    appLife.update(state)
    for (const window of BrowserWindow.getAllWindows()) {
      if (!isRenderWindow(window)) window.webContents.send(ipc.updateChanged, state)
    }
  }, environment)
  service = startService()
  createWindow()
  // The keychain is only ready once the app is.
  void account.restore()
  void updates.check()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

app.on("quit", () => {
  service?.kill()
  // The service writes the entry, but quitting ends it outright, before it could clean up.
  removeEntry(agentRegistry(process.env, homedir()), process.pid)
})

// Under the dev runner, which sets PARITY_DEV_RUNNER to its process id.
const devRunner = environment.PARITY_DEV_RUNNER
if (devRunner !== undefined) {
  // The runner rebuilds the service's bundle next to this one as its code changes; restarting just the service keeps
  // windows open. One build can raise several events, so the bundle's content decides.
  const bundles = ["utility.mjs", "props-worker.mjs", "builder-process.mjs"]
  const bundle = () => bundles.map((name) => readFileSync(join(import.meta.dirname, name), "utf8")).join("\n")
  let running = bundle()
  let pending: NodeJS.Timeout | undefined
  watch(import.meta.dirname, (_event, name) => {
    if (!name || !bundles.includes(name)) return
    clearTimeout(pending)
    pending = setTimeout(() => {
      const next = bundle()
      if (next === running) return
      running = next
      console.log("[dev] project service changed, restarting it")
      restartService()
    }, 300)
  })
  // A runner that's gone can't restart or stop this app, so it quits rather than lingering.
  setInterval(() => {
    try {
      process.kill(devRunner, 0)
    } catch {
      app.quit()
    }
  }, 2000).unref()
}
