import { type ChildProcess, spawn, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { createServer } from "node:net"
import { dirname, join } from "node:path"
import type { ServiceMethods } from "../shared/protocol.ts"
import { getProject } from "./projects.ts"

interface Running {
  url: string
  /** Set when Parity started it; a Storybook that was already running is left alone. */
  child?: ChildProcess
  ready: Promise<string>
}

interface IndexEntry {
  id: string
  type: "story" | "docs"
  importPath: string
}

const running = new Map<string, Running>()
const startTimeout = 180_000

/**
 * Opens a component's stories: its docs page when it has one, else its first story. Starts the project's Storybook
 * first when it isn't running, which can take a while the first time. Without a component, Storybook's home.
 */
export async function openStorybook({
  projectId,
  component
}: ServiceMethods["storybook.open"]["params"]): Promise<ServiceMethods["storybook.open"]["result"]> {
  const { info } = getProject(projectId)
  const storybook = info.storybook
  if (!storybook) throw new Error(`${info.name} has no Storybook`)
  const files = component ? (storybook.stories[component] ?? []) : []
  if (component && files.length === 0) throw new Error(`${component} has no stories`)
  // A Storybook that stopped since it was last used, closed by hand or crashed, is started again.
  let base = await ensureStorybook(projectId)
  let entries = await storyIndex(base).catch(() => undefined)
  if (!entries) {
    stopStorybook(projectId)
    base = await ensureStorybook(projectId)
    entries = await storyIndex(base)
  }
  if (!component) return { url: base }
  const mine = entries.filter((entry) => files.some((file) => sameFile(entry.importPath, file.path)))
  const target = mine.find((entry) => entry.type === "docs") ?? mine.find((entry) => entry.type === "story")
  return { url: target ? `${base}/?path=/${target.type}/${target.id}` : base }
}

/** Stops the Storybook Parity started for a project, when the project closes. */
export function stopStorybook(projectId: string): void {
  const entry = running.get(projectId)
  running.delete(projectId)
  if (entry?.child?.pid) killTree(entry.child.pid)
}

process.on("exit", () => {
  for (const projectId of running.keys()) stopStorybook(projectId)
})

function ensureStorybook(projectId: string): Promise<string> {
  const existing = running.get(projectId)
  if (existing) return existing.ready
  const entry: Running = { url: "", ready: Promise.resolve("") }
  entry.ready = start(projectId, entry).catch((error: unknown) => {
    running.delete(projectId)
    throw error
  })
  running.set(projectId, entry)
  return entry.ready
}

async function start(projectId: string, entry: Running): Promise<string> {
  const { info } = getProject(projectId)
  const storybook = info.storybook!
  const wanted = storybook.port ?? 6006
  // A Storybook already serving this project on its usual port is used as it is.
  const already = `http://localhost:${wanted}`
  const served = await storyIndex(already).catch(() => undefined)
  const storyPaths = Object.values(storybook.stories).flatMap((files) => files.map((file) => file.path))
  if (
    served &&
    (storyPaths.length === 0 || served.some((item) => storyPaths.some((path) => sameFile(item.importPath, path))))
  ) {
    entry.url = already
    return already
  }

  const port = (await portFree(wanted)) ? wanted : await freePort()
  const url = `http://localhost:${port}`
  const require = createRequire(join(info.root, "package.json"))
  let manifestPath: string
  try {
    manifestPath = require.resolve("storybook/package.json")
  } catch {
    throw new Error("Storybook isn't installed in the project. Install its dependencies first.")
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { bin?: string | Record<string, string> }
  const bin =
    typeof manifest.bin === "string" ? manifest.bin : (manifest.bin?.storybook ?? Object.values(manifest.bin ?? {})[0])
  if (!bin) throw new Error("Storybook's command line couldn't be found")

  // Electron runs as plain Node here, with the project's own Storybook, in the project's folder.
  const child = spawn(
    process.execPath,
    [
      join(dirname(manifestPath), bin),
      "dev",
      "--port",
      String(port),
      "--no-open",
      "--ci",
      "--config-dir",
      storybook.configDir
    ],
    {
      cwd: info.root,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", BROWSER: "none" },
      stdio: ["ignore", "pipe", "pipe"]
    }
  )
  entry.child = child
  entry.url = url
  let log = ""
  const keep = (chunk: Buffer) => {
    log = (log + chunk.toString()).slice(-4000)
  }
  child.stdout?.on("data", keep)
  child.stderr?.on("data", keep)
  console.log(`[service] starting Storybook for ${info.name} at ${url}`)

  const exited = new Promise<never>((_, reject) => {
    child.on("exit", (code) => {
      if (running.get(projectId) === entry) running.delete(projectId)
      reject(new Error(`Storybook stopped (exit code ${code}):\n${log.slice(-1500)}`))
    })
    child.on("error", reject)
  })
  const ready = (async () => {
    const deadline = Date.now() + startTimeout
    while (Date.now() < deadline) {
      if (
        await storyIndex(url).then(
          () => true,
          () => false
        )
      )
        return url
      await new Promise((resolve) => setTimeout(resolve, 750))
    }
    throw new Error(`Storybook didn't start within ${startTimeout / 1000} seconds:\n${log.slice(-1500)}`)
  })()
  try {
    return await Promise.race([ready, exited])
  } catch (error) {
    if (child.pid) killTree(child.pid)
    throw error
  }
}

async function storyIndex(base: string): Promise<IndexEntry[]> {
  const response = await fetch(`${base}/index.json`, { signal: AbortSignal.timeout(3000) })
  if (!response.ok) throw new Error(`Storybook answered ${response.status}`)
  const body = (await response.json()) as { entries?: Record<string, IndexEntry> }
  return Object.values(body.entries ?? {})
}

/** Storybook's import paths start with `./`; Parity's are plain, relative to the root. */
function sameFile(importPath: string, path: string): boolean {
  return importPath.replace(/^\.\//, "") === path.replace(/^\.\//, "")
}

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once("error", () => resolve(false))
    server.listen(port, () => server.close(() => resolve(true)))
  })
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

/** Storybook starts its own processes; they all stop together. */
function killTree(pid: number): void {
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" })
  else {
    try {
      process.kill(pid)
    } catch {
      // Already gone.
    }
  }
}
