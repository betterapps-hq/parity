import type { Address } from "@parity-app/extension-api"
import type { ProcessStatus, ProjectProcess } from "../shared/protocol.ts"
import { track } from "../shared/tracing.ts"

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

/** Who hears that the list changed, as extensions' hosts do. */
const listeners = new Set<(projectId: string) => void>()

/** Calls `listener` with a project's id whenever its processes change, until the function it returns is called. */
export function onProcessesChanged(listener: (projectId: string) => void): () => void {
  listeners.add(listener)

  return () => listeners.delete(listener)
}

/** Tells the listeners a project's processes changed, once this turn of the event loop has made its changes. */
const pending = new Set<string>()

function changed(projectId: string): void {
  if (pending.has(projectId)) {
    return
  }

  pending.add(projectId)
  queueMicrotask(() => {
    pending.delete(projectId)

    for (const listener of listeners) {
      listener(projectId)
    }
  })
}

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
  changed(entry.projectId)

  return {
    get stopping() {
      return item.process.state === "stopping"
    },
    info: () => ({ ...item.process }),
    update(details) {
      if (tracked.get(entry.id) === item) {
        Object.assign(item.process, details)
        changed(entry.projectId)
      }
    },
    set(state, details = {}) {
      if (tracked.get(entry.id) !== item) {
        return
      }

      Object.assign(item.process, details)
      item.process.state = state
      changed(entry.projectId)

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
        setTimeout(() => {
          if (tracked.get(entry.id) === item) {
            tracked.delete(entry.id)
            changed(entry.projectId)
          }
        }, stoppedLinger)
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
  const item = tracked.get(id)

  if (item) {
    tracked.delete(id)
    changed(item.process.projectId)
  }
}

/** Takes every process of a project off the list, when it closes. */
export function forgetProject(projectId: string): void {
  for (const [id, { process }] of tracked) {
    if (process.projectId === projectId) {
      tracked.delete(id)
      lastOutcomes.delete(id)
    }
  }

  changed(projectId)
}

/** The processes listed for a project, or for every project, as they are now. */
export function trackedProcesses(projectId?: string): ProjectProcess[] {
  return [...tracked.values()].flatMap(({ process }) =>
    projectId === undefined || process.projectId === projectId ? [{ ...process }] : []
  )
}

/** What Parity runs for the open projects, each server with what the browser opens: its preferred address, else its endpoint. */
export function listProcesses(): Promise<ProjectProcess[]> {
  return Promise.resolve(
    trackedProcesses().map((process) => ({ ...process, opens: process.opens ?? process.endpoint?.url }))
  )
}

/** Sets the places a server is reached, from address providers, and which one the browser opens. */
export function setAddresses(id: string, addresses: Address[], opens: string | undefined): void {
  const item = tracked.get(id)

  if (!item) {
    return
  }

  item.process.addresses = addresses

  if (opens === undefined) {
    delete item.process.opens
  } else {
    item.process.opens = opens
  }

  changed(item.process.projectId)
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
    changed(item.process.projectId)
  }

  return Promise.resolve(undefined)
}
