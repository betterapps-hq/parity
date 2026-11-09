import { type ChildProcess, spawn } from "node:child_process"
import { createServer } from "node:net"
import type { ProjectProcess, ServerKind } from "../shared/protocol.ts"
import { track } from "../shared/tracing.ts"
import { forgetProject, killTree, type ProcessHandle, trackProcess } from "./processes.ts"

/**
 * The one place Parity starts, watches and stops the servers a project needs: Storybook now, and dev servers, `wrangler
 * dev` and test runners next. It keeps each server's port and what it printed, so a lens can find a server and show why
 * one failed, and it stops everything it started for a project when the project closes, and everything when Parity
 * quits. A server that was already running is listed and its port known, but never stopped.
 */

/** Who a server runs for, and how it's listed. */
interface ServerEntry {
  /** One per server and project, as `storybook:<project>`: starting it again replaces the last one. */
  id: string
  kind: ServerKind
  name: string
  projectId: string
  project: string
}

export interface ServerSpec extends ServerEntry {
  command: string
  args: string[]
  cwd: string
  env?: NodeJS.ProcessEnv
  /** Where it answers once it's up, on this machine. */
  url: string
  /** Whether it answers at `url` yet. Asked until it does, the server exits, or `startTimeout` passes. */
  ready(url: string): Promise<boolean>
  /** How long it may take to answer, in milliseconds. Three minutes unless said. */
  startTimeout?: number
  /** Starts it again, as from the status bar's processes. Without it, it can only be stopped. */
  restart?: () => Promise<unknown>
}

/** A server Parity started. */
export interface ManagedServer {
  id: string
  url: string
  port: number
  pid?: number
  /** Settles once it answers, with its URL, or rejects with the end of what it printed when it can't start. */
  ready: Promise<string>
  /** Settles once its process has ended, stopped or crashed, saying how: `exit code 1`, or `signal SIGTERM`. */
  exited: Promise<string>
  /** What it printed lately, oldest first. */
  log(): string
  /** Stops it and every process it started. Its exit then shows as stopped, not crashed. */
  stop(): void
}

interface Managed {
  entry: ServerEntry
  url: string
  port: number
  child?: ChildProcess
  output: string[]
  outputLength: number
  stopping: boolean
  /** Set once it's listed as failed to start, so the exit its stopping causes doesn't replace the reason. */
  failed?: boolean
}

const managed = new Map<string, Managed>()
const defaultStartTimeout = 180_000
const readyInterval = 750

/** How much of what a server printed is kept, in characters. */
const logLimit = 16_000

/** Starts a server, lists it, and keeps its output, until it answers at its URL. */
export function startServer(spec: ServerSpec): ManagedServer {
  stopServer(spec.id)
  const port = portOf(spec.url)

  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: spec.env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  })

  const item: Managed = { entry: spec, url: spec.url, port, child, output: [], outputLength: 0, stopping: false }
  managed.set(spec.id, item)
  const keep = (chunk: Buffer) => append(item, chunk.toString())
  child.stdout?.on("data", keep)
  child.stderr?.on("data", keep)

  const tracking = trackProcess(
    { ...listing(spec), status: "starting", url: spec.url, ...(child.pid ? { pid: child.pid } : {}) },
    { stop: () => stopServer(spec.id), ...(spec.restart ? { restart: spec.restart } : {}) }
  )

  const exited = watchExit(spec, item, tracking)
  const ready = waitUntilReady(spec, item, tracking, exited)
  // A caller that drops `ready` still sees the failure in the processes list.
  ready.catch(() => undefined)

  return {
    id: spec.id,
    url: spec.url,
    port,
    ...(child.pid ? { pid: child.pid } : {}),
    ready,
    exited,
    log: () => item.output.join(""),
    stop: () => stopServer(spec.id)
  }
}

/** Settles once the server's process has ended, however it ended, and lists it as stopped or crashed. */
function watchExit(spec: ServerSpec, item: Managed, tracking: ProcessHandle): Promise<string> {
  const child = item.child!

  return new Promise((resolve) => {
    const end = (how: string) => {
      if (managed.get(spec.id) === item) {
        managed.delete(spec.id)
      }

      if (item.stopping) {
        tracking.set("stopped")
      } else if (!item.failed) {
        tracking.set("failed", { error: `Stopped by itself, with ${how}` })
      }

      resolve(how)
    }

    child.on("exit", (code, signal) => end(code === null ? `signal ${signal}` : `exit code ${code}`))
    // A command that can't run at all, as one that isn't installed, never starts, so it never exits.
    child.on("error", (error) => {
      if (child.pid === undefined) {
        end(error.message)
      }
    })
  })
}

