// CI-only: package two real versions, reject a corrupt download, then update and restart the installed app.
import { type ChildProcess, spawn, spawnSync } from "node:child_process"
import { createReadStream } from "node:fs"
import { chmod, cp, mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises"
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
import { basename, join, relative, resolve, sep } from "node:path"
import { Transform } from "node:stream"
import type { UpdateState } from "@parity-app/core"
import { type Browser, chromium, type Page } from "playwright-core"

if (process.env.CI !== "true") throw new Error("Installed update checks run only in CI.")
if (process.platform !== "win32" && process.platform !== "linux") throw new Error("This check needs Windows or Linux.")
const appDir = resolve(import.meta.dirname, "..")
const work = await realpath(await mkdtemp(join(tmpdir(), "parity-update-")))
const installed = join(work, "installed")
const first = join(work, "first")
const second = join(work, "second")
const userData = join(work, "user")
const agentFile = join(work, "agent.json")
let corrupt = true
let appProcess: ChildProcess | undefined
let initialBrowser: Browser | undefined
let restarted: Browser | undefined
let installedWindows = false
let feed: Server | undefined
let stage = "packaging"
let failed = false
let watchdog: NodeJS.Timeout | undefined
const ownedProcesses = new Set<number>()
const electronLog = join(work, "electron.log")

async function debugEndpoint(): Promise<string> {
  const [portText, path] = (await readFile(join(userData, "DevToolsActivePort"), "utf8")).trim().split(/\r?\n/)
  const port = Number(portText)
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65535 || !path || !/^\/devtools\/browser\/[\w-]+$/.test(path))
    throw new Error("The owned app has not published its debug endpoint.")
  return `ws://127.0.0.1:${port}${path}`
}

async function track(browser: Browser): Promise<void> {
  const session = await withTimeout(browser.newBrowserCDPSession())
  try {
    const { processInfo } = await withTimeout(session.send("SystemInfo.getProcessInfo"))
    const main = processInfo.find((process) => process.type === "browser")
    if (!main || !Number.isSafeInteger(main.id) || main.id <= 0) throw new Error("No owned browser process")
    if (!ownedProcesses.has(main.id)) console.log(`Tracking owned app process ${main.id}`)
    ownedProcesses.add(main.id)
  } finally {
    await withTimeout(session.detach()).catch(() => undefined)
  }
}

/** NSIS restarts through Explorer, whose environment need not retain this check's debug/profile variables. */
function windowsApp(): { pid: number; version: string } | undefined {
  const executable = join(installed, "Parity.exe").replaceAll("'", "''")
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$app = Get-Process -Name Parity -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${executable}' -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1; if ($app) { @{ pid = $app.Id; version = $app.MainModule.FileVersionInfo.ProductVersion } | ConvertTo-Json -Compress }`
    ],
    { encoding: "utf8", windowsHide: true, timeout: 5000 }
  )
  if (result.status !== 0)
    throw new Error(`Could not inspect the restarted app: ${result.error?.message ?? result.stderr}`)
  if (!result.stdout.trim()) return undefined
  const snapshot: unknown = JSON.parse(result.stdout)
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    !("pid" in snapshot) ||
    typeof snapshot.pid !== "number" ||
    !Number.isSafeInteger(snapshot.pid) ||
    snapshot.pid <= 0 ||
    !("version" in snapshot) ||
    typeof snapshot.version !== "string"
  )
    throw new Error("Invalid restarted app process information.")
  return { pid: snapshot.pid, version: snapshot.version }
}

function run(command: string, args: string[], cwd = appDir): void {
  const result = spawnSync(command, args, {
    cwd,
    windowsHide: true,
    stdio: "inherit",
    timeout: 600_000,
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" }
  })
  if (result.status !== 0) throw new Error(`${basename(command)} failed: ${result.error?.message ?? result.status}`)
}

async function packageVersion(version: string, output: string, url: string): Promise<void> {
  const pnpm = process.env.npm_execpath
  if (!pnpm) throw new Error("Run this check through pnpm.")
  const config = join(work, `builder-${version}.json`)
  await writeFile(
    config,
    JSON.stringify({
      extends: join(appDir, "electron-builder.yml"),
      directories: { output },
      extraMetadata: { version },
      publish: [{ provider: "generic", url }]
    })
  )
  const args = [
    "exec",
    "electron-builder",
    process.platform === "win32" ? "--win" : "--linux",
    "--x64",
    "--publish",
    "never",
    "--config",
    config
  ]
  if (/\.[cm]?js$/.test(pnpm)) run(process.execPath, [pnpm, ...args])
  else run(pnpm, args)
}

