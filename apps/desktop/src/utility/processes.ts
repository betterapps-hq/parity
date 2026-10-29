import { spawnSync } from "node:child_process"
import type { ProcessStatus, ProjectProcess } from "../shared/protocol.ts"
import { readPortless } from "./portless.ts"

/** What can be done to a process Parity started: a server stopped or restarted, a task canceled or run again. */
interface Controls {
  stop?(): void
  restart?(): Promise<unknown>
}

interface Tracked {
  process: ProjectProcess
  controls: Controls
}

/** What a process Parity started reports as it runs, and as it ends. */
export interface ProcessHandle {
  set(
    status: ProcessStatus,
    details?: Partial<Pick<ProjectProcess, "pid" | "url" | "error" | "detail" | "progress" | "summary">>
  ): void
  /** Whether it was asked to stop, so an exit that follows is taken for that rather than a failure. */
  readonly stopping: boolean
}

const tracked = new Map<string, Tracked>()
/** How long a server stopped on purpose stays listed, so the list shows it stopped before it goes. */
const stoppedLinger = 8000

const ended = new Set<ProcessStatus>(["stopped", "failed", "passed", "canceled"])

/**
 * Lists a process Parity started, or picks up one it's tracking again, as when a server restarts or a task runs again:
 * its time starts over. A task's id names the task for its project, as `typecheck:<project>`, so each task shows its
 * latest run: a new run replaces the last result, which otherwise stays until it's dismissed or the project closes.
 */
export function trackProcess(
  entry: Pick<ProjectProcess, "id" | "kind" | "shape" | "name" | "status" | "projectId" | "project"> &
    Partial<Pick<ProjectProcess, "pid" | "url" | "startedBy" | "detail" | "progress">>,
  controls: Controls = {}
): ProcessHandle {
  const existing = tracked.get(entry.id)
  const process: ProjectProcess = {
    startedBy: "parity",
    ...existing?.process,
    ...entry,
    startedAt: Date.now(),
    canStop: !!controls.stop,
    canRestart: !!controls.restart
  }
  for (const key of ["stoppedAt", "error", "summary", "detail", "progress"] as const) {
    if (!(key in entry)) delete process[key]
  }
  const item: Tracked = { process, controls }
  tracked.set(entry.id, item)
  return {
    get stopping() {
      return item.process.status === "stopping"
    },
    set(status, details = {}) {
      if (tracked.get(entry.id) !== item) return
      Object.assign(item.process, details)
      item.process.status = status
      if (!ended.has(status)) return
      item.process.stoppedAt = Date.now()
      item.process.canStop = false
      delete item.process.progress
      if (item.process.shape === "task") delete item.process.detail
      if (status === "stopped") {
        setTimeout(() => tracked.get(entry.id) === item && tracked.delete(entry.id), stoppedLinger)
      }
    }
  }
}

/** Takes a process off the list, as when its project closes. */
export function forgetProcess(id: string): void {
  tracked.delete(id)
}

/** Takes every process of a project off the list, when it closes. */
export function forgetProject(projectId: string): void {
  for (const [id, { process }] of tracked) if (process.projectId === projectId) tracked.delete(id)
}

/** What Parity runs for the open projects, each named by its Portless route when Portless routes to its port. */
export async function listProcesses(): Promise<ProjectProcess[]> {
  const portless = await readPortless()
  return [...tracked.values()].map(({ process }) => {
    const port = process.url ? Number(new URL(process.url).port) : undefined
    const route = portless.routes.find((candidate) => candidate.port === port)
    return route ? { ...process, domain: portless.address(route.hostname) } : { ...process }
  })
}

export function stopProcess({ id }: { id: string }): Promise<undefined> {
  const item = tracked.get(id)
  if (!item?.controls.stop) return Promise.reject(new Error("That process can't be stopped from here"))
  if (item.process.shape === "task") item.process.status = "stopping"
  item.controls.stop()
  return Promise.resolve(undefined)
}

export async function restartProcess({ id }: { id: string }): Promise<undefined> {
  const item = tracked.get(id)
  if (!item?.controls.restart) throw new Error("That process can't be restarted from here")
  await item.controls.restart()
  return undefined
}

export function dismissProcess({ id }: { id: string }): Promise<undefined> {
  const item = tracked.get(id)
  if (item && ended.has(item.process.status)) tracked.delete(id)
  return Promise.resolve(undefined)
}

/** Stops a process and every process it started, as a dev server's own workers. */
export function killTree(pid: number): void {
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" })
  else {
    try {
      process.kill(pid)
    } catch {
      // Already gone.
    }
  }
}