async function waitUntilReady(
  spec: ServerSpec,
  item: Managed,
  tracking: ProcessHandle,
  ended: Promise<string>
): Promise<string> {
  const { child } = item
  const timeout = spec.startTimeout ?? defaultStartTimeout
  const began = performance.now()

  const server = () => ({
    kind: spec.kind,
    name: spec.name,
    durationMs: Math.round((performance.now() - began) * 10) / 10
  })

  let stoppedFirst = false

  const exited = ended.then((how) => {
    stoppedFirst = true
    throw new Error(`${spec.name} stopped (${how}):\n${tail(item)}`)
  })

  exited.catch(() => undefined)

  const answering = (async () => {
    const deadline = Date.now() + timeout

    while (Date.now() < deadline && child!.exitCode === null && !item.stopping) {
      if (await spec.ready(spec.url).catch(() => false)) {
        return spec.url
      }

      await new Promise((resolve) => setTimeout(resolve, readyInterval))
    }

    if (item.stopping) {
      throw new Error(`${spec.name} was stopped before it started`)
    }

    throw new Error(`${spec.name} didn't start within ${timeout / 1000} seconds:\n${tail(item)}`)
  })()

  try {
    const url = await Promise.race([answering, exited])
    tracking.set("running")
    track("server.started", server())

    return url
  } catch (error) {
    if (!item.stopping) {
      track("server.failed", {
        ...server(),
        reason: stoppedFirst ? "exited" : "timeout",
        output: item.output.join("").trimEnd().split(/\r?\n/).slice(-50).join("\n")
      })
      item.failed = true
      tracking.set("failed", { error: error instanceof Error ? error.message : String(error) })

      if (managed.get(spec.id) === item) {
        managed.delete(spec.id)
      }

      if (child!.pid && child!.exitCode === null) {
        killTree(child!.pid)
      }
    }

    throw error
  }
}

/**
 * Lists a server Parity uses but didn't start, as a Storybook already running on its usual port, so its port is known
 * and the status bar shows it. Closing the project only takes it off the list.
 */
export function adoptServer(entry: ServerEntry & { url: string }): void {
  stopServer(entry.id)
  managed.set(entry.id, {
    entry,
    url: entry.url,
    port: portOf(entry.url),
    output: [],
    outputLength: 0,
    stopping: false
  })
  trackProcess({ ...listing(entry), status: "running", url: entry.url, startedBy: "elsewhere" })
}

/** Stops a server Parity started, or lets go of one it adopted. */
export function stopServer(id: string): void {
  const item = managed.get(id)

  if (!item) {
    return
  }

  managed.delete(id)
  item.stopping = true

  if (item.child?.pid && item.child.exitCode === null) {
    killTree(item.child.pid)
  }
}

/** A server the manager knows, started or adopted: where it answers and who started it. */
export interface KnownServer {
  id: string
  kind: ServerKind
  projectId: string
  url: string
  port: number
  pid?: number
  startedBy: ProjectProcess["startedBy"]
}

/** The servers the manager knows, for one project or all, as a lens or a reuse check looks for one. */
export function knownServers(projectId?: string): KnownServer[] {
  return [...managed.values()]
    .filter(({ entry }) => projectId === undefined || entry.projectId === projectId)
    .map(({ entry, url, port, child }) => ({
      id: entry.id,
      kind: entry.kind,
      projectId: entry.projectId,
      url,
      port,
      ...(child?.pid ? { pid: child.pid } : {}),
      startedBy: child ? "parity" : "elsewhere"
    }))
}

/** What a server Parity started printed lately, or nothing for one it doesn't know or didn't start. */
export function serverLog(id: string): string {
  return managed.get(id)?.output.join("") ?? ""
}

/** Stops everything Parity started for a project and takes the project's processes off the list, when it closes. */
export function stopProject(projectId: string): void {
  for (const [id, { entry }] of managed) {
    if (entry.projectId === projectId) {
      stopServer(id)
    }
  }

  forgetProject(projectId)
}

process.on("exit", () => {
  for (const id of managed.keys()) {
    stopServer(id)
  }
})

/** The port it asks for when that one's free, else one the system hands out. */
export async function choosePort(wanted: number): Promise<number> {
  return (await portFree(wanted)) ? wanted : freePort()
}

/** Whether nothing listens on a port now. */
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

function listing(entry: ServerEntry) {
  return {
    id: entry.id,
    kind: entry.kind,
    shape: "server",
    name: entry.name,
    projectId: entry.projectId,
    project: entry.project
  } as const
}

function portOf(url: string): number {
  const parsed = new URL(url)

  return Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80))
}

function append(item: Managed, text: string): void {
  item.output.push(text)
  item.outputLength += text.length

  while (item.outputLength > logLimit && item.output.length > 1) {
    item.outputLength -= item.output.shift()!.length
  }

  if (item.outputLength > logLimit) {
    item.output[0] = item.output[0]!.slice(item.outputLength - logLimit)
    item.outputLength = logLimit
  }
}

function tail(item: Managed): string {
  return item.output.join("").slice(-1500)
}