async function serve(): Promise<string> {
  feed = createServer((request, response) => {
    void (async () => {
      const name = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname.slice(1))
      if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(name)) {
        response.writeHead(404).end()
        return
      }
      const file = join(second, name)
      const size = (await stat(file)).size
      const range = request.headers.range
      let start = 0
      let end = size - 1
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range)
        if (!match) {
          response.writeHead(416).end()
          return
        }
        start = Number(match[1])
        end = match[2] ? Number(match[2]) : size - 1
        if (start > end || end >= size) {
          response.writeHead(416).end()
          return
        }
      }
      response.writeHead(range ? 206 : 200, {
        "content-type": name.endsWith(".yml") ? "text/yaml" : "application/octet-stream",
        "content-length": end - start + 1,
        "accept-ranges": "bytes",
        ...(range ? { "content-range": `bytes ${start}-${end}/${size}` } : {})
      })
      const source = createReadStream(file, { start, end })
      source.on("error", () => response.destroy())
      if (corrupt && /\.(exe|AppImage)$/.test(name)) {
        let changed = false
        source
          .pipe(
            new Transform({
              transform(chunk: Buffer, _encoding, done) {
                if (!changed && chunk.length) {
                  chunk[0] = chunk[0]! ^ 255
                  changed = true
                }
                done(null, chunk)
              }
            })
          )
          .pipe(response)
      } else source.pipe(response)
    })().catch(() => {
      if (!response.headersSent) response.writeHead(404)
      response.end()
    })
  })
  await new Promise<void>((resolveListen) => feed!.listen(0, "127.0.0.1", resolveListen))
  const address = feed.address()
  if (!address || typeof address === "string") throw new Error("No local update feed port")
  return `http://127.0.0.1:${address.port}/`
}

async function agent(method: string, params: Record<string, unknown> = {}): Promise<void> {
  const deadline = Date.now() + 60_000
  let problem = "The agent is not ready."
  while (Date.now() < deadline) {
    try {
      const connection: unknown = JSON.parse(await readFile(agentFile, "utf8"))
      if (
        !connection ||
        typeof connection !== "object" ||
        !("url" in connection) ||
        !("token" in connection) ||
        typeof connection.url !== "string" ||
        typeof connection.token !== "string"
      )
        throw new Error("Not ready")
      const response = await fetch(`${connection.url}/rpc`, {
        method: "POST",
        headers: { authorization: `Bearer ${connection.token}`, "content-type": "application/json" },
        body: JSON.stringify({ method, params }),
        signal: AbortSignal.timeout(5000)
      })
      const answer: unknown = await response.json()
      if (!response.ok || !answer || typeof answer !== "object" || "error" in answer || !("result" in answer))
        throw new Error("The agent call did not succeed.")
      if (
        method === "exec" &&
        (!answer.result || typeof answer.result !== "object" || !("ok" in answer.result) || answer.result.ok !== true)
      )
        throw new Error("The edit was not applied.")
      return
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error)
    }
    await new Promise((done) => setTimeout(done, 200))
  }
  throw new Error(problem)
}

async function checkFromMenu(page: Page): Promise<void> {
  await page.getByRole("menuitem", { name: "Help", exact: true }).click()
  await page.getByRole("menuitem", { name: "Check for updates", exact: true }).click()
}

async function openUpdate(page: Page): Promise<void> {
  await checkFromMenu(page)
  await page.getByRole("button", { name: "Restart to update", exact: true }).waitFor()
  if (await page.getByRole("dialog", { name: "Parity", exact: true }).count())
    throw new Error("Check for updates opened About instead of a toast.")
  // About remains a separate way to find the restart control after dismissing the notice.
  await page.getByRole("button", { name: "Later", exact: true }).click()
  await page.getByRole("menuitem", { name: "Help", exact: true }).click()
  await page.getByRole("menuitem", { name: "About Parity", exact: true }).click()
}

