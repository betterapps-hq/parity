/** Runs tasks no more than a few at once, the most urgent first. */
export interface Turns {
  /**
   * Runs `task` once fewer than the limit are running and no more urgent task is waiting, and gives what it gives.
   * `rank` says how urgent it is, lowest first, read each time a turn frees up so it can follow what changes meanwhile;
   * without one, it waits behind every ranked task. Tasks ranked alike go in the order they were given.
   */
  run<T>(task: () => Promise<T>, rank?: () => number): Promise<T>
}

/**
 * Tasks taken in turns, `limit` at a time, the lowest ranked waiting first and, among equals, the earliest. A task that
 * fails frees its turn as one that finishes does, and its failure goes to whoever gave it.
 */
export function turns(limit: number): Turns {
  const waiting: { start(): void; rank?: () => number }[] = []
  let running = 0

  const next = () => {
    while (running < limit && waiting.length > 0) {
      let chosen = 0
      let lowest = waiting[0]!.rank?.() ?? Number.POSITIVE_INFINITY

      for (let index = 1; index < waiting.length; index++) {
        const rank = waiting[index]!.rank?.() ?? Number.POSITIVE_INFINITY

        if (rank < lowest) {
          chosen = index
          lowest = rank
        }
      }

      running++
      waiting.splice(chosen, 1)[0]!.start()
    }
  }

  return {
    run(task, rank) {
      return new Promise((resolve, reject) => {
        waiting.push({
          start: () => {
            void Promise.resolve()
              .then(task)
              .then(resolve, reject)
              .finally(() => {
                running--
                next()
              })
          },
          rank
        })
        next()
      })
    }
  }
}

/**
 * How far something on screen is from the middle of the view, in pixels, to rank work on it: what's in the middle comes
 * first, then the rest of the view, then what's around it, and what's far away last.
 */
export function distanceFromView(
  box: { left: number; top: number; width: number; height: number },
  view: { left: number; top: number; width: number; height: number }
): number {
  return Math.hypot(
    box.left + box.width / 2 - (view.left + view.width / 2),
    box.top + box.height / 2 - (view.top + view.height / 2)
  )
}
