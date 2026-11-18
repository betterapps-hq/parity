import { failureWindow, type Restart, restartAfter } from "./freezer.ts"

/*
 * The page process's failure (docs/proposals/route-frames.md, "When the page process fails", PAR-1300). A project's
 * live frame, spares and freezer share one renderer process. Main sees it go: Electron's `render-process-gone` is only
 * the window's own process, and a cross-site frame's has no event of its own, so main notes the process each page frame
 * runs in and looks for one that ended under a frame still in the window. The window keeps one record of failures per
 * project, so a process going that the freezer's channel and main both report counts once, and every frame of the
 * project waits out the same pause.
 */

/** A route frame that loaded a page: its place in the window's frame tree, its page's host and its process's id. */
export interface PageFrameSeen {
  /** Chromium's id for the frame's place in the tree, which stays while the iframe does. */
  node: number
  /** The page's host, `<project-id>.localhost`, one per project. */
  host: string
  /** The operating system's id of the process the frame's page runs in. */
  pid: number
}

/**
 * Main's view of which processes run route pages, by the frames that loaded them. A frame removed from the window is
 * forgotten before its process is looked at, as a process left with no frames ends of its own accord; one that ends
 * under a frame still there has gone.
 */
export class PageProcesses {
  private readonly frames = new Map<number, PageFrameSeen>()

  /** A frame loaded a page, in this process: a later load replaces what the frame had. */
  seen(frame: PageFrameSeen): void {
    this.frames.set(frame.node, frame)
  }

  /**
   * The hosts whose process went under a frame, each once, from the frames still in the window and whether a process
   * runs. Frames no longer in the window, and those whose process went, are forgotten.
   */
  check(present: ReadonlySet<number>, running: (pid: number) => boolean): string[] {
    const gone = new Set<string>()

    for (const [node, frame] of this.frames) {
      if (!present.has(node)) {
        this.frames.delete(node)
      } else if (!running(frame.pid)) {
        this.frames.delete(node)
        gone.add(frame.host)
      }
    }

    return [...gone]
  }

  /** Whether any frame is watched, so main only looks while route pages are open. */
  get watching(): boolean {
    return this.frames.size > 0
  }
}

/** One project's failures of its page process: when each was, and when frames may open again, or that they won't. */
export interface ProcessFailures {
  failures: readonly number[]
  /** When frames may open again, or `"stopped"` once Parity stopped trying. */
  until: number | "stopped"
}

/** A project whose page process hasn't failed. */
export const noFailures: ProcessFailures = { failures: [], until: 0 }

/** Whether a project may open frames now. */
export function processOpen(state: ProcessFailures, now: number): boolean {
  return state.until !== "stopped" && now >= state.until
}

/**
 * Records a failure of the page process at `now`, with what to do after it: open frames again after a pause, or stop.
 * A failure reported while frames wait to open again, or after Parity stopped, is the same one, heard twice, and
 * returns nothing.
 */
export function processFailed(
  state: ProcessFailures,
  now: number
): { state: ProcessFailures; restart: Restart } | undefined {
  if (!processOpen(state, now)) {
    return undefined
  }

  const failures = [...state.failures.filter((at) => now - at < failureWindow), now]
  const restart = restartAfter(failures, now)

  return { state: { failures, until: restart === "stop" ? "stopped" : now + restart.delay }, restart }
}
