import { type ChildProcess, spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { createServer } from "node:net"
import { dirname, join } from "node:path"
import type { ServiceMethods } from "../shared/protocol.ts"
import { findRoutedServer, readPortless } from "./portless.ts"
import { forgetProcess, killTree, trackProcess } from "./processes.ts"
import { getProject, message } from "./projects.ts"

interface Running {
  /** Where Parity reaches it, on this machine. */
  url: string
  /** Set when Parity started it; a Storybook that was already running is left alone. */
  child?: ChildProcess
  ready: Promise<Served>
  /** Set once Parity asked it to stop, so its exit isn't taken for a crash. */
  stopping?: boolean
}

/** A running Storybook: where Parity reaches it, and where the browser opens it, by its Portless name when it has one. */
interface Served {
  url: string
  address: string
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
  let served = await ensureStorybook(projectId)
  let entries = await storyIndex(served.url).catch(() => undefined)
  if (!entries) {
    stopStorybook(projectId)
    served = await ensureStorybook(projectId)
    entries = await storyIndex(served.url)
  }
  const { address } = served
  if (!component) return { url: address }
  const mine = entries.filter((entry) => files.some((file) => sameFile(entry.importPath, file.path)))
  const target = mine.find((entry) => entry.type === "docs") ?? mine.find((entry) => entry.type === "story")
  return { url: target ? `${address}/?path=/${target.type}/${target.id}` : address }
}

/** Stops the Storybook Parity started for a project, when the project closes. */
export function stopStorybook(projectId: string): void {
  const entry = running.get(projectId)
  running.delete(projectId)
  if (entry) entry.stopping = true
  if (entry?.child?.pid) killTree(entry.child.pid)
  else forgetProcess(processId(projectId))
}

/** Starts a project's Storybook again, as from the status bar's processes. */
async function restartStorybook(projectId: string): Promise<void> {
  stopStorybook(projectId)
  await ensureStorybook(projectId)
}

function processId(projectId: string): string {
  return `storybook:${projectId}`
}

process.on("exit", () => {
  for (const projectId of running.keys()) stopStorybook(projectId)
})

function ensureStorybook(projectId: string): Promise<Served> {
  const existing = running.get(projectId)
  if (existing) return existing.ready
  const entry: Running = { url: "", ready: Promise.resolve({ url: "", address: "" }) }
  entry.ready = start(projectId, entry).catch((error: unknown) => {
    running.delete(projectId)
    throw error
  })
  running.set(projectId, entry)
  return entry.ready
}

async function start(projectId: string, entry: Running): Promise<Served> {
  const { info } = getProject(projectId)
  const storybook = info.storybook!
  const storyPaths = Object.values(storybook.stories).flatMap((files) => files.map((file) => file.path))
  /** Whether a Storybook answers at `base` with this project's stories. With none to check, any Storybook does. */
  const servesProject = (base: string) =>
    storyIndex(base).then(
      (served) =>
        storyPaths.length === 0 || served.some((item) => storyPaths.some((path) => sameFile(item.importPath, path))),
      () => false
    )

  // A Storybook already serving this project is used as it is: one Portless routes to, which opens at its name, or else
  // one on its usual port. Without stories to check, a routed Storybook could be any project's.
  const usual = `http://localhost:${storybook.port ?? 6006}`
  const routed =
    storyPaths.length > 0
      ? await findRoutedServer(await readPortless(), servesProject, (base) => servesFrom(base, info.root))
      : undefined
  const existing = routed ?? ((await servesProject(usual)) ? { url: usual, address: usual } : undefined)
  if (existing) {
    entry.url = existing.url
    trackProcess({
      id: processId(projectId),
      kind: "storybook",
      shape: "server",
      name: "Storybook",
      projectId,
      project: info.name,
      url: existing.url,
      status: "running",
      startedBy: "elsewhere"
    })
    return existing
  }

  const wanted = storybook.port ?? 6006
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
  return launch(
    projectId,
    entry,
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
    url
  )
}

/** Starts Storybook from a command line run by Parity's own Node in the project's folder, and waits until it answers. */
async function launch(projectId: string, entry: Running, args: string[], url: string): Promise<Served> {
  const { info } = getProject(projectId)
  // Electron runs as plain Node here.
  const child = spawn(process.execPath, args, {
    cwd: info.root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"]
  })
  entry.child = child
  entry.url = url
  const tracking = trackProcess(
    {
      id: processId(projectId),
      kind: "storybook",
      shape: "server",
      name: "Storybook",
      projectId,
      project: info.name,
      status: "starting",
      url
    },
    { stop: () => stopStorybook(projectId), restart: () => restartStorybook(projectId) }
  )
  tracking.set("starting", child.pid ? { pid: child.pid } : {})
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
      if (entry.stopping) tracking.set("stopped")
      else tracking.set("failed", { error: `Stopped by itself, with exit code ${code}` })
      reject(new Error(`Storybook stopped (exit code ${code}):\n${log.slice(-1500)}`))
    })
    child.on("error", reject)
  })
  const ready = (async () => {
    const deadline = Date.now() + startTimeout
    while (Date.now() < deadline && child.exitCode === null) {
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
    await Promise.race([ready, exited])
    tracking.set("running")
    return { url, address: url }
  } catch (error) {
    if (!entry.stopping) tracking.set("failed", { error: message(error) })
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

/**
 * Whether a Storybook serves files from the project's folder, to tell its checkout's from a worktree's that serves the
 * same stories. Vite, which builds most Storybooks Parity opens, serves only the folders it allows and answers Forbidden
 * for the rest; with another builder, it can't tell.
 */
function servesFrom(base: string, root: string): Promise<boolean> {
  const file = `${root.replaceAll("\\", "/").replace(/^\//, "")}/package.json`
  return fetch(`${base}/@fs/${file}`, { signal: AbortSignal.timeout(5000) }).then(
    (response) => response.ok,
    () => false
  )
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

/** A port nothing listens on now, as the system hands one out. */
export function freePort(): Promise<number> {
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
