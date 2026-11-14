import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, watch, writeFileSync } from "node:fs"
import { readFile, utimes } from "node:fs/promises"
import { availableParallelism, homedir } from "node:os"
import { join } from "node:path"
import { agentRegistry, readEntries, removeEntry } from "@parity-app/agent/registry"
import { keysFromEnvironment, keyVariable, offered, placeableKinds, withoutKeys } from "@parity-app/connectors"
import { CodedError, type JsonValue, parseData } from "@parity-app/core"
import { isText } from "@parity-app/core/values/evaluate"
import { telemetryFileName } from "@parity-app/telemetry"
import {
  app,
  BrowserWindow,
  clipboard,
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
import type { AccountState } from "../shared/account.ts"
import { ipc } from "../shared/channels.ts"
import { connectorFind, connectorPlaced } from "../shared/connectors.ts"
import { logNote } from "../shared/log.ts"
import { killTree } from "../shared/process-tree.ts"
import type { ConnectMessage } from "../shared/service.ts"
import { telemetryRunArgument, telemetryRunVariable, writeTelemetryRun } from "../shared/telemetry-run.ts"
import { handleInSpan, traceWith } from "../shared/tracing.ts"
import { type Account, createAccount, schemeRedirect, workosClientId } from "./account.ts"
import { recordAppLife } from "./app-life.ts"
import { builtRelease, InstalledBuild } from "./build-info.ts"
import { cliTarget, installCli, refreshCli } from "./cli-command.ts"
import { copiedFiles, rawFormat } from "./clipboard-files.ts"
import { createCloseFlow } from "./close-flow.ts"
import { openInEditor } from "./code-editor.ts"
import { createConnectorHub } from "./connectors.ts"
import { announcedContexts, batchedChanges, createConsoleLog, recordConsole } from "./console-log.ts"
import { copyStorageFolder, leftoverCopyFolders, processRunning, removeFolder } from "./copy-storage.ts"
import { readEnvironment } from "./environment.ts"
import { hostHandlers } from "./host-handlers.ts"
import { answerWindows, fromParityPage } from "./host-methods.ts"
import { readLogEvents } from "./log-files.ts"
import { listenOnLoopback } from "./loopback.ts"
import { isPackaged } from "./packaged.ts"
import { onPage, opensInBrowser, pageGuard } from "./parity-page.ts"
import { launchLink, passLink } from "./pass-link.ts"
import { localPlacements } from "./placements.ts"
import { privateMemory } from "./private-memory.ts"
import { createProcessUsage } from "./process-usage.ts"
import { createProjectService, type ServiceProcess } from "./project-service.ts"
import { createRemoteSearch } from "./remote-search.ts"
import { createRenderPool, type RenderWindow } from "./render-pool.ts"
import { createReports, offersCrashReports } from "./report.ts"
import { localHistory } from "./search-history.ts"
import { sessionStore } from "./session-store.ts"
import { readStandIn, standInAccount } from "./stand-in-account.ts"
import { TelemetrySetting } from "./telemetry-setting.ts"
import {
  agentCalled,
  applyTelemetry,
  crashSigns,
  keepFailedFrame,
  personActed,
  recordForwarded,
  scrubber,
  serviceCrashed,
  serviceExited,
  serviceStarted,
  startEvents,
  startTelemetry,
  quitCancelled,
  watchWindowGone,
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

// Chromium's storage in the user data folder is one copy's at a time. A copy opened while another has it, as one per
// session working in the repository, would wait seconds on it the first time its page touches storage, frozen and in
// tldraw's light theme, then keep nothing anyway. So it keeps that storage in a temporary folder of its own, removed as
// it quits or, if Chromium still has it open then, by the next such copy. Its tabs, theme, session and bitmaps are
// main's own files, which stay where they are.
if (!app.requestSingleInstanceLock()) {
  const temp = app.getPath("temp")
  const own = copyStorageFolder(temp, process.pid)

  for (const leftover of leftoverCopyFolders(temp, processRunning)) {
    removeFolder(leftover)
  }

  app.setPath("sessionData", own)
  app.once("quit", () => removeFolder(own))
}

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
const appManifest = (): JsonValue => JSON.parse(readFileSync(join(app.getAppPath(), "package.json"), "utf8"))
const built = builtRelease(appManifest)
const installed = isPackaged(app.isPackaged, environment.PARITY_DEV_RUNNER)

const buildInfoFile = join(app.getPath("userData"), "installed-build.json")

/** What GitHub says this version is: a beta, or promoted to everyone, kept between runs. */
const installedBuild = new InstalledBuild({
  version: app.getVersion(),
  packaged: installed,
  metadata: appManifest,
  read: () => readFileSync(buildInfoFile, "utf8"),
  save: (value) => writeFileSync(buildInfoFile, JSON.stringify(value))
})

// Before any scheme is registered or the service forked, so windows and the service can send through it (PAR-620).
const telemetryStart = startTelemetry(process.env, {
  sending: telemetrySetting.get(),
  installed,
  published: installed && built.published,
  // As last saved: a version promoted while it runs reports `production` from its next start (PAR-779).
  promoted: installedBuild.known.channel === "stable",
  commit: built.commit ?? environment.PARITY_COMMIT,
  rendererName: (contents) => {
    const window = BrowserWindow.fromWebContents(contents)

    if (!window) {
      return undefined
    }

    return isRenderWindow(window) ? "render" : "window"
  }
})

// Asks GitHub whether this version has been promoted, so the next start's environment follows it.
void installedBuild.get()

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
if (environment.PARITY_WINDOW_SIZE) {
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion")
}

app.setName("Parity")

// Events from every process are recorded from here on, and the other processes start theirs with this run (PAR-627).
const events = startEvents({
  userData: app.getPath("userData"),
  installed: isPackaged(app.isPackaged, environment.PARITY_DEV_RUNNER),
  installId: telemetrySetting.get().installId
})

const telemetryRun = writeTelemetryRun(events.run)

// An install ID that couldn't be saved changes every start; say why, once there's somewhere to say it (PAR-811).
if (telemetrySetting.unsaved) {
  events.telemetry.track("installId.unsaved", telemetrySetting.unsaved)
}

// What main does for the service is a span in the trace the service's request came with (PAR-629).
traceWith(events.telemetry)

// Startup, quitting, updates and memory (PAR-631).
const appLife = recordAppLife(events.telemetry, async () =>
  (await processUsage()).map(({ role, memory }) => ({ role, memory }))
)

let updates: UpdateSession | undefined

/** Closing windows and quitting, which each window's page decides on, and restarting to install an update. */
const closeFlow = createCloseFlow({ quit: () => app.quit(), updates: () => updates, quitCancelled })

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
  if (process.platform === "darwin") {
    return
  }

  const { background, symbols } = titleBarColors()

  for (const window of BrowserWindow.getAllWindows()) {
    if (isRenderWindow(window)) {
      continue
    }

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

/**
 * Electron's utility process, as the project service's lifecycle takes it. What it prints is piped, not inherited, so a
 * crash is reported with it, and it's still passed on to main's own output.
 */
function forkedService(child: UtilityProcess): ServiceProcess & { readonly messages: UtilityProcess } {
  return {
    messages: child,
    onOutput(listener) {
      for (const [stream, out] of [
        [child.stdout, process.stdout],
        [child.stderr, process.stderr]
      ] as const) {
        stream?.on("data", (chunk: Buffer) => {
          out.write(chunk)
          listener(chunk.toString())
        })
      }
    },
    onSpawn: (listener) => void child.once("spawn", listener),
    onExit: (listener) => void child.on("exit", listener),
    // The service's servers, as a project's Storybook, end with it: an exit handler in the service doesn't run when it's
    // killed, so main ends its whole process tree (PAR-980).
    kill: () => {
      if (child.pid) {
        killTree(child.pid)
      }

      child.kill()
    }
  }
}

/** Builders, file access, agents and other heavy work run in the project service, never in the UI process. */
const projectService = createProjectService({
  fork: () =>
    forkedService(
      utilityProcess.fork(serviceEntry, [], {
        serviceName,
        stdio: "pipe",
        env: {
          // Connectors' keys stay in main: the service runs projects' builders, whose code mustn't see them.
          ...withoutKeys(process.env),
          PARITY_ALLOWED_ORIGINS: rendererOrigin,
          // Which projects were open, so the service opens them again as it starts, before the window asks (PAR-179).
          PARITY_REOPEN_FILE: join(app.getPath("userData"), "open-projects.json"),
          // Projects' unsaved changes, kept outside the projects, so a crash or forced quit doesn't lose them (PAR-905).
          PARITY_RECOVERY_DIR: join(app.getPath("userData"), "recovery"),
          // Frame bitmaps and component previews are kept in the app's own data, so an installed Parity never writes
          // them into a project.
          PARITY_BITMAP_DIR: bitmapFolder(),
          // Projects' pictures for the start page, kept apart from the bitmaps so clearing that cache leaves them
          // (PAR-607).
          PARITY_PICTURE_DIR: join(app.getPath("userData"), "pictures"),
          // Names this copy's entry in the agent registry, so a restarted service writes the same one, and says how
          // long the copy has been running: a project open in two copies goes to the older (PAR-514).
          PARITY_APP_PID: String(process.pid),
          PARITY_APP_STARTED: String(appStarted),
          [telemetryRunVariable]: telemetryRun
        }
      })
    ),
  endTree: killTree,
  handlers: {
    render: ({ job, capture }) => renderPool.render(job, capture),
    preview: ({ job, crop, priority }) => renderPool.preview(job, crop, priority),
    // Agents get the entries without the id windows keep them by.
    console: ({ origin, clear }) => consoleLog.read(origin, clear).map(({ id: _id, ...entry }) => entry),
    // An agent's search: main holds the keys, so it runs here (PAR-829). The service passes on what an agent sent.
    connectorFind: (params) => {
      const { connector, request } = parseData(connectorFind, params)

      return connectorHub.find(request, "agent", connector)
    },
    connectorResult: ({ connector, id }) => {
      const given = connectorHub.result(connector, id)

      return given ? { ...given, placeable: placeableKinds.includes(given.kind) } : null
    },
    // Reporting a placement is the source's count, not something the agent waits on.
    connectorPlaced: (params) => {
      const { connector, id, ...where } = parseData(connectorPlaced, params)
      const placed = connectorHub.result(connector, id)

      if (placed) {
        void connectorHub.placed(placed, { ...where, from: "agent" })
      }

      return undefined
    },
    // Another copy got a sign-in link and asks whether it's this copy's: it answers at once, then trades the code.
    signInLink: ({ link }) => {
      const taken = account.owns(link)

      if (taken) {
        void account.takeLink(link)
      }

      return { taken }
    },
    record: (envelope) => void recordForwarded(envelope),
    // The open projects' `.env` values, scrubbed here from every process's events (PAR-672). No window gets them, since a
    // project's code runs in its page (PAR-983).
    secrets: (secrets) => {
      projectSecrets = secrets.filter(isText)
      scrubber.use([...projectSecrets, ...connectorSecrets])

      return undefined
    },
    agentCalled: (caller) => agentCalled(caller),
    // An agent's report, with the editor window's screenshot (PAR-646).
    report: (problem) => reports.sendForAgent(editorWindow(), problem)
  },
  windows: () => appWindows(),
  loading: (window) => window.webContents.isLoading(),
  parityPage: (window) => onPage(window.webContents.getURL(), rendererUrl),
  join(service, window) {
    const { port1, port2 } = new MessageChannelMain()
    service.messages.postMessage({ type: "connect" } satisfies ConnectMessage, [port1])
    window.webContents.postMessage(ipc.port, null, [port2])
  },
  quitting: () => closeFlow.quitting(),
  missingEntry: () => (existsSync(serviceEntry) ? undefined : serviceEntry),
  telemetry: {
    started: serviceStarted,
    spawned: () => appLife.mark("serviceReady"),
    exited: serviceExited,
    crashed: serviceCrashed
  }
})

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
    // No overlay on macOS, whose traffic lights sit inset in the strip instead.
    titleBarOverlay: !mac && { color: background, symbolColor: symbols, height: 40 },
    webPreferences: {
      additionalArguments: [
        `--parity-version=${app.getVersion()}`,
        `${telemetryRunArgument}${telemetryRun}`,
        ...(environment.PARITY_PROJECT ? [`--parity-initial-project=${environment.PARITY_PROJECT}`] : []),
        // Every copy needs someone signed in before anything else (PAR-1008). Storybook's host leaves it out.
        "--parity-sign-in-required"
      ],
      preload: join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true
    }
  })

  watchWindowHangs(window, "window", "renderer", () => appLife.windowHung())
  watchWindowGone(window, "renderer")
  appLife.mark("windowShown")
  window.once("ready-to-show", () => appLife.mark("firstPaint"))
  // A window minimized before it paints isn't painted until it's restored (PAR-831).
  window.once("minimize", () => appLife.interrupted())
  // A key pressed in the window is the person's, so what follows is tagged as theirs, not an agent's (PAR-630).
  window.webContents.on("before-input-event", () => personActed())
  // A message is the design's whose frame the page said was handling an event as it was written (PAR-147).
  const contents = window.webContents.id
  recordConsole(consoleLog, window.webContents, "canvas", new URL(rendererUrl).origin, (level) =>
    announced.take(contents, level)
  )
  // Every load of Parity's page gets its own channel to the service; `parityPage` refuses any other page one.
  window.webContents.on("did-finish-load", () => projectService.connect(window))
  // Project code runs in the page, so a link or script there can't take the window off Parity's page (PAR-975).
  const guard = pageGuard({ page: rendererUrl, openBrowser: (url) => void shell.openExternal(url) })
  window.webContents.on("will-navigate", guard.navigate)
  window.webContents.on("will-redirect", guard.redirect)
  // The page decides whether the window closes, through `hostMethods`' close methods, which only its own page may send.
  closeFlow.watch({
    id: window.id,
    crashed: () => window.webContents.isCrashed(),
    destroyed: () => window.isDestroyed(),
    ask: () => window.webContents.send(ipc.closing),
    close: () => window.close(),
    onClose: (listener) => void window.on("close", (event) => listener(() => event.preventDefault())),
    onClosed: (listener) => void window.on("closed", listener)
  })
  // Links open in the person's browser, never in a new app window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (opensInBrowser(url)) {
      void shell.openExternal(url)
    }

    return { action: "deny" }
  })
  // The hidden render windows would otherwise keep the app running.
  window.on("closed", () => renderPool.closeAll())
  void window.loadURL(rendererUrl)
}

