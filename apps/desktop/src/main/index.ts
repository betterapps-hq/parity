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
  screen,
  shell,
  type UtilityProcess,
  utilityProcess,
  webContents
} from "electron"
import type { ProcessUsage, RenderedFrame, RenderJob, SaveDialogOptions } from "../shared/protocol.ts"
import type { MainMessage, ServiceMessage } from "../shared/service.ts"
import { readConsole, recordConsole } from "./console-log.ts"

const rendererUrl = process.env.PARITY_RENDERER_URL
if (!rendererUrl) {
  console.error("PARITY_RENDERER_URL is not set. Start the app with `pnpm dev`.")
  process.exit(1)
}

// Lets agents and scripts inspect the running canvas over the Chrome DevTools Protocol.
if (process.env.PARITY_DEBUG_PORT) app.commandLine.appendSwitch("remote-debugging-port", process.env.PARITY_DEBUG_PORT)
// A copy being measured keeps drawing while other windows cover it, which a window otherwise stops doing on Windows.
if (process.env.PARITY_WINDOW_SIZE) app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion")
// A second copy, such as the one `pnpm perf` starts, keeps its own tabs, storage and theme.
if (process.env.PARITY_USER_DATA) app.setPath("userData", process.env.PARITY_USER_DATA)

let service: UtilityProcess | undefined
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

/** Builders, file access, agents and other heavy work run here, never in the UI process. */
function startService(): UtilityProcess {
  const child = utilityProcess.fork(join(import.meta.dirname, "utility.mjs"), [], {
    serviceName,
    stdio: "inherit",
    env: { ...process.env, PARITY_ALLOWED_ORIGINS: new URL(rendererUrl!).origin }
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
    backgroundColor: background,
    // The tab strip is the title bar; the system's window buttons sit over its end.
    titleBarStyle: mac ? "hiddenInset" : "hidden",
    ...(mac ? {} : { titleBarOverlay: { color: background, symbolColor: symbols, height: 40 } }),
    webPreferences: {
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
      ready = true
      window.close()
      if (quitting) app.quit()
    }, 3000)
  })
  ipcMain.removeAllListeners("canvas:close-cancel")
  ipcMain.on("canvas:close-cancel", (event) => {
    if (event.sender !== window.webContents) return
    deciding = false
    quitting = false
  })
  ipcMain.removeAllListeners("canvas:close-ready")
  ipcMain.on("canvas:close-ready", (event) => {
    if (event.sender !== window.webContents || ready) return
    ready = true
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
  window.on("closed", () => renderWindow?.destroy())
  void window.loadURL(rendererUrl!)
}

let quitting = false
app.on("before-quit", () => {
  quitting = true
})

/**
 * The window's menus are drawn by the app itself, in its title bar. The application menu only keeps what the system
 * expects: clipboard and window commands on macOS, and developer tools everywhere. Electron's default menu would
 * otherwise close the window on Ctrl+W and reload it on Ctrl+R.
 */
function applicationMenu(): Menu {
  const developer: Electron.MenuItemConstructorOptions = {
    label: "Developer",
    submenu: [{ role: "toggleDevTools" }, { role: "reload" }]
  }
  if (process.platform !== "darwin") return Menu.buildFromTemplate([developer])
  return Menu.buildFromTemplate([
    { role: "appMenu" },
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

ipcMain.handle("canvas:set-theme", (_event, theme: ThemeSource) => {
  if (!["light", "dark", "system"].includes(theme) || nativeTheme.themeSource === theme) return
  nativeTheme.themeSource = theme
  try {
    writeFileSync(themeFile, JSON.stringify({ theme }))
  } catch (error) {
    console.error("The theme couldn't be remembered", error)
  }
})

// The performance stats: each process's CPU and memory, named by what it does. Storybook and other programs the
// project service starts run outside the app, so they aren't counted.
ipcMain.handle("canvas:metrics", (event): ProcessUsage[] => {
  const cores = availableParallelism()
  const pages = new Map(webContents.getAllWebContents().map((contents) => [contents.getOSProcessId(), contents]))
  return app.getAppMetrics().map((metric): ProcessUsage => {
    const page = pages.get(metric.pid)
    const role: ProcessUsage["role"] =
      metric.type === "Browser"
        ? "app"
        : metric.type === "GPU"
          ? "gpu"
          : metric.name === serviceName
            ? "service"
            : page && page === renderWindow?.webContents
              ? "offscreen"
              : page === event.sender
                ? "this-window"
                : page
                  ? "window"
                  : "helper"
    const names: Record<ProcessUsage["role"], string> = {
      app: "Parity",
      "this-window": "This window",
      window: page?.getTitle() || "Another window",
      offscreen: "Offscreen renderer",
      service: "Project service",
      gpu: "GPU",
      helper: metric.name || metric.serviceName || metric.type
    }
    return {
      role,
      name: names[role],
      pid: metric.pid,
      cpu: metric.cpu.percentCPUUsage / cores,
      memory: metric.memory.workingSetSize * 1024
    }
  })
})

// Agents measure and capture frames offscreen, so their work never moves the person's camera.
let renderWindow: BrowserWindow | undefined
let renderLoaded: Promise<void> | undefined
let renderQueue: Promise<unknown> = Promise.resolve()

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
  const result = renderQueue.then(run, run)
  renderQueue = result.catch(() => undefined)
  return result
}

void app.whenReady().then(() => {
  Menu.setApplicationMenu(applicationMenu())
  service = startService()
  createWindow()
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
  const bundle = () =>
    ["utility.mjs", "props-worker.mjs"].map((name) => readFileSync(join(import.meta.dirname, name), "utf8")).join("\n")
  let running = bundle()
  let pending: NodeJS.Timeout | undefined
  watch(import.meta.dirname, (_event, name) => {
    if (name !== "utility.mjs" && name !== "props-worker.mjs") return
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
