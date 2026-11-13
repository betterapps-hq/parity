/*
 * Every process and worker thread the project service starts goes through this one lifecycle (PAR-987): Storybook and
 * other servers, each project's builder, library installs and the type checker's worker. It keeps the end of what the
 * child printed, settles once with how it ended, ends it when asked or when a deadline passes, and remembers which of
 * those ended it, so a stop or a timeout isn't taken for a crash. What a child is, a spawned command, a forked script or
 * a worker thread, is the adapter's business: the app makes a `ChildHandle` from each and passes it here.
 */

/**
 * How much of what a child printed is kept and quoted, in characters: enough for a stack trace or a package manager's
 * last error, and short enough to read where an error shows, as the processes list. Errors quoted 1,500 or 2,000 before
 * this was one size (PAR-987).
 */
export const tailLength = 2000

/** How a child ended, as its adapter heard it: an exit code, a signal, or why it never started or failed. */
export interface ChildEnd {
  code?: number
  signal?: string
  /** Why it couldn't start, as a command that isn't installed, or what it failed with, as a worker out of memory. */
  error?: Error
}

/** What the lifecycle needs of a running child. The app's adapters make one from a process or a worker thread. */
export interface ChildHandle {
  /** Its process id, once it has one. A worker thread has none. */
  readonly pid?: number
  /** Calls `listener` with what it prints, as it prints it. */
  onOutput(listener: (text: string) => void): void
  /** Calls `listener` once, when it has ended. */
  onEnd(listener: (end: ChildEnd) => void): void
  /** Ends it and every process it started. */
  kill(): void
}

/** How a child ended, once it has. */
export interface ChildExit extends ChildEnd {
  /** `exit code 1`, `signal SIGTERM`, or why it couldn't start. */
  how: string
  /** Whether `stop` ended it. */
  stopped: boolean
  /** Whether a deadline ended it. */
  timedOut: boolean
  /** The end of what it printed. */
  output: string
}

export interface Lifecycle {
  readonly pid?: number
  /** Settles once the child has ended, however it ended. */
  readonly exited: Promise<ChildExit>
  /** Whether it hasn't ended yet. */
  readonly running: boolean
  /** Whether it was told to end, by `stop` or a deadline, so its exit isn't a crash. */
  readonly stopping: boolean
  /** The end of what it printed, at most `tailLength` characters. */
  tail(): string
  /** Ends it and every process it started. Its exit then counts as stopped. */
  stop(): void
  /**
   * Ends it `ms` from now, unless the function returned is called first. Its exit then counts as timed out, and
   * `passed` is called as the deadline passes, before the child has ended.
   */
  deadline(ms: number, passed?: () => void): () => void
}

/** Watches a child its adapter started, until it ends. */
export function lifecycle(child: ChildHandle): Lifecycle {
  let output = ""
  let stopping = false
  let timedOut = false
  let running = true
  const deadlines = new Set<ReturnType<typeof setTimeout>>()

  child.onOutput((text) => {
    output = (output + text).slice(-tailLength)
  })

  const exited = new Promise<ChildExit>((resolve) => {
    child.onEnd((end) => {
      if (!running) {
        return
      }

      running = false

      for (const timer of deadlines) {
        clearTimeout(timer)
      }

      deadlines.clear()
      resolve({ ...end, how: howItEnded(end), stopped: stopping && !timedOut, timedOut, output })
    })
  })

  const end = () => {
    if (running) {
      child.kill()
    }
  }

  return {
    get pid() {
      return child.pid
    },
    exited,
    get running() {
      return running
    },
    get stopping() {
      return stopping
    },
    tail: () => output,
    stop() {
      if (stopping) {
        return
      }

      stopping = true
      end()
    },
    deadline(ms, passed) {
      if (!running) {
        return () => undefined
      }

      const timer = setTimeout(() => {
        deadlines.delete(timer)

        if (!running || stopping) {
          return
        }

        stopping = true
        timedOut = true
        passed?.()
        end()
      }, ms)

      // A deadline doesn't keep the service running: a child still running when it ends is ended with it.
      timer.unref()
      deadlines.add(timer)

      return () => {
        clearTimeout(timer)
        deadlines.delete(timer)
      }
    }
  }
}

/** `exit code 1`, `signal SIGTERM`, or the error a child failed with. */
function howItEnded({ code, signal, error }: ChildEnd): string {
  if (error && code === undefined && signal === undefined) {
    return error.message
  }

  if (signal !== undefined) {
    return `signal ${signal}`
  }

  return `exit code ${code ?? "unknown"}`
}

/** How many lines of a child's output telemetry sends: the end of its tail. */
export const reportedLines = 50

/** The last `reportedLines` lines of what a child printed, as telemetry sends them. */
export function lastLines(output: string): string {
  return output.trimEnd().split(/\r?\n/).slice(-reportedLines).join("\n")
}

/**
 * A sentence for a child that ended by itself, with the end of what it printed: `Vite stopped by itself, with exit code
 * 1:` and its output, or `Storybook couldn't start: spawn storybook ENOENT`.
 */
export function endedByItself(name: string, exit: ChildExit): string {
  if (exit.error && exit.code === undefined && exit.signal === undefined) {
    return `${name} couldn't start: ${exit.how}`
  }

  const tail = exit.output.trim()

  return tail ? `${name} stopped by itself, with ${exit.how}:\n${tail}` : `${name} stopped by itself, with ${exit.how}`
}