app.on("before-quit", () => closeFlow.quitStarted())

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

  if (process.platform !== "darwin") {
    return Menu.buildFromTemplate([developer])
  }

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

            if (!window) {
              return
            }

            const contents = window.webContents
            const show = () => contents.send(ipc.showUpdates)

            if (contents.isLoadingMainFrame()) {
              contents.once("did-finish-load", show)
            } else {
              show()
            }

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

/** What a window sends main: a request it waits on, or word it doesn't. */
type HostEvent = Electron.IpcMainInvokeEvent | Electron.IpcMainEvent

/**
 * The Parity window a request came from, when its own page sent it: nothing for a guest, an offscreen renderer or any
 * other page, which `answerWindows` then refuses.
 */
function appWindowOf(event: HostEvent): BrowserWindow | undefined {
  const window = BrowserWindow.fromWebContents(event.sender)

  if (!window) {
    return undefined
  }

  const page = {
    render: isRenderWindow(window),
    mainFrame: event.senderFrame === event.sender.mainFrame,
    url: event.sender.getURL()
  }

  return fromParityPage(page, rendererUrl) ? window : undefined
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

const accountChanged = (state: AccountState) => {
  for (const window of appWindows()) {
    window.webContents.send(ipc.accountChanged, state)
  }
}

/**
 * Who the tests, `pnpm perf` and the checks of a built copy start signed in as, without WorkOS. It holds no token, so it
 * opens nothing Parity's service guards.
 */
const standIn = environment.PARITY_SIGNED_IN_AS ? readStandIn(environment.PARITY_SIGNED_IN_AS) : undefined

const account: Account = standIn
  ? standInAccount(standIn, accountChanged)
  : createAccount({
      clientId: workosClientId,
      fetch: (url, init) => net.fetch(url, init),
      redirect: () =>
        packaged
          ? Promise.resolve({ uri: schemeRedirect, close: () => undefined })
          : listenOnLoopback((link) => account.takeLink(link)),
      openBrowser: (url) => shell.openExternal(url),
      store: sessionStore(join(app.getPath("userData"), "account"), safeStorage, process.platform, (problem) =>
        events.telemetry.track("account.storeFailed", problem)
      ),
      changed: accountChanged,
      focus: () => {
        const [window] = appWindows()

        if (!window) {
          return
        }

        if (window.isMinimized()) {
          window.restore()
        }

        window.show()
        window.focus()
      },
      now: Date.now,
      later: (run, ms) => {
        const timer = setTimeout(run, ms)

        return () => clearTimeout(timer)
      },
      telemetry: events.telemetry
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

  if (!taken) {
    console.error("No copy of Parity was waiting for that sign-in")
  }

  return taken
}

/**
 * On Windows and Linux, the system starts a new Parity process with the link, since copies don't hand each other
 * launches (the single-instance lock only tells which copy has the user data folder's storage). That process only
 * passes the link on, and quits without opening a window.
 */
const handedLink = process.platform === "darwin" ? undefined : launchLink(process.argv)

// macOS gives the running app the link; one that isn't running is started first, and gets it as it starts.
app.on("open-url", (event, url) => {
  event.preventDefault()
  void receiveLink(url)
})

/**
 * Connectors' keys, which the app's owner arranges: a development copy sets each with the variable its connector names,
 * as `PARITY_MOBBIN_API_KEY`. They're read once, then taken out of main's environment, so no process main starts gets
 * them.
 */
const connectorKeys = keysFromEnvironment(process.env)

for (const name of Object.keys(process.env)) {
  if (keyVariable.test(name)) {
    delete process.env[name]
  }
}

/**
 * Parity's own service, which holds the sources' keys (PAR-131, PAR-948): a copy with no key of its own, as every
 * installed one is, searches through it as the signed-in person. An installed copy asks production's, and a development
 * copy staging's, which takes the same sign-in.
 */
const remoteSearch = createRemoteSearch({
  address: packaged ? "https://api.tryparity.dev" : "https://parity-portal-staging.hoa-preview.workers.dev",
  fetch: (url, init) => net.fetch(url, init),
  token: (renew) => account.accessToken(renew)
})

/**
 * Connectors to outside services, such as Mobbin (PAR-829). Main holds their keys and runs every search, for the window
 * over IPC and for agents through the service, and keeps the person's recent searches.
 */
const connectorHub = createConnectorHub({
  // The ones offered: Pixabay finds photos, and Unsplash's connector is kept but not searched.
  connectors: offered,
  keys: connectorKeys,
  service: remoteSearch,
  history: localHistory(join(app.getPath("userData"), "recent-searches.json")),
  placements: localPlacements(join(app.getPath("userData"), "connector-placements.json")),
  fetch: (url, init) => net.fetch(url, init),
  timeout: 30_000,
  // Half of each source's rate limit, so one copy's runaway loop leaves the rest for everyone sharing the key.
  share: 0.5,
  secrets: (values) => {
    connectorSecrets = values
    scrubber.use([...projectSecrets, ...connectorSecrets])
  },
  searched: (search) => events.telemetry.track("connectors.searched", search),
  placed: (placed) => events.telemetry.track("connectors.placed", placed),
  now: () => performance.now(),
  date: () => Date.now()
})

/** Connectors' keys, scrubbed from what main sends to Sentry. Windows never have them, so they aren't sent there. */
let connectorSecrets: string[] = []

/** The open projects' `.env` values the service last sent, scrubbed only here, never sent to a window (PAR-983). */
let projectSecrets: string[] = []

// Help > Report a problem, and the last run's crash (PAR-635).
const reports = createReports({
  readEvents: () => readLogEvents(join(app.getPath("userData"), "logs")),
  flushLogs: events.flushLogs,
  sessionId: events.run.sessionId,
  offerCrash: offersCrashReports(telemetryStart.environment),
  crashSigns: crashSigns(),
  telemetry: events.telemetry,
  level: () => telemetrySetting.get().level
})

/**
 * Each process's CPU and memory, for the performance stats, named by what it does, with the window that asks as this
 * one.
 */
const processUsage = createProcessUsage<Electron.WebContents>({
  cores: availableParallelism(),
  metrics: () => app.getAppMetrics(),
  pages: () => new Map(webContents.getAllWebContents().map((contents) => [contents.getOSProcessId(), contents])),
  serviceName,
  offscreen: (page) => renderPool.windows().some((render) => render.window.webContents === page),
  title: (page) => page.getTitle(),
  builders: () => projectService.channel()?.request("builders", undefined),
  privateMemory
})

/** An offscreen window as the render pool takes it, with the window itself, which the rest of main tells apart. */
interface OffscreenWindow extends RenderWindow {
  readonly window: BrowserWindow
}

// Agents measure and capture frames offscreen, so their work never moves the person's camera (PAR-523).
const renderPool = createRenderPool<OffscreenWindow>({
  open(drawing) {
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
    watchWindowGone(window, "render")
    // A message is the design's the window is drawing as it's written (PAR-147).
    recordConsole(consoleLog, window.webContents, "offscreen", new URL(rendererUrl).origin, drawing)
    // The page runs the project's components, so it stays on the render page, and nobody sees a link to open (PAR-975).
    const page = new URL("render.html", rendererUrl).href
    const guard = pageGuard({ page })
    window.webContents.on("will-navigate", guard.navigate)
    window.webContents.on("will-redirect", guard.redirect)

    return {
      window,
      loaded: window.loadURL(page),
      destroyed: () => window.isDestroyed(),
      crashed: () => window.webContents.isCrashed(),
      destroy: () => window.destroy(),
      setContentSize: (width, height) => window.setContentSize(width, height),
      execute: (script) => window.webContents.executeJavaScript(script, true),
      capture: (box) => window.webContents.capturePage(box),
      invalidate: () => window.webContents.invalidate()
    }
  },
  keepFailedFrame
})

// What projects' code writes to the console, in every window: agents read it with `parity console`, and editor windows
// show it in the Console panel as it comes (PAR-147).
const consoleLog = createConsoleLog()

// Which frame each editor window said its next message comes from.
const announced = announcedContexts()

consoleLog.subscribe(
  batchedChanges((change) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !isRenderWindow(window)) {
        window.webContents.send(ipc.consoleChanged, change)
      }
    }
  })
)

