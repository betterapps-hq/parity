import { createServer } from "node:net"
import { isText } from "@parity-app/core/values/evaluate"
import { endedByItself, lastLines, type Lifecycle } from "@parity-app/processes"
import type { ProjectProcess, ServerKind } from "../shared/protocol.ts"
import { track } from "../shared/tracing.ts"
import { spawnChild } from "./children.ts"
import { forgetProject, type ProcessEntry, type ProcessHandle, trackProcess } from "./processes.ts"

/**
 * The one place Parity starts, watches and stops the servers a project needs: Storybook now, and dev servers, `wrangler
 * dev` and test runners next. It keeps each server's port and what it printed, so a lens can find a server and show why
 * one failed, and it stops everything it started for a project when the project closes, and everything when the service
 * exits. A server that was already running is listed and its port known, but never stopped. Each server is started,
 * timed and stopped through the service's one child lifecycle (`children.ts`), which also ends it with the service.
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
  restart?: () => Promise<void>
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
  /** The end of what it printed. */
  log(): string
  /** Stops it and every process it started. Its exit then shows as stopped, not crashed. */
  stop(): void
}

interface Managed {
  entry: ServerEntry
  url: string
  port: number
  /** Its process, for one Parity started. */
  life?: Lifecycle
  /** Set once it's listed as failed to start, so the exit its stopping causes doesn't replace the reason. */
  failed?: boolean
}

const managed = new Map<string, Managed>()
const defaultStartTimeout = 180_000
const readyInterval = 750

/** Starts a server, lists it, and keeps its output, until it answers at its URL. */
export function startServer(spec: ServerSpec): ManagedServer {
  stopServer(spec.id)
  const port = portOf(spec.url)

  const life = spawnChild(spec.command, spec.args, { cwd: spec.cwd, env: spec.env ?? process.env })
  const item: Managed = { entry: spec, url: spec.url, port, life }
  managed.set(spec.id, item)
  const starting: ProcessEntry = { ...listing(spec), status: "starting", url: spec.url }

  if (life.pid) {
    starting.pid = life.pid
  }

  const tracking = trackProcess(starting, { stop: () => stopServer(spec.id), restart: spec.restart })

  const exited = watchExit(spec, item, life, tracking)
  const ready = waitUntilReady(spec, item, life, tracking)
  // A caller that drops `ready` still sees the failure in the processes list.
  ready.catch(() => undefined)

  return {
    id: spec.id,
    url: spec.url,
    port,
    pid: life.pid,
    ready,
    exited,
    log: () => life.tail(),
    stop: () => stopServer(spec.id)
  }
}

/** Settles once the server's process has ended, however it ended, and lists it as stopped or crashed. */
function watchExit(spec: ServerSpec, item: Managed, life: Lifecycle, tracking: ProcessHandle): Promise<string> {
  return life.exited.then((exit) => {
    if (managed.get(spec.id) === item) {
      managed.delete(spec.id)
    }

    if (exit.stopped) {
      tracking.set("stopped")
    } else if (!item.failed) {
      tracking.set("failed", { error: `Stopped by itself, with ${exit.how}` })
    }

    return exit.how
  })
}

async function waitUntilReady(
  spec: ServerSpec,
  item: Managed,
  life: Lifecycle,
  tracking: ProcessHandle
): Promise<string> {
  const timeout = spec.startTimeout ?? defaultStartTimeout
  const began = performance.now()

  const server = () => ({
    kind: spec.kind,
    name: spec.name,
    durationMs: Math.round((performance.now() - began) * 10) / 10
  })

  let timedOut = false
  let passed: () => void = () => undefined

  // Fails as the deadline passes, without waiting for the process to end.
  const late = new Promise<never>((_, reject) => {
    passed = () => {
      timedOut = true
      reject(new Error(`${spec.name} didn't start within ${timeout / 1000} seconds:\n${life.tail().trim()}`))
    }
  })

  late.catch(() => undefined)
  const cancel = life.deadline(timeout, passed)

  const ended = life.exited.then((exit) => {
    throw new Error(exit.stopped ? `${spec.name} was stopped before it started` : endedByItself(spec.name, exit))
  })

  ended.catch(() => undefined)

  const answering = (async () => {
    while (life.running && !life.stopping) {
      if (await spec.ready(spec.url).catch(() => false)) {
        return spec.url
      }

      await new Promise((resolve) => setTimeout(resolve, readyInterval))
    }

    // It ended, or was told to: `ended` or `late` says why.
    return new Promise<never>(() => undefined)
  })()

  try {
    const url = await Promise.race([answering, ended, late])
    cancel()
    tracking.set("running")
    track("server.started", server())

    return url
  } catch (error) {
    // One stopped from the list or by its project's closing hasn't failed.
    if (timedOut || !(await life.exited).stopped) {
      track("server.failed", { ...server(), reason: timedOut ? "timeout" : "exited", output: lastLines(life.tail()) })
      item.failed = true
      tracking.set("failed", { error: error instanceof Error ? error.message : String(error) })

      if (managed.get(spec.id) === item) {
        managed.delete(spec.id)
      }

      life.stop()
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
  managed.set(entry.id, { entry, url: entry.url, port: portOf(entry.url) })
  trackProcess({ ...listing(entry), status: "running", url: entry.url, startedBy: "elsewhere" })
}

/** Stops a server Parity started, or lets go of one it adopted. */
export function stopServer(id: string): void {
  const item = managed.get(id)

  if (!item) {
    return
  }

  managed.delete(id)
  item.life?.stop()
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
  return [...managed.values()].flatMap(({ entry, url, port, life }): KnownServer[] =>
    projectId === undefined || entry.projectId === projectId
      ? [
          {
            id: entry.id,
            kind: entry.kind,
            projectId: entry.projectId,
            url,
            port,
            pid: life?.pid,
            startedBy: life ? "parity" : "elsewhere"
          }
        ]
      : []
  )
}

/** What a server Parity started printed lately, or nothing for one it doesn't know or didn't start. */
export function serverLog(id: string): string {
  return managed.get(id)?.life?.tail() ?? ""
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
      const port = address && !isText(address) ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

function listing(entry: ServerEntry) {
  return {
    id: entry.id,
    kind: entry.kind,
    lifetime: "server",
    name: entry.name,
    projectId: entry.projectId,
    project: entry.project
  } as const
}

function portOf(url: string): number {
  const parsed = new URL(url)

  return Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80))
}
