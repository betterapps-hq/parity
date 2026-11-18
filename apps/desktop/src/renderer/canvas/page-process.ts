import { projectHost } from "@parity-app/editor"
import { noFailures, type ProcessFailures, processFailed, processOpen } from "@parity-app/frames"
import { track } from "../report-error.ts"
import { resetWithWindow, windowStore } from "../store.ts"

/*
 * Each project's page process in this window (docs/proposals/route-frames.md, "When the page process fails", PAR-1300).
 * A project's live frame, spares and freezer share one renderer process, so its failure is one record here, however
 * it's heard: main seeing the process go, the freezer's channel closing, or a request past its deadline. Once it's
 * failed, every frame of the project closes, and none opens again until the pause is over: 1 s, then 5 s, then 30 s.
 * After three failures in two minutes Parity stops opening them, and boards keep their copies and pictures.
 */

/** What a project's frames do when its page process fails, and when they may open again. */
export interface PageProcessListener {
  /** The process went or hung: the project's frames close. */
  gone: () => void
  /** The pause is over: frames may open again. */
  resumed: () => void
}

/** Each project's failures, by project. */
const failures = windowStore<ReadonlyMap<string, ProcessFailures>>(() => new Map())

const listeners = new Map<string, Set<PageProcessListener>>()
const timers = new Map<string, number>()
let unhear: (() => void) | undefined

resetWithWindow(() => {
  for (const timer of timers.values()) {
    window.clearTimeout(timer)
  }

  timers.clear()
  listeners.clear()
  unhear?.()
  unhear = undefined
})

/** Whether a project may open frames now: its page process hasn't failed, or its pause is over. */
export function pageProcessOpen(project: string): boolean {
  return processOpen(failures.get().get(project) ?? noFailures, Date.now())
}

/**
 * A project's page process went or stopped answering. Told once per failure, however many frames report it: its frames
 * close, and open again after the pause, unless Parity stopped trying.
 */
export function pageProcessFailed(project: string, how: "gone" | "hung"): void {
  const failed = processFailed(failures.get().get(project) ?? noFailures, Date.now())

  if (!failed) {
    return
  }

  failures.set(new Map(failures.get()).set(project, failed.state))
  track("routeFrame.process", { how, stopped: failed.restart === "stop" })

  for (const listener of listeners.get(project) ?? []) {
    listener.gone()
  }

  if (failed.restart !== "stop") {
    window.clearTimeout(timers.get(project))
    timers.set(
      project,
      window.setTimeout(() => {
        timers.delete(project)

        for (const listener of listeners.get(project) ?? []) {
          listener.resumed()
        }
      }, failed.restart.delay)
    )
  }
}

/** Hears a project's page process fail and its frames open again. Returns what stops it. */
export function onPageProcess(project: string, listener: PageProcessListener): () => void {
  hearMain()
  let heard = listeners.get(project)

  if (!heard) {
    heard = new Set()
    listeners.set(project, heard)
  }

  heard.add(listener)

  return () => {
    listeners.get(project)?.delete(listener)
  }
}

/** Hears main say a project's page process went, once for the window. */
function hearMain(): void {
  unhear ??= window.canvasHost?.pages.onGone(({ host }) => {
    for (const project of listeners.keys()) {
      if (`${projectHost(project)}.localhost` === host) {
        pageProcessFailed(project, "gone")
      }
    }
  })
}
