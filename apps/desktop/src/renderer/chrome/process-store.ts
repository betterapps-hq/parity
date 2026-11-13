import { useEffect, useState, useSyncExternalStore } from "react"
import type { ProjectProcess } from "../../shared/protocol.ts"
import { errorMessage, reportError } from "../report-error.ts"
import { request } from "../service.ts"
import { resetWithWindow, windowStore } from "../store.ts"

/** How often the list is asked for: often while it's shown, now and then for the status bar. */
const shownInterval = 1000
const idleInterval = 4000

const processes = windowStore<ProjectProcess[]>(() => [])

/** How many views follow the list; it's asked for while any do. */
let listening = 0
let watching = 0
let timer: ReturnType<typeof setTimeout> | undefined

/**
 * Processes asked to stop or restart: shown as stopping or starting until the service reports a status other than the
 * one it had when asked.
 */
const pending = new Map<string, { status: ProjectProcess["status"]; was: ProjectProcess["status"] }>()

function poll(): void {
  clearTimeout(timer)
  request("processes.list", {}).then(
    (next) => {
      const updated = next.map((process) => {
        const asked = pending.get(process.id)

        if (!asked) {
          return process
        }

        if (process.status !== asked.was) {
          pending.delete(process.id)

          return process
        }

        return { ...process, status: asked.status }
      })

      for (const id of pending.keys()) {
        if (!next.some((process) => process.id === id)) {
          pending.delete(id)
        }
      }

      processes.set(updated)
      schedule()
    },
    () => schedule()
  )
}

function schedule(): void {
  if (listening > 0) {
    timer = setTimeout(poll, watching > 0 ? shownInterval : idleInterval)
  }
}

function subscribe(listener: () => void): () => void {
  const unsubscribe = processes.subscribe(listener)
  listening += 1

  if (listening === 1) {
    poll()
  }

  return () => {
    unsubscribe()
    listening -= 1

    if (listening === 0) {
      clearTimeout(timer)
    }
  }
}

/**
 * Every process running for the open projects and on this machine, kept current. While `shown`, it's asked for every
 * second, so new processes and status changes appear at once.
 */
export function useProcesses(shown: boolean): ProjectProcess[] {
  useEffect(() => {
    if (!shown) {
      return
    }

    watching += 1
    poll()

    return () => {
      watching -= 1
    }
  }, [shown])

  return useSyncExternalStore(subscribe, processes.get)
}

/** The time now, a second at a time while `ticking`, for uptimes. */
export function useNow(ticking: boolean): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!ticking) {
      return
    }

    const interval = setInterval(() => setNow(Date.now()), 1000)

    return () => clearInterval(interval)
  }, [ticking])

  return now
}

export async function stopProcess(process: ProjectProcess): Promise<void> {
  await act(process, "stopping", "processes.stop", `Couldn't stop ${process.name}`)
}

export async function restartProcess(process: ProjectProcess): Promise<void> {
  const task = process.lifetime === "task"
  await act(
    process,
    task ? "running" : "starting",
    "processes.restart",
    task ? `Couldn't run ${process.name} again` : `Couldn't start ${process.name} again`
  )
}

/** Finished tasks whose result has been seen in the flyout, each by its run, so the next run shows again. */
const seen = new Set<string>()

resetWithWindow(() => {
  pending.clear()
  seen.clear()
})

const runOf = (process: ProjectProcess) => `${process.id}@${process.stoppedAt ?? process.startedAt}`

/** Marks finished tasks' results as seen, so the status bar stops showing them. */
export function markSeen(processes: ProjectProcess[]): void {
  for (const process of processes) {
    seen.add(runOf(process))
  }
}

export function isSeen(process: ProjectProcess): boolean {
  return seen.has(runOf(process))
}

export async function dismissProcess(process: ProjectProcess): Promise<void> {
  processes.update((now) => now.filter((candidate) => candidate.id !== process.id))
  await request("processes.dismiss", { id: process.id }).catch(() => undefined)
}

async function act(
  process: ProjectProcess,
  status: ProjectProcess["status"],
  method: "processes.stop" | "processes.restart",
  failure: string
): Promise<void> {
  pending.set(process.id, { status, was: process.status })
  processes.update((now) =>
    now.map((candidate) => (candidate.id === process.id ? { ...candidate, status } : candidate))
  )

  try {
    await request(method, { id: process.id })
  } catch (error) {
    pending.delete(process.id)
    reportError(error, { operation: method, title: failure, description: errorMessage(error) })
  }

  poll()
}

/** How long something has run: "42s", "12m 04s", "2h 14m", "3d 4h". */
export function formatUptime(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))

  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.floor(seconds / 60)

  if (minutes < 60) {
    return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`
  }

  const hours = Math.floor(minutes / 60)

  if (hours < 24) {
    return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`
  }

  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}
