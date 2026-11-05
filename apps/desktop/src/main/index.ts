import { existsSync, readFileSync, watch, writeFileSync } from "node:fs"
import { readFile, utimes } from "node:fs/promises"
import { availableParallelism, homedir } from "node:os"
import { join } from "node:path"
import { agentRegistry, removeEntry } from "@parity-app/agent/registry"
import { type Channel, createChannel, nodePort } from "@parity-app/channel"
import { fitInside, offscreenWindows, previewSizes, type RenderPriority, renderQueue } from "@parity-app/core"
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
import { ipc } from "../shared/channels.ts"
import { codedErrors } from "../shared/coded-errors.ts"
import type {
  OpenInEditorRequest,
  ProcessUsage,
  RenderedFrame,
  RenderJob,
  SaveDialogOptions
} from "../shared/protocol.ts"
import type { BuilderReading, ConnectMessage, MainMethods, ServiceProcessMethods } from "../shared/service.ts"
import { InstalledBuild } from "./build-info.ts"
import { openInEditor } from "./code-editor.ts"
import { readConsole, recordConsole } from "./console-log.ts"
import { idleClose } from "./idle-close.ts"
import { isPackaged } from "./packaged.ts"
import { privateMemory } from "./private-memory.ts"
import type { UpdateSession } from "./update-session.ts"
import { createUpdates } from "./updates.ts"

const rendererUrl = process.env.PARITY_RENDERER_URL ?? "parity://app/index.html"
// A standard, secure origin keeps storage and project CORS working when the UI comes from the installed files.
protocol.registerSchemesAsPrivileged([
  { scheme: "parity", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  // Component previews, which the window shows as plain images straight from the store (PAR-207).
  { scheme: "parity-preview", privileges: { standard: true, secure: true } }
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
/** Each service's channel, which its requests to draw and read consoles come over. */
const serviceChannels = new WeakMap<UtilityProcess, Channel<MainMethods, ServiceProcessMethods>>()

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
    if (isRenderWindow(window)) continue
    window.setBackgroundColor(background)
    window.setTitleBarOverlay({ color: background, symbolColor: symbols, height: 40 })
  }
})

const serviceName = "Parity project service"
const serviceDirectory = isPackaged(app.isPackaged, process.env)
  ? join(process.resourcesPath, "app.asar.unpacked")
  : import.meta.dirname
const serviceEntry = join(serviceDirectory, "utility.mjs")

/** When this copy started, which its agent registry entry gives. */
const appStarted = Date.now()

/** Builders, file access, agents and other heavy work run here, never in the UI process. */
function startService(): UtilityProcess {
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
      PARITY_APP_STARTED: String(appStarted)
    }
  })
  const channel = createChannel<MainMethods, ServiceProcessMethods>({
    errors: codedErrors,
    handlers: {
      render: ({ job, capture }) => renderFrame(job, capture),
      preview: ({ job, crop, priority }) => renderPreview(job, crop, priority),
      console: ({ origin, clear }) => readConsole(origin, clear)
    },
    disconnected: () => new Error("The project service stopped")
  })
  channel.connect(nodePort(child, { closedBy: { exit: () => undefined } }))
  serviceChannels.set(child, channel)
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

/** Updater commands come only from the app's own main frame, never a guest or offscreen renderer. */
function updateOwner(event: Electron.IpcMainInvokeEvent): BrowserWindow {
  const window = ownerOf(event)
  if (
    !window ||
    isRenderWindow(window) ||
    event.senderFrame !== event.sender.mainFrame ||
    event.sender.getURL() !== rendererUrl
  ) {
    throw new Error("Only the Parity window can control updates.")
  }
  return window
}

const buildInfoFile = join(app.getPath("userData"), "installed-build.json")
const installedBuild = new InstalledBuild({
  version: app.getVersion(),
  packaged: isPackaged(app.isPackaged, process.env),
  metadata: () => JSON.parse(readFileSync(join(app.getAppPath(), "package.json"), "utf8")),
  read: () => JSON.parse(readFileSync(buildInfoFile, "utf8")),
  save: (value) => writeFileSync(buildInfoFile, JSON.stringify(value))
})
ipcMain.handle(ipc.buildInfo, (event) => {
  updateOwner(event)
  return installedBuild.get()
})

ipcMain.handle(ipc.updateState, (event) => {
  updateOwner(event)
  return updates?.get() ?? { phase: "disabled", beta: false }
})
ipcMain.handle(ipc.updateCheck, async (event) => {
  updateOwner(event)
  await updates?.check()
})
ipcMain.handle(ipc.updateBeta, (event, beta: unknown) => {
  updateOwner(event)
  if (typeof beta !== "boolean") throw new Error("The beta setting must be true or false.")
  updates?.setBeta(beta)
})
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

ipcMain.handle(ipc.pickFolder, (event, title?: string) =>
  showOpen(event, { title: title ?? "Open project", properties: ["openDirectory", "createDirectory"] })
)

ipcMain.handle(ipc.pickProjectFile, (event) =>
  showOpen(event, {
    title: "Open project file",
    properties: ["openFile"],
    filters: [{ name: "Parity project", extensions: ["par"] }]
  })
)

ipcMain.handle(ipc.saveDialog, async (event, options: SaveDialogOptions) => {
  const owner = ownerOf(event)
  const settings = { title: options.title, defaultPath: options.defaultPath, filters: options.filters }
  const result = owner ? await dialog.showSaveDialog(owner, settings) : await dialog.showSaveDialog(settings)
  return result.canceled ? undefined : result.filePath
})

