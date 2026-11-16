/** How main starts the project service again after it crashes (PAR-788). */
export interface ServiceRestartPolicy {
  /**
   * How long to wait before each restart in a run of crashes, in milliseconds. Once a run has used them all, the service
   * stays stopped until a window loads and starts it.
   */
  delaysMs: readonly number[]
  /** How long a service has to run, in milliseconds, before its crash starts a new run rather than adding to one. */
  steadyMs: number
}

/** Restarts at once, then backs off to half a minute, and gives up after five crashes that each came within a minute. */
export const serviceRestartPolicy: ServiceRestartPolicy = {
  delaysMs: [0, 1000, 5000, 15_000, 30_000],
  steadyMs: 60_000
}

/** How a project service ended, as main sees it. */
export interface ServiceExit {
  exitCode: number
  /** How long it ran, in milliseconds. */
  ranMs: number
  /** Whether main ended it on purpose: a fresh service replaced it, or the app is quitting. */
  expected: boolean
}

/** Decides, for each project service that exits, whether to start a fresh one and how long to wait first. */
export interface ServiceRestarts {
  /**
   * How long to wait before starting a fresh service, in milliseconds, or nothing when it shouldn't be started: main
   * ended it, it ended cleanly, or it keeps crashing soon after it starts.
   */
  exited(exit: ServiceExit): number | undefined
}

export function serviceRestarts(policy: ServiceRestartPolicy = serviceRestartPolicy): ServiceRestarts {
  let crashes = 0

  return {
    exited({ exitCode, ranMs, expected }) {
      if (expected || exitCode === 0) {
        return undefined
      }

      if (ranMs >= policy.steadyMs) {
        crashes = 0
      }

      const delay = policy.delaysMs[crashes]

      if (delay === undefined) {
        return undefined
      }

      crashes++

      return delay
    }
  }
}