/** The predicate API doesn't await an IPC promise; poll explicit snapshots instead of accepting a truthy Promise. */
async function waitForUpdate(page: Page, phase: UpdateState["phase"]): Promise<UpdateState> {
  const deadline = Date.now() + 90_000
  let snapshot: UpdateState | undefined
  while (Date.now() < deadline) {
    snapshot = await page.evaluate(() => window.canvasHost.updates.get())
    if (snapshot.phase === phase) return snapshot
    if (snapshot.phase === "error") throw new Error(`The update failed: ${snapshot.message}`)
    await new Promise((done) => setTimeout(done, 100))
  }
  throw new Error(`Update did not reach ${phase}: ${JSON.stringify(snapshot)}`)
}

try {
  const url = await serve()
  await packageVersion("999.0.1", second, url)
  await packageVersion("999.0.0", first, url)
  await mkdir(installed)
  const env: NodeJS.ProcessEnv = { ...process.env }
  const reset = new Set([
    "ELECTRON_RUN_AS_NODE",
    "NODE_OPTIONS",
    "NODE_PATH",
    "PARITY_USER_DATA",
    "PARITY_PROJECT",
    "PARITY_AGENT_FILE",
    "PARITY_RENDERER_URL",
    "PARITY_DEV_RUNNER",
    "PARITY_DEBUG_PORT"
  ])
  for (const key of Object.keys(env)) if (reset.has(key.toUpperCase())) delete env[key]
  env.PARITY_USER_DATA = userData
  env.PARITY_AGENT_FILE = agentFile
  env.ELECTRON_ENABLE_LOGGING = "1"
  env.ELECTRON_LOG_FILE = electronLog
  // The updater can start its replacement before the original process releases its sockets.
  // Let each launch choose a port and discover its endpoint in this check's own profile instead.
  env.PARITY_DEBUG_PORT = "0"
  const fixture = resolve(appDir, "../../fixtures/vite7-js")
  const project = join(work, "project")
  await cp(fixture, project, {
    recursive: true,
    filter: (path) => relative(fixture, path).split(sep)[0] !== "node_modules"
  })
  await symlink(join(fixture, "node_modules"), join(project, "node_modules"), "junction")
  env.PARITY_PROJECT = project
  let executable: string
  if (process.platform === "win32") {
    run(join(first, "Parity-999.0.0-win-x64.exe"), ["/S", `/D=${installed}`], work)
    installedWindows = true
    executable = join(installed, "Parity.exe")
  } else {
    const image = join(installed, "Parity-999.0.0-linux-x86_64.AppImage")
    await cp(join(first, basename(image)), image)
    await chmod(image, 0o755)
    run(image, ["--appimage-extract"], installed)
    executable = join(installed, "squashfs-root/parity")
    env.APPIMAGE = image
    env.APPDIR = join(installed, "squashfs-root")
    env.APPIMAGE_EXTRACT_AND_RUN = "1"
    // The AppImage updater relaunches without argv; the runner-only setting must survive through its environment.
    env.ELECTRON_DISABLE_SANDBOX = "1"
  }
  const launchEnv: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) if (value !== undefined) launchEnv[key] = value
  // ElectronApplication.launch attaches a Node inspector that can hold app.quit open during a real update.
  // Start the executable as a user would and attach only to its renderer's existing CDP endpoint instead.
  appProcess = spawn(executable, process.platform === "linux" ? ["--no-sandbox"] : [], {
    cwd: work,
    env: launchEnv,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  })
  // Record the spawned child even if startup fails before CDP can report its browser PID.
  if (appProcess.pid !== undefined) ownedProcesses.add(appProcess.pid)
  let launchError: Error | undefined
  appProcess.on("error", (error) => {
    launchError = error
  })
  appProcess.stdout?.on("data", (chunk: Buffer) => process.stdout.write(chunk))
  appProcess.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk))
  appProcess.on("exit", (code, signal) => console.log(`Original app exited: code=${code}, signal=${signal}`))
  let page: Page | undefined
  let originalEndpoint = ""
  const startupDeadline = Date.now() + 60_000
  while (Date.now() < startupDeadline) {
    if (launchError) throw launchError
    if (appProcess.exitCode !== null || appProcess.signalCode !== null)
      throw new Error("The installed app exited before opening its window.")
    try {
      originalEndpoint = await debugEndpoint()
      initialBrowser ??= await withTimeout(chromium.connectOverCDP(originalEndpoint, { timeout: 2000 }))
      page = initialBrowser
        .contexts()
        .flatMap((context) => context.pages())
        .find((candidate) => candidate.url() === "parity://app/index.html")
      if (page) break
    } catch {
      initialBrowser = undefined
    }
    await new Promise((done) => setTimeout(done, 100))
  }
  if (!page) throw new Error("The installed app did not open its window.")
  await track(initialBrowser!)
  watchdog = setTimeout(() => {
    console.error(`Installed update check timed out during: ${stage}`)
    appProcess?.kill("SIGKILL")
  }, 300_000)
  watchdog.unref()
  page.setDefaultTimeout(90_000)
  await page.waitForURL("parity://app/index.html")
  await page.waitForFunction(() => window.canvasHost?.appVersion === "999.0.0")
  stage = "rejecting the corrupt startup download"
  console.log(stage)
  const rejected = await waitForUpdate(page, "error")
  if (rejected.phase !== "error" || !/sha512|checksum/i.test(rejected.message)) {
    throw new Error(`The corrupt download did not fail its checksum verification: ${JSON.stringify(rejected)}`)
  }
  await page.evaluate(() => window.canvasHost.updates.act())
  if ((await page.evaluate(() => window.canvasHost.appVersion)) !== "999.0.0")
    throw new Error("A corrupt update was installed.")
  await checkFromMenu(page)
  await page.getByText("Couldn't check for updates", { exact: true }).waitFor()
  if (await page.getByRole("dialog", { name: "Parity", exact: true }).count())
    throw new Error("A failed manual check opened About instead of a toast.")
  corrupt = false
  stage = "downloading a valid update"
  console.log(stage)
  await page.getByRole("button", { name: "Try again", exact: true }).click()
  await waitForUpdate(page, "ready")
  await page.getByRole("button", { name: "Later", exact: true }).click()
  if ((await page.evaluate(() => window.canvasHost.updates.get())).phase !== "ready")
    throw new Error("Later discarded the update.")
  await page.getByRole("application", { name: "tldraw", exact: true }).waitFor()
  stage = "creating unsaved work"
  console.log(stage)
  await agent("exec", {
    label: "Update test unsaved work",
    code: 'CreateDesign({ name: "Update smoke", file: "update-smoke.par" })'
  })
  await openUpdate(page)
  stage = "cancelling restart with unsaved work"
  console.log(stage)
  await page.getByRole("button", { name: "Restart to update", exact: true }).click()
  const save = page.getByRole("dialog", { name: /Save changes to/ })
  await save.getByRole("button", { name: "Cancel", exact: true }).click()
  if ((await page.evaluate(() => window.canvasHost.appVersion)) !== "999.0.0")
    throw new Error("Cancelling restarted the app.")
  if ((await page.evaluate(() => window.canvasHost.updates.get())).phase !== "ready")
    throw new Error("Cancelling lost the ready update.")
  stage = "saving work and restarting"
  console.log(stage)
  await page.getByRole("button", { name: "Restart to update", exact: true }).click()
  await save.getByRole("button", { name: "Save", exact: true }).click()
  const deadline = Date.now() + 120_000
  stage = "waiting for the installed new version"
  console.log(stage)
  let newPage: Page | undefined
  let relaunched = false
  let lastRelaunch = "No connection to the updated app."
  let reportedRelaunch = ""
  while (Date.now() < deadline) {
    try {
      if (process.platform === "win32") {
        const next = windowsApp()
        if (next && next.pid !== appProcess.pid) {
          ownedProcesses.add(next.pid)
          // Windows version resources include a fourth build component; the release version must still match exactly.
          if (/^999\.0\.1(?:\.\d+)?$/.test(next.version)) {
            relaunched = true
            console.log(`Restarted Windows app: PID ${next.pid}, executable version ${next.version}`)
            break
          }
        }
        lastRelaunch = `Waiting for the new Windows app window: ${JSON.stringify(next)}`
        await new Promise((done) => setTimeout(done, 500))
        continue
      }
      if (restarted && !restarted.isConnected()) restarted = undefined
      const endpoint = await debugEndpoint()
      if (endpoint === originalEndpoint) throw new Error("Waiting for the replacement app's debug endpoint.")
      restarted ??= await withTimeout(chromium.connectOverCDP(endpoint, { timeout: 2000 }))
      await track(restarted)
      newPage = restarted
        .contexts()
        .flatMap((context) => context.pages())
        .find((candidate) => candidate.url() === "parity://app/index.html")
      const version = newPage ? await withTimeout(newPage.evaluate(() => window.canvasHost?.appVersion)) : undefined
      if (version === "999.0.1") {
        relaunched = true
        break
      }
      lastRelaunch = `Connected pages: ${restarted
        .contexts()
        .flatMap((context) => context.pages())
        .map((page) => page.url())
        .join(", ")}; version=${version}`
    } catch (error) {
      lastRelaunch = error instanceof Error ? error.message : String(error)
      if (restarted) await withTimeout(restarted.close()).catch(() => undefined)
      restarted = undefined
    }
    if (lastRelaunch !== reportedRelaunch) {
      console.log(lastRelaunch)
      reportedRelaunch = lastRelaunch
    }
    newPage = undefined
    await new Promise((done) => setTimeout(done, 500))
  }
  if (!relaunched) throw new Error(`The updated app did not relaunch as 999.0.1. ${lastRelaunch}`)
  const saved = await readFile(join(project, "update-smoke.par"), "utf8")
  if (!saved.includes("Update smoke")) throw new Error("Unsaved work was not saved before installation.")
  if (newPage) await withTimeout(newPage.evaluate(() => window.canvasHost.quit())).catch(() => undefined)
  console.log(
    "Real installed update passed: corrupt download rejected, Later retained, Cancel respected, work saved, version 999.0.1 relaunched."
  )
} catch (error) {
  failed = true
  if (process.platform === "win32") {
    const snapshot = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-Process -Name Parity -ErrorAction SilentlyContinue | Select-Object Id,Path,MainWindowHandle,StartTime | ConvertTo-Json -Compress"
      ],
      { encoding: "utf8", windowsHide: true, timeout: 5000 }
    )
    console.error("Windows app processes:", snapshot.stdout, snapshot.stderr)
  }
  console.error((await readFile(electronLog, "utf8").catch(() => "No Electron log")).split("\n").slice(-50).join("\n"))
  throw error
} finally {
  clearTimeout(watchdog)
  console.log(`Cleaning up installed update check after: ${stage}`)
  await cleanup()
}

