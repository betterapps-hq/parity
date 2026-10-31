// CI-only: package two real versions, reject a corrupt download, then update and restart the installed app.
import { spawnSync } from "node:child_process"
import { createReadStream } from "node:fs"
import { chmod, cp, mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises"
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
import { basename, join, relative, resolve, sep } from "node:path"
import { Transform } from "node:stream"
import type { UpdateState } from "@parity-app/core"
import { _electron, type Browser, chromium, type ElectronApplication, type Page } from "playwright-core"

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
let electron: ElectronApplication | undefined
let restarted: Browser | undefined
let installedWindows = false
let feed: Server | undefined

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

async function openUpdate(page: Page): Promise<void> {
  await page.getByRole("menuitem", { name: "Help", exact: true }).click()
  await page.getByRole("menuitem", { name: "Check for updates", exact: true }).click()
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
  // The fixed, owned CDP port lets the check reconnect to the process the real updater launches.
  const port = createServer()
  await new Promise<void>((listening) => port.listen(0, "127.0.0.1", listening))
  const address = port.address()
  if (!address || typeof address === "string") throw new Error("No debug port")
  env.PARITY_DEBUG_PORT = String(address.port)
  await new Promise<void>((closed) => port.close(() => closed()))
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
  electron = await _electron.launch({
    executablePath: executable,
    args: process.platform === "linux" ? ["--no-sandbox"] : [],
    cwd: work,
    env: launchEnv
  })
  electron.process().stdout?.on("data", (chunk: Buffer) => process.stdout.write(chunk))
  electron.process().stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk))
  const page = await electron.firstWindow()
  page.setDefaultTimeout(90_000)
  await page.waitForURL("parity://app/index.html")
  await page.waitForFunction(() => window.canvasHost?.appVersion === "999.0.0")
  const rejected = await waitForUpdate(page, "error")
  if (rejected.phase !== "error" || !/sha512|checksum/i.test(rejected.message)) {
    throw new Error(`The corrupt download did not fail its checksum verification: ${JSON.stringify(rejected)}`)
  }
  await page.evaluate(() => window.canvasHost.updates.act())
  if ((await page.evaluate(() => window.canvasHost.appVersion)) !== "999.0.0")
    throw new Error("A corrupt update was installed.")
  corrupt = false
  await page.evaluate(() => window.canvasHost.updates.check())
  await waitForUpdate(page, "ready")
  await page.getByRole("button", { name: "Later", exact: true }).click()
  if ((await page.evaluate(() => window.canvasHost.updates.get())).phase !== "ready")
    throw new Error("Later discarded the update.")
  await page.getByRole("application", { name: "tldraw", exact: true }).waitFor()
  await agent("exec", {
    label: "Update test unsaved work",
    code: 'CreateDesign({ name: "Update smoke", file: "update-smoke.par" })'
  })
  await openUpdate(page)
  await page.getByRole("button", { name: "Restart to update", exact: true }).click()
  const save = page.getByRole("dialog", { name: /Save changes to/ })
  await save.getByRole("button", { name: "Cancel", exact: true }).click()
  if ((await page.evaluate(() => window.canvasHost.appVersion)) !== "999.0.0")
    throw new Error("Cancelling restarted the app.")
  if ((await page.evaluate(() => window.canvasHost.updates.get())).phase !== "ready")
    throw new Error("Cancelling lost the ready update.")
  await page.getByRole("button", { name: "Restart to update", exact: true }).click()
  await save.getByRole("button", { name: "Save", exact: true }).click()
  const deadline = Date.now() + 120_000
  let newPage: Page | undefined
  while (Date.now() < deadline) {
    try {
      if (restarted && !restarted.isConnected()) restarted = undefined
      restarted ??= await chromium.connectOverCDP(`http://127.0.0.1:${address.port}`, { timeout: 2000 })
      newPage = restarted
        .contexts()
        .flatMap((context) => context.pages())
        .find((candidate) => candidate.url() === "parity://app/index.html")
      if (newPage && (await newPage.evaluate(() => window.canvasHost?.appVersion === "999.0.1"))) break
    } catch {
      await restarted?.close().catch(() => undefined)
      restarted = undefined
    }
    newPage = undefined
    await new Promise((done) => setTimeout(done, 500))
  }
  if (!newPage) throw new Error("The updated app did not relaunch as 999.0.1.")
  const saved = await readFile(join(project, "update-smoke.par"), "utf8")
  if (!saved.includes("Update smoke")) throw new Error("Unsaved work was not saved before installation.")
  await newPage.evaluate(() => window.canvasHost.quit()).catch(() => undefined)
  console.log(
    "Real installed update passed: corrupt download rejected, Later retained, Cancel respected, work saved, version 999.0.1 relaunched."
  )
} finally {
  await restarted?.close().catch(() => undefined)
  await electron?.close().catch(() => undefined)
  feed?.closeAllConnections()
  if (feed) await new Promise<void>((closed) => feed!.close(() => closed()))
  if (installedWindows) run(join(installed, "Uninstall Parity.exe"), ["/S", `_?=${installed}`], work)
  await removeWork()
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
