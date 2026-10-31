import { readFileSync, watch, writeFileSync } from "node:fs"
import { availableParallelism } from "node:os"
import { join } from "node:path"
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  MessageChannelMain,
  nativeTheme,
  protocol,
  screen,
  shell,
  type UtilityProcess,
  utilityProcess,
  webContents
} from "electron"
import type { ProcessUsage, RenderedFrame, RenderJob, SaveDialogOptions } from "../shared/protocol.ts"
import type { BuilderReading, MainMessage, ServiceMessage } from "../shared/service.ts"
import { readConsole, recordConsole } from "./console-log.ts"
import { idleClose } from "./idle-close.ts"
import { privateMemory } from "./private-memory.ts"
import type { UpdateSession } from "./update-session.ts"
import { createUpdates } from "./updates.ts"

const rendererUrl = process.env.PARITY_RENDERER_URL ?? "parity://app/index.html"
// A standard, secure origin keeps storage and project CORS working when the UI comes from the installed files.
protocol.registerSchemesAsPrivileged([
  { scheme: "parity", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
])
const rendererOrigin = rendererUrl.startsWith("parity://app/") ? "parity://app" : new URL(rendererUrl).origin

// Lets agents and scripts inspect the running canvas over the Chrome DevTools Protocol.
if (process.env.PARITY_DEBUG_PORT) app.commandLine.appendSwitch("remote-debugging-port", process.env.PARITY_DEBUG_PORT)
// A copy being measured keeps drawing while other windows cover it, which a window otherwise stops doing on Windows.
if (process.env.PARITY_WINDOW_SIZE) app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion")
// A second copy, such as the one `pnpm perf` starts, keeps its own tabs, storage and theme. The app's own stay where
// its package's first name put them, under @parity/desktop, now that the app is named Parity and the package
// @parity-app/desktop (PAR-425).
app.setPath("userData", process.env.PARITY_USER_DATA ?? join(app.getPath("appData"), "@parity", "desktop"))
app.setName("Parity")

let service: UtilityProcess | undefined
let updates: UpdateSession | undefined
const updateRestarts = new Set<number>()
/** Services replaced by a fresh one; their exit is expected. */
const retired = new WeakSet<UtilityProcess>()

type ThemeSource = "light" | "dark" | "system"

/** The app's theme is kept here too, so the window opens in it before the page loads. */
const themeFile = join(app.getPath("userData"), "theme.json")

function savedTheme(): ThemeSource {
  try {
    const { theme } = JSON.parse(readFileSync(themeFile, "utf8")) as { theme?: unknown }
    return theme === "light" || theme === "system" ? theme : "dark"
  } catch {
    return "dark"
  }
}

nativeTheme.themeSource = savedTheme()

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
    if (window === renderWindow) continue
    window.setBackgroundColor(background)
    window.setTitleBarOverlay({ color: background, symbolColor: symbols, height: 40 })
  }
})

const serviceName = "Parity project service"
const serviceDirectory = app.isPackaged ? join(process.resourcesPath, "app.asar.unpacked") : import.meta.dirname

/** Builders, file access, agents and other heavy work run here, never in the UI process. */
function startService(): UtilityProcess {
  const child = utilityProcess.fork(join(serviceDirectory, "utility.mjs"), [], {
    serviceName,
    stdio: "inherit",
    env: { ...process.env, PARITY_ALLOWED_ORIGINS: rendererOrigin }
  })
  child.on("message", (message: ServiceMessage) => {
    if (message.type === "render") {
      renderFrame(message.job, message.capture).then(
        (result) => child.postMessage({ type: "render-result", id: message.id, ...result } satisfies MainMessage),
        (error: unknown) =>
          child.postMessage({
            type: "render-result",
            id: message.id,
            error: error instanceof Error ? error.message : String(error)
          } satisfies MainMessage)
      )
    } else if (message.type === "console") {
      const entries = readConsole(message.origin, message.clear)
      child.postMessage({ type: "console-result", id: message.id, entries } satisfies MainMessage)
    } else if (message.type === "builders-result") {
      lastBuilders = message.builders
      builderAnswers.get(message.id)?.(message.builders)
    }
  })
  child.on("exit", (code) => {
    if (service === child) service = undefined
    if (code !== 0 && !retired.has(child)) console.error(`Project service exited with code ${code}`)
  })
  return child
}

/** Gives a page its own channel to the service. */
function connectWindow(window: BrowserWindow): void {
  service ??= startService()
  const { port1, port2 } = new MessageChannelMain()
  service.postMessage({ type: "connect" } satisfies MainMessage, [port1])
  window.webContents.postMessage("canvas:port", null, [port2])
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
    if (window !== renderWindow && !window.webContents.isLoading()) connectWindow(window)
  }
}