ipcMain.handle(ipc.showItem, (_event, path: string) => shell.showItemInFolder(path))

ipcMain.handle(ipc.openInEditor, (_event, request: OpenInEditorRequest) => openInEditor(request))

ipcMain.handle(ipc.quit, () => app.quit())

ipcMain.handle(ipc.toggleDevTools, (event) => event.sender.toggleDevTools())

ipcMain.handle(ipc.setTheme, (_event, theme: ThemeSource) => {
  if (!["light", "dark", "system"].includes(theme) || nativeTheme.themeSource === theme) return
  nativeTheme.themeSource = theme
  try {
    writeFileSync(themeFile, JSON.stringify({ theme }))
  } catch (error) {
    console.error("The theme couldn't be remembered", error)
  }
})

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
ipcMain.handle(ipc.metrics, async (event): Promise<ProcessUsage[]> => {
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

// Agents measure and capture frames offscreen, so their work never moves the person's camera. A few windows draw at once,
// so a project's bitmaps are taken in a fraction of the time one window took (PAR-523).
const renderWindows: ({ window: BrowserWindow; loaded: Promise<void> } | undefined)[] = []
// One job in each window, canvas bitmaps and agents' renders before component previews (PAR-207).
const offscreen = renderQueue(offscreenWindows)
// Each window holds its page and every project module graph it imported, which only closing it returns, so they close
// a minute after the last job and the next job opens them again.
const renderIdle = idleClose(60_000, closeRenderWindows)

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
      webPreferences: { offscreen: true, contextIsolation: true, sandbox: true }
    })
    recordConsole(window.webContents, "offscreen", new URL(rendererUrl!).origin)
    render = { window, loaded: window.loadURL(new URL("render.html", rendererUrl).href) }
    renderWindows[index] = render
  }
  const { window, loaded } = render
  return loaded.then(() => window)
}

function renderFrame(job: RenderJob, capture: boolean): Promise<{ frame?: RenderedFrame; png?: string }> {
  return renderOffscreen("render", job, capture || !!job.audit, async (window, frame, width, height) => {
    if (job.audit) {
      const audited = (await window.webContents.executeJavaScript(
        `window.canvasAudit(${JSON.stringify(job.colorTokens ?? [])})`,
        true
      )) as Pick<RenderedFrame, "issues" | "contrast">
      frame.issues = audited.issues
      frame.contrast = audited.contrast
    }
    if (!capture) return { frame }
    const image = await window.webContents.capturePage({ x: 0, y: 0, width, height })
    // A frame that grows with its content keeps the height the canvas lays it out at, measured after the capture
    // (PAR-525).
    if (job.mode.height === undefined) {
      const canvasHeight = (await window.webContents.executeJavaScript("window.canvasHeight()", true)) as
        | number
        | undefined
      if (canvasHeight !== undefined) frame.canvasHeight = canvasHeight
    }
    return { frame, png: image.toPNG().toString("base64") }
  })
}

/** A component preview's pictures, base64 PNGs, with the large one's size. */
interface PreviewPictures {
  thumb: string
  large: string
  width: number
  height: number
}

/**
 * Draws a component preview and crops it to the element `crop` names, scaled down to the two sizes previews are kept
 * at (PAR-207). A component that fails to draw gives its error.
 */
async function renderPreview(
  job: RenderJob,
  crop: string,
  priority: Exclude<RenderPriority, "render">
): Promise<{ pictures: PreviewPictures } | { error: string }> {
  let pictures: PreviewPictures | undefined
  const { frame } = await renderOffscreen(priority, job, true, async (window, drawn) => {
    const box = drawn.nodes.find((node) => node.id === crop)
    if (!box) return { frame: drawn }
    const image = await window.webContents.capturePage({
      x: Math.floor(box.x * job.scale),
      y: Math.floor(box.y * job.scale),
      width: Math.max(1, Math.ceil(box.width * job.scale)),
      height: Math.max(1, Math.ceil(box.height * job.scale))
    })
    const { width, height } = image.getSize()
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
  const run = async (index: number) => {
    const window = await ensureRenderWindow(index)
    const width = Math.max(1, Math.ceil(job.mode.width * job.scale))
    window.setContentSize(width, 800)
    const frame = (await window.webContents.executeJavaScript(
      `window.canvasRender(${JSON.stringify(job)})`,
      true
    )) as RenderedFrame
    if (!whole || frame.error) return { frame }
    // The whole frame is in view, so a capture or a contrast check sees all of it.
    const height = Math.max(1, Math.ceil(frame.height * job.scale))
    window.setContentSize(width, height)
    await window.webContents.executeJavaScript("window.canvasSettle()", true)
    return then(window, frame, width, height)
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
  void installedBuild.get()
  protocol.handle("parity-preview", servePreview)
  protocol.registerSource("parity", {
    routes: [{ match: { host: "app" }, source: { type: "directory", root: join(import.meta.dirname, "renderer") } }]
  })
  // Otherwise the dock shows the icon of the app Parity runs as, which is Electron.
  app.dock?.setIcon(join(import.meta.dirname, "resources", "dock.png"))
  Menu.setApplicationMenu(applicationMenu())
  updates = createUpdates((state) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!isRenderWindow(window)) window.webContents.send(ipc.updateChanged, state)
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

app.on("quit", () => {
  service?.kill()
  // The service writes the entry, but quitting ends it outright, before it could clean up.
  removeEntry(agentRegistry(process.env, homedir()), process.pid)
})

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