async function cleanup(): Promise<void> {
  const problems: unknown[] = []
  const attempt = async (step: () => unknown): Promise<void> => {
    try {
      await step()
    } catch (error) {
      problems.push(error)
      console.error("Cleanup step failed:", error)
    }
  }
  // Cleanup must not open an unanswered unsaved-work prompt in this disposable copy of the app.
  await attempt(() => {
    if (appProcess?.exitCode === null && appProcess.signalCode === null) appProcess.kill("SIGKILL")
  })
  await attempt(stopOwnedApps)
  if (restarted) await attempt(() => withTimeout(restarted!.close()))
  if (initialBrowser) await attempt(() => withTimeout(initialBrowser!.close()))
  await attempt(async () => {
    feed?.closeAllConnections()
    if (feed) await withTimeout(new Promise<void>((closed) => feed!.close(() => closed())))
  })
  if (installedWindows)
    await attempt(async () => {
      // With _?= the uninstaller runs in place. Keep it outside INSTDIR so its own process is not counted as the app.
      const uninstaller = join(work, "uninstall.exe")
      await cp(join(installed, "Uninstall Parity.exe"), uninstaller)
      run(uninstaller, ["/S", `_?=${installed}`], work)
    })
  await attempt(removeWork)
  if (!failed && problems.length) throw new AggregateError(problems, "Installed update cleanup failed.")
}

async function stopOwnedApps(): Promise<void> {
  // CDP Browser.close() only disconnects; terminate the owned initial/relaunched browser PIDs before removing files.
  for (const pid of ownedProcesses) {
    try {
      process.kill(pid, "SIGKILL")
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ESRCH") throw error
    }
  }
  const exitDeadline = Date.now() + 10_000
  for (const pid of ownedProcesses) {
    while (true) {
      try {
        process.kill(pid, 0)
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ESRCH") break
        throw error
      }
      if (Date.now() >= exitDeadline) throw new Error(`The owned app process ${pid} did not exit before cleanup.`)
      await new Promise((done) => setTimeout(done, 100))
    }
  }
}

async function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_done, reject) => {
        timer = setTimeout(() => reject(new Error("The app did not respond within five seconds.")), 5000)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function removeWork(): Promise<void> {
  // The only removed tree was created by this check under the runner's temporary directory.
  if (
    !basename(work).startsWith("parity-update-") ||
    !relative(await realpath(tmpdir()), work) ||
    relative(await realpath(tmpdir()), work).startsWith("..")
  )
    throw new Error("Unexpected cleanup path")
  await rm(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
}
