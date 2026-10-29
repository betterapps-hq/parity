import { useEffect, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import type { ProjectProcess } from "../../shared/protocol.ts"

/** How often the list is asked for: often while it's shown, now and then for the status bar. */
const shownInterval = 1000
const idleInterval = 4000

let processes: ProjectProcess[] = []
const listeners = new Set<() => void>()
let watching = 0
let timer: ReturnType<typeof setTimeout> | undefined
/**
 * Processes asked to stop or restart: shown as stopping or starting until the service reports a status other than the
 * one it had when asked.
 */
const pending = new Map<string, { status: ProjectProcess["status"]; was: ProjectProcess["status"] }>()

function poll(): void {
  clearTimeout(timer)
  window.canvasHost.request("processes.list", {}).then(
    (next) => {
      processes = next.map((process) => {
        const asked = pending.get(process.id)
        if (!asked) return process
        if (process.status !== asked.was) {
          pending.delete(process.id)
          return process
        }
        return { ...process, status: asked.status }
      })
      for (const id of pending.keys()) if (!next.some((process) => process.id === id)) pending.delete(id)
      notify()
      schedule()
    },
    () => schedule()
  )
}

function schedule(): void {
  if (listeners.size > 0) timer = setTimeout(poll, watching > 0 ? shownInterval : idleInterval)
}

function notify(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) poll()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) clearTimeout(timer)
  }
}

/**
 * Every process running for the open projects and on this machine, kept current. While `shown`, it's asked for every
 * second, so new processes and status changes appear at once.
 */
export function useProcesses(shown: boolean): ProjectProcess[] {
  useEffect(() => {
    if (!shown) return
    watching += 1
    poll()
    return () => {
      watching -= 1
    }
  }, [shown])
  return useSyncExternalStore(subscribe, () => processes)
}

/** The time now, a second at a time while `ticking`, for uptimes. */
export function useNow(ticking: boolean): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!ticking) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [ticking])
  return now
}

export async function stopProcess(process: ProjectProcess): Promise<void> {
  await act(process, "stopping", "processes.stop", `Couldn't stop ${process.name}`)
}

export async function restartProcess(process: ProjectProcess): Promise<void> {
  const task = process.shape === "task"
  await act(
    process,
    task ? "running" : "starting",
    "processes.restart",
    task ? `Couldn't run ${process.name} again` : `Couldn't start ${process.name} again`
  )
}

/** Finished tasks whose result has been seen in the flyout, each by its run, so the next run shows again. */
const seen = new Set<string>()

const runOf = (process: ProjectProcess) => `${process.id}@${process.stoppedAt ?? process.startedAt}`

/** Marks finished tasks' results as seen, so the status bar stops showing them. */
export function markSeen(processes: ProjectProcess[]): void {
  for (const process of processes) seen.add(runOf(process))
}

export function isSeen(process: ProjectProcess): boolean {
  return seen.has(runOf(process))
}

export async function dismissProcess(process: ProjectProcess): Promise<void> {
  processes = processes.filter((candidate) => candidate.id !== process.id)
  notify()
  await window.canvasHost.request("processes.dismiss", { id: process.id }).catch(() => undefined)
}

async function act(
  process: ProjectProcess,
  status: ProjectProcess["status"],
  method: "processes.stop" | "processes.restart",
  failure: string
): Promise<void> {
  pending.set(process.id, { status, was: process.status })
  processes = processes.map((candidate) => (candidate.id === process.id ? { ...candidate, status } : candidate))
  notify()
  try {
    await window.canvasHost.request(method, { id: process.id })
  } catch (error) {
    pending.delete(process.id)
    toast.error(failure, { description: error instanceof Error ? error.message : String(error) })
  }
  poll()
}

/** How long something has run: "42s", "12m 04s", "2h 14m", "3d 4h". */
export function formatUptime(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}
