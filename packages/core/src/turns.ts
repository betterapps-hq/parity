/** Runs tasks in the order they're given, no more than a few at once. */
export interface Turns {
  /** Runs `task` once fewer than the limit of earlier ones are still running, and gives what it gives. */
  run<T>(task: () => Promise<T>): Promise<T>
}

/**
 * Tasks taken in turns, `limit` at a time, the earliest waiting first. A task that fails frees its turn as one that
 * finishes does, and its failure goes to whoever gave it.
 */
export function turns(limit: number): Turns {
  const waiting: (() => void)[] = []
  let running = 0

  const next = () => {
    while (running < limit && waiting.length > 0) {
      running++
      waiting.shift()!()
    }
  }

  return {
    run(task) {
      return new Promise((resolve, reject) => {
        waiting.push(() => {
          void Promise.resolve()
            .then(task)
            .then(resolve, reject)
            .finally(() => {
              running--
              next()
            })
        })
        next()
      })
    }
  }
}
