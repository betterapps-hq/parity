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

/** Where something is against the view, as an `IntersectionObserver` last reported it. */
export interface PlaceInView {
  /** Whether any of it is in the view. */
  inView: boolean
  /** Whether any of it is in or around the view, within the margin it's watched with. */
  near: boolean
  /** How far its middle is from the view's, in pixels (`distanceFromView`). */
  distance: number
}

/**
 * How urgent work on something is from where it is, lowest first, for `turns`: anything in the view before anything
 * around it, and that before anything farther away; within each, the nearest the middle of the view first.
 */
export function viewRank({ inView, near, distance }: PlaceInView): number {
  let tier = 2

  if (inView) {
    tier = 0
  } else if (near) {
    tier = 1
  }

  return tier * 1e9 + Math.min(distance, 1e9 - 1)
}

/** How far the middle of a box is from the middle of the view, in pixels. */
export function distanceFromView(
  box: { left: number; top: number; width: number; height: number },
  view: { left: number; top: number; width: number; height: number }
): number {
  return Math.hypot(
    box.left + box.width / 2 - (view.left + view.width / 2),
    box.top + box.height / 2 - (view.top + view.height / 2)
  )
}
