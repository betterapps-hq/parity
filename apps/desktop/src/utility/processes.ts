import type { Address } from "@parity-app/extension-api"
import type { ProcessStatus, ProjectProcess } from "../shared/protocol.ts"
import { track } from "../shared/tracing.ts"
import { readPortless } from "./portless.ts"

/** What can be done to a process Parity started: a server stopped or restarted, a task canceled or run again. */
interface Controls {
  stop?(): void
  restart?(): Promise<void>
  /**
   * For one of Parity's own tasks that runs on every change, as the type check: it sends `processes.taskFinished` only
   * when its outcome differs from the last run's.
   */
  report?: "changes"
}

interface Tracked {
  process: ProjectProcess
  controls: Controls
}

/** What's known of a process as Parity starts it or picks it up again; the rest is filled in as it's listed. */
export type ProcessEntry = Pick<
  ProjectProcess,
  "id" | "owner" | "lifetime" | "name" | "state" | "projectId" | "project"
> &
  Partial<Pick<ProjectProcess, "pid" | "endpoint" | "detail" | "progress" | "icon" | "role" | "run">>

/** What a process reports as it runs, and as it ends. */
export type ProcessDetails = Partial<
  Pick<ProjectProcess, "pid" | "endpoint" | "error" | "detail" | "progress" | "summary" | "readyMatch">
>

/** What a process Parity started reports as it runs, and as it ends. */
export interface ProcessHandle {
  set(state: ProcessStatus, details?: ProcessDetails): void
  /** Changes what's shown of it without changing its state, as a task's progress. */
  update(details: ProcessDetails): void
  /** How it's listed now. */
  info(): ProjectProcess
  /** Whether it was asked to stop, so an exit that follows is taken for that rather than a failure. */
  readonly stopping: boolean
}

const tracked = new Map<string, Tracked>()

/** Each task's last outcome, for one that reports only changes. */
const lastOutcomes = new Map<string, ProcessStatus>()

/** How long a server stopped on purpose stays listed, so the list shows it stopped before it goes. */
const stoppedLinger = 8000

const ended = new Set<ProcessStatus>(["stopped", "failed", "passed", "canceled"])

/**
 * Lists a process Parity started, or picks up one it's tracking again, as when a server restarts or a task runs again:
 * its time starts over and it begins its next run. A task's id names the task for its project, as
 * `typecheck:<project>`, so each task shows its latest run: a new run replaces the last result, which otherwise stays
 * until it's dismissed or the project closes.
 */
export function trackProcess(entry: ProcessEntry, controls: Controls = {}): ProcessHandle {
  const existing = tracked.get(entry.id)

  const process: ProjectProcess = {
    addresses: [],
    ...existing?.process,
    ...entry,
    run: entry.run ?? (existing ? existing.process.run + 1 : 1),
    startedAt: Date.now(),
    canStop: !!controls.stop,
    canRestart: !!controls.restart
  }

  for (const key of ["stoppedAt", "error", "summary", "detail", "progress", "readyMatch", "endpoint", "pid"] as const) {
    if (!(key in entry)) {
      delete process[key]
    }
  }

  const item: Tracked = { process, controls }
  tracked.set(entry.id, item)

  return {
    get stopping() {
      return item.process.state === "stopping"
    },
    info: () => ({ ...item.process }),
    update(details) {
      if (tracked.get(entry.id) === item) {
        Object.assign(item.process, details)
      }
    },
    set(state, details = {}) {
      if (tracked.get(entry.id) !== item) {
        return
      }

      Object.assign(item.process, details)
      item.process.state = state

      if (!ended.has(state)) {
        return
      }

      item.process.stoppedAt = Date.now()
      item.process.canStop = false
      delete item.process.progress

      if (item.process.lifetime === "task") {
        delete item.process.detail
        reportTask(item)
      }

      if (state === "stopped") {
        setTimeout(() => tracked.get(entry.id) === item && tracked.delete(entry.id), stoppedLinger)
      }
    }
  }
}

/** Sends `processes.taskFinished` for one of Parity's own tasks that reports its outcome when it changes. */
function reportTask({ process, controls }: Tracked): void {
  if (controls.report !== "changes" || process.owner.kind !== "parity") {
    return
  }

  let outcome: "passed" | "failed" | "canceled" = "failed"

  if (process.state === "passed" || process.state === "canceled") {
    outcome = process.state
  }

  if (lastOutcomes.get(process.id) === outcome) {
    return
  }

  lastOutcomes.set(process.id, outcome)
  track("processes.taskFinished", {
    lifetime: "task",
    name: process.name,
    owner: "parity",
    role: process.owner.role,
    runKind: "parity",
    command: process.owner.role,
    durationMs: Math.max(0, (process.stoppedAt ?? Date.now()) - process.startedAt),
    outcome,
    how: outcome === "canceled" ? "stopped" : "exited",
    reported: process.summary !== undefined
  })
}

/** Takes a process off the list, as when its project closes. */
export function forgetProcess(id: string): void {
  tracked.delete(id)
}

/** Takes every process of a project off the list, when it closes. */
export function forgetProject(projectId: string): void {
  for (const [id, { process }] of tracked) {
    if (process.projectId === projectId) {
      tracked.delete(id)
      lastOutcomes.delete(id)
    }
  }
}

/** The processes listed for a project, or for every project, as they are now. */
export function trackedProcesses(projectId?: string): ProjectProcess[] {
  return [...tracked.values()].flatMap(({ process }) =>
    projectId === undefined || process.projectId === projectId ? [{ ...process }] : []
  )
}

/**
 * What Parity runs for the open projects, each server with the Portless name that routes to its port as its address
 * and what the browser opens.
 */
export async function listProcesses(): Promise<ProjectProcess[]> {
  const portless = await readPortless()

  return trackedProcesses().map((process) => {
    const route = process.endpoint && portless.routes.find((candidate) => candidate.port === process.endpoint?.port)

    if (!route) {
      return { ...process, opens: process.opens ?? process.endpoint?.url }
    }

    const named: Address = {
      url: portless.address(route.hostname),
      label: route.hostname,
      kind: "name",
      public: false,
      provider: "parity"
    }

    return { ...process, addresses: [named, ...process.addresses], opens: named.url }
  })
}

export function stopProcess({ id }: { id: string }): Promise<undefined> {
  const item = tracked.get(id)

  if (!item?.controls.stop) {
    return Promise.reject(new Error("That process can't be stopped from here"))
  }

  if (item.process.lifetime === "task") {
    item.process.state = "stopping"
  }

  item.controls.stop()

  return Promise.resolve(undefined)
}

export async function restartProcess({ id }: { id: string }): Promise<undefined> {
  const item = tracked.get(id)

  if (!item?.controls.restart) {
    throw new Error("That process can't be restarted from here")
  }

  await item.controls.restart()

  return undefined
}

export function dismissProcess({ id }: { id: string }): Promise<undefined> {
  const item = tracked.get(id)

  if (item && ended.has(item.process.state)) {
    tracked.delete(id)
  }

  return Promise.resolve(undefined)
}