/** The editor window, which agents' calls go through: Parity's own page, not an offscreen renderer. */
function editorWindow(): BrowserWindow {
  const window = BrowserWindow.getAllWindows().find(
    (candidate) => !isRenderWindow(candidate) && candidate.webContents.getURL() === rendererUrl
  )

  if (!window) {
    throw new CodedError("Parity's window isn't open", { code: "not_answering", retryable: true })
  }

  return window
}

function isRenderWindow(window: BrowserWindow): boolean {
  return renderPool.windows().some((render) => render.window === window)
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

// Everything a window asks main, as `hostMethods` declares it (PAR-965): the registration checks who's asking and what
// they sent, and the handlers get what they need of the app from here.
answerWindows<HostEvent, BrowserWindow>({
  ipc: ipcMain,
  appWindow: appWindowOf,
  around: handleInSpan,
  handlers: hostHandlers({
    account,
    connectors: {
      ...connectorHub,
      states() {
        // A copy that started offline asks again what the service searches, for the next time a browser opens.
        if (remoteSearch.connectors.length === 0) {
          void remoteSearch.load()
        }

        return connectorHub.states()
      }
    },
    buildInfo: () => installedBuild.get(),
    telemetry: {
      get: () => telemetrySetting.get(),
      setLevel: (level) => telemetrySetting.setLevel(level),
      apply: applyTelemetry,
      // Windows and render windows send the events they record, named by the window that sent them (PAR-627).
      record: (sent, event) => {
        const window = BrowserWindow.fromWebContents(event.sender)
        const render = window && isRenderWindow(window)
        const envelope = recordForwarded(sent, render ? "render" : "renderer")

        if (envelope && !render) {
          appLife.forwarded(envelope)
        }
      }
    },
    reports,
    updates: {
      state: () => updates?.get(),
      check: async () => {
        await updates?.check()
      },
      setBeta: (beta) => updates?.setBeta(beta),
      restart: (window) => closeFlow.restartForUpdate(window)
    },
    pickPath: async (window, options) => {
      const result = await dialog.showOpenDialog(window, options)

      return result.canceled ? undefined : result.filePaths[0]
    },
    savePath: async (window, settings) => {
      const result = await dialog.showSaveDialog(window, settings)

      return result.canceled ? undefined : result.filePath
    },
    showItem: (path) => shell.showItemInFolder(path),
    openExternal: (url) => shell.openExternal(url),
    copiedFiles: () => copiedFiles({ platform: process.platform, raw: (format) => rawFormat(clipboard, format) }),
    openInEditor,
    installCli: () => installCli(cliTarget(packaged)),
    quit: () => app.quit(),
    toggleDevTools: (window) => window.webContents.toggleDevTools(),
    theme: {
      get: () => nativeTheme.themeSource,
      set: (theme) => {
        nativeTheme.themeSource = theme
      },
      remember: (theme) => writeFileSync(themeFile, JSON.stringify({ theme }))
    },
    metrics: (window) => processUsage(window.webContents),
    // The editor says which frame's event it's handling just before a console message is written there (PAR-147).
    console: {
      announce: (window, level, context) => announced.announce(window.webContents.id, level, context),
      read: (origin) => consoleLog.read(origin),
      clear: (origin) => consoleLog.clear(origin)
    },
    closing: (window) => closeFlow.replies(window.id)
  })
})

void app.whenReady().then(() => {
  appLife.mark("mainReady")

  if (handedLink) {
    void receiveLink(handedLink).finally(() => app.quit())

    return
  }

  // The installer registers the scheme on macOS; on Windows and Linux the app does, pointing it at itself.
  if (packaged && !app.isDefaultProtocolClient("parity")) {
    app.setAsDefaultProtocolClient("parity")
  }

  void installedBuild.get()

  if (packaged) {
    void refreshCli(cliTarget(true)).catch(() => undefined)
  }

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
      if (!isRenderWindow(window)) {
        window.webContents.send(ipc.updateChanged, state)
      }
    }
  }, environment)
  projectService.start()
  createWindow()
  // The keychain is only ready once the app is.
  void account.restore()
  connectorHub.start()
  // Which sources Parity's service searches, so the window offers them.
  void remoteSearch.load()
  void updates.check()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("quit", () => {
  projectService.stop()
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
    if (!name || !bundles.includes(name)) {
      return
    }

    clearTimeout(pending)
    pending = setTimeout(() => {
      const next = bundle()

      if (next === running) {
        return
      }

      running = next
      logNote("[dev] project service changed, restarting it")
      projectService.start()
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
