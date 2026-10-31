import { spawnSync } from "node:child_process"
// CI-only production startup check (PAR-8). Run the built files outside the checkout, with no UI dev server.
import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, relative, resolve, sep } from "node:path"
import { _electron, type ElectronApplication } from "playwright-core"

if (process.env.CI !== "true") throw new Error("The production app startup check runs only in CI.")
const appDir = resolve(import.meta.dirname, "..")
const require = createRequire(join(appDir, "package.json"))
const developmentExecutable: unknown = require("electron")
if (typeof developmentExecutable !== "string") throw new Error("Electron did not report its executable.")
let executable = developmentExecutable
const work = await mkdtemp(join(tmpdir(), "parity-built-"))
const stage = join(work, "app")
const agentFile = join(work, "agent.json")
const installerMode = process.argv.includes("--installer")
const installed = join(work, "installed")
if (installerMode) {
  if (process.platform !== "win32") throw new Error("The NSIS startup check needs Windows.")
  const installer = (await readdir(join(appDir, "dist"))).find((file) =>
    /^Parity-\d+\.\d+\.\d+-win-x64\.exe$/.test(file)
  )
  if (!installer) throw new Error("No Windows installer was built.")
  const result = spawnSync(join(appDir, "dist", installer), ["/S", `/D=${installed}`], {
    windowsHide: true,
    windowsVerbatimArguments: true,
    stdio: "inherit"
  })
  if (result.status !== 0) throw new Error(`Installing the built app failed: ${result.error?.message ?? result.status}`)
  executable = join(installed, "Parity.exe")
  // TypeScript must remain a real package, with its standard library declarations, outside any archive.
  await readFile(join(installed, "resources/app.asar.unpacked/node_modules/typescript/lib/lib.es5.d.ts"))
} else await cp(join(appDir, "out"), stage, { recursive: true })
const fixture = process.argv.slice(2).find((argument) => argument !== "--installer") ?? "vite7-js"
if (fixture !== "vite7-js" && fixture !== "headless") throw new Error("Unknown production-check fixture.")
const source = resolve(appDir, "../../fixtures", fixture)
const project = join(work, "project")
await cp(source, project, {
  recursive: true,
  filter: (path) => relative(source, path).split(sep)[0] !== "node_modules"
})
await mkdir(join(project, "node_modules"))
// A fresh cache for every check. Installed dependencies are reused, while Vite creates .vite-parity in this copy.
for (const entry of await readdir(join(source, "node_modules"), { withFileTypes: true })) {
  if (entry.name.startsWith(".vite")) continue
  const from = join(source, "node_modules", entry.name)
  const to = join(project, "node_modules", entry.name)
  if (entry.isDirectory() || entry.isSymbolicLink()) await symlink(from, to, "junction")
  else await cp(from, to)
}
const env: NodeJS.ProcessEnv = {
  ...process.env,
  PARITY_USER_DATA: join(work, "user"),
  PARITY_AGENT_FILE: agentFile,
  PARITY_PROJECT: project
}
delete env.PARITY_RENDERER_URL
delete env.PARITY_DEV_RUNNER
delete env.ELECTRON_RUN_AS_NODE
const launchEnv: Record<string, string> = {}
for (const [key, value] of Object.entries(env)) if (value !== undefined) launchEnv[key] = value
let electron: ElectronApplication | undefined
let uninstallError: Error | undefined
try {
  electron = await _electron.launch({
    executablePath: executable,
    args: installerMode ? [] : [stage],
    cwd: work,
    env: launchEnv
  })
  electron.process().stdout?.on("data", (chunk: Buffer) => process.stdout.write(chunk))
  electron.process().stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk))
  const window = await electron.firstWindow()
  const errors: string[] = []
  window.on("pageerror", (error) => errors.push(error.message))
  window.on("console", (message) => console.log(`[renderer ${message.type()}] ${message.text()}`))
  await window.waitForURL("parity://app/index.html")
  await window.waitForFunction(() => document.getElementById("root")?.childElementCount)
  try {
    await window.getByRole("application", { name: "tldraw", exact: true }).waitFor({ timeout: 60_000 })
  } catch (error) {
    console.error(await window.locator("body").innerText())
    throw error
  }
  const deadline = Date.now() + 30_000
  let connected = false
  while (!connected && Date.now() < deadline) {
    try {
      const agent: unknown = JSON.parse(await readFile(agentFile, "utf8"))
      if (!agent || typeof agent !== "object" || !("url" in agent) || !("token" in agent)) throw new Error("Not ready")
      if (typeof agent.url !== "string" || typeof agent.token !== "string") throw new Error("Not ready")
      const response = await fetch(`${agent.url}/rpc`, {
        method: "POST",
        headers: { authorization: `Bearer ${agent.token}`, "content-type": "application/json" },
        body: JSON.stringify({ method: "tabs", params: {} }),
        signal: AbortSignal.timeout(2000)
      })
      const result: unknown = await response.json()
      connected = response.ok && !!result && typeof result === "object" && "result" in result && !("error" in result)
    } catch {
      // The service writes its discovery file and connects the renderer after the window starts loading.
    }
    if (!connected) await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (!connected) throw new Error("The built app's renderer and project service did not connect.")
  if (errors.length) throw new Error(errors.join("\n"))
  console.log("The production renderer and service started outside the checkout without a dev server.")
} finally {
  await electron?.close()
  if (installerMode) {
    const result = spawnSync(join(installed, "Uninstall Parity.exe"), ["/S", `_?=${installed}`], {
      windowsHide: true,
      windowsVerbatimArguments: true,
      stdio: "inherit"
    })
    if (result.status !== 0)
      uninstallError = new Error(`Uninstalling the test app failed: ${result.error?.message ?? result.status}`)
  }
  await rm(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
}
if (uninstallError) throw uninstallError