function createWindow(): void {
  const mac = process.platform === "darwin"
  const { background, symbols } = titleBarColors()
  // A size for the page itself, such as 1439x901, which `pnpm perf` asks for so every run draws the same area, in the
  // middle of the main screen, so every run draws at the same pixel ratio.
  const [pageWidth, pageHeight] = (process.env.PARITY_WINDOW_SIZE ?? "").split("x").map(Number)
  const { workArea } = screen.getPrimaryDisplay()
  const window = new BrowserWindow({
    ...(pageWidth && pageHeight
      ? {
          width: pageWidth,
          height: pageHeight,
          useContentSize: true,
          x: Math.round(workArea.x + Math.max(0, workArea.width - pageWidth) / 2),
          y: Math.round(workArea.y + Math.max(0, workArea.height - pageHeight) / 2)
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
        ...(process.env.PARITY_PROJECT ? [`--parity-initial-project=${process.env.PARITY_PROJECT}`] : [])
      ],
      preload: join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true
    }
  })
  recordConsole(window.webContents, "canvas", new URL(rendererUrl!).origin)
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
    ipcMain.once("canvas:close-pending", () => {
      acknowledged = true
    })
    window.webContents.send("canvas:closing")
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
  ipcMain.removeAllListeners("canvas:close-cancel")
  ipcMain.on("canvas:close-cancel", (event) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return
    updateRestarts.delete(window.id)
    deciding = false
    quitting = false
  })
  ipcMain.removeAllListeners("canvas:close-ready")
  ipcMain.on("canvas:close-ready", (event) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || ready) return
    ready = true
    if (updateRestarts.delete(window.id)) {
      if (!updates?.install()) {
        ready = false
        deciding = false
      }
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
  // The hidden render window would otherwise keep the app running.
  window.on("closed", closeRenderWindow)
  window.on("closed", () => updateRestarts.delete(window.id))
  void window.loadURL(rendererUrl!)
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
            let window = BrowserWindow.getAllWindows().find((candidate) => candidate !== renderWindow)
            if (!window) {
              createWindow()
              window = BrowserWindow.getAllWindows().find((candidate) => candidate !== renderWindow)
            }
            if (!window) return
            const contents = window.webContents
            const show = () => contents.send("canvas:show-updates")
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

/** Updater commands come only from the app's own main frame, never a guest or offscreen renderer. */
function updateOwner(event: Electron.IpcMainInvokeEvent): BrowserWindow {
  const window = ownerOf(event)
  if (
    !window ||
    window === renderWindow ||
    event.senderFrame !== event.sender.mainFrame ||
    event.sender.getURL() !== rendererUrl
  ) {
    throw new Error("Only the Parity window can control updates.")
  }
  return window
}

ipcMain.handle("canvas:update-state", (event) => {
  updateOwner(event)
  return updates?.get() ?? { phase: "disabled", beta: false }
})
ipcMain.handle("canvas:update-check", async (event) => {
  updateOwner(event)
  await updates?.check()
})
ipcMain.handle("canvas:update-beta", (event, beta: unknown) => {
  updateOwner(event)
  if (typeof beta !== "boolean") throw new Error("The beta setting must be true or false.")
  updates?.setBeta(beta)
})
ipcMain.handle("canvas:update-act", async (event) => {
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

ipcMain.handle("canvas:pick-folder", (event, title?: string) =>
  showOpen(event, { title: title ?? "Open project", properties: ["openDirectory", "createDirectory"] })
)

ipcMain.handle("canvas:pick-project-file", (event) =>
  showOpen(event, {
    title: "Open project file",
    properties: ["openFile"],
    filters: [{ name: "Parity project", extensions: ["par"] }]
  })
)

ipcMain.handle("canvas:save-dialog", async (event, options: SaveDialogOptions) => {
  const owner = ownerOf(event)
  const settings = { title: options.title, defaultPath: options.defaultPath, filters: options.filters }
  const result = owner ? await dialog.showSaveDialog(owner, settings) : await dialog.showSaveDialog(settings)
  return result.canceled ? undefined : result.filePath
})

ipcMain.handle("canvas:show-item", (_event, path: string) => shell.showItemInFolder(path))

ipcMain.handle("canvas:quit", () => app.quit())

ipcMain.handle("canvas:toggle-dev-tools", (event) => event.sender.toggleDevTools())

ipcMain.handle("canvas:set-theme", (_event, theme: ThemeSource) => {
  if (!["light", "dark", "system"].includes(theme) || nativeTheme.themeSource === theme) return
  nativeTheme.themeSource = theme
  try {
    writeFileSync(themeFile, JSON.stringify({ theme }))
  } catch (error) {
    console.error("The theme couldn't be remembered", error)
  }
})

let nextBuilderReading = 1
const builderAnswers = new Map<number, (builders: BuilderReading[]) => void>()
/** The service's last answer, for when it's too busy to answer in time. */
let lastBuilders: BuilderReading[] = []

/** Each project's builder's CPU and memory, from the service, which runs each builder in a process of its own. */
function builderReadings(): Promise<BuilderReading[]> {
  const current = service
  if (!current) return Promise.resolve([])
  const id = nextBuilderReading++
  return new Promise((resolve) => {
    const answer = (builders: BuilderReading[]) => {
      builderAnswers.delete(id)
      clearTimeout(timer)
      resolve(builders)
    }
    const timer = setTimeout(() => answer(lastBuilders), 1000)
    builderAnswers.set(id, answer)
    current.postMessage({ type: "builders", id } satisfies MainMessage)
  })
}

// The performance stats: each process's CPU and memory, named by what it does. Storybook and other programs the
// project service starts run outside the app, so they aren't counted, apart from each project's builder, which runs
// in a process of its own the service starts. Memory is what each process uses on its own, as the system's monitor
// counts it (see private-memory.ts), and its working set where the system won't say.
ipcMain.handle("canvas:metrics", async (event): Promise<ProcessUsage[]> => {
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
    else if (page && page === renderWindow?.webContents) role = "offscreen"
    else if (page === event.sender) role = "this-window"
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
})

// Agents measure and capture frames offscreen, so their work never moves the person's camera.
let renderWindow: BrowserWindow | undefined
let renderLoaded: Promise<void> | undefined
let renderQueue: Promise<unknown> = Promise.resolve()
// The window holds its page and every project module graph it imported, which only closing it returns, so it closes a
// minute after its last job and the next job opens it again.
const renderIdle = idleClose(60_000, closeRenderWindow)

function closeRenderWindow(): void {
  renderIdle.cancel()
  const window = renderWindow
  renderWindow = undefined
  renderLoaded = undefined
  if (window && !window.isDestroyed()) window.destroy()
}

function ensureRenderWindow(): Promise<BrowserWindow> {
  if (!renderWindow || renderWindow.isDestroyed()) {
    renderWindow = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: { offscreen: true, contextIsolation: true, sandbox: true }
    })
    recordConsole(renderWindow.webContents, "offscreen", new URL(rendererUrl!).origin)
    renderLoaded = renderWindow.loadURL(new URL("render.html", rendererUrl).href)
  }
  const window = renderWindow
  return renderLoaded!.then(() => window)
}

function renderFrame(job: RenderJob, capture: boolean): Promise<{ frame?: RenderedFrame; png?: string }> {
  // Held from the moment it's queued, so the window never closes under a job or with one waiting.
  const done = renderIdle.use()
  const run = async () => {
    const window = await ensureRenderWindow()
    const width = Math.max(1, Math.ceil(job.mode.width * job.scale))
    window.setContentSize(width, 800)
    const frame = (await window.webContents.executeJavaScript(
      `window.canvasRender(${JSON.stringify(job)})`,
      true
    )) as RenderedFrame
    if ((!capture && !job.audit) || frame.error) return { frame }
    // The whole frame is in view, so a capture or a contrast check sees all of it.
    const height = Math.max(1, Math.ceil(frame.height * job.scale))
    window.setContentSize(width, height)
    await window.webContents.executeJavaScript("window.canvasSettle()", true)
    if (job.audit) {
      frame.issues = (await window.webContents.executeJavaScript(
        "window.canvasAudit()",
        true
      )) as RenderedFrame["issues"]
    }
    if (!capture) return { frame }
    const image = await window.webContents.capturePage({ x: 0, y: 0, width, height })
    return { frame, png: image.toPNG().toString("base64") }
  }
  const result = renderQueue.then(run, run).finally(done)
  renderQueue = result.catch(() => undefined)
  return result
}

void app.whenReady().then(() => {
  protocol.registerSource("parity", {
    routes: [{ match: { host: "app" }, source: { type: "directory", root: join(import.meta.dirname, "renderer") } }]
  })
  // Otherwise the dock shows the icon of the app Parity runs as, which is Electron.
  app.dock?.setIcon(join(import.meta.dirname, "resources", "dock.png"))
  Menu.setApplicationMenu(applicationMenu())
  updates = createUpdates((state) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window !== renderWindow) window.webContents.send("canvas:update-changed", state)
    }
  })
  service = startService()
  createWindow()
  void updates.check()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

app.on("quit", () => service?.kill())

// Under the dev runner, which sets PARITY_DEV_RUNNER to its process id.
const devRunner = Number(process.env.PARITY_DEV_RUNNER)
if (devRunner) {
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
