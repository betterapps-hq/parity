/*
 * Route boards' frozen copies built a few milliseconds a frame (PAR-1336). A board that comes near while the canvas
 * zooms built its copy within one frame, about 1,200 elements for a dense page, so the zoom stalled for that frame. Each
 * copy is built in steps instead, while the board goes on showing its picture, and swaps in once it's whole.
 */

/** How long each frame gives to building copies, in milliseconds. */
export const buildBudget = 4

/** A copy being built: how urgent it is, and its next step, which says whether it was the last. */
interface Build {
  rank: () => number
  step: () => boolean
}

/** Copies waiting to be built or partly built, and how they're run. */
export interface CopyBuilds {
  /**
   * Builds `steps` over as many frames as they take, the most urgent first, as `rank` orders them (lower first), and
   * gives what they return to `done`. Returns what cancels the build.
   */
  build: <Result>(steps: Generator<void, Result>, rank: () => number, done: (value: Result) => void) => () => void
}

/**
 * A queue that runs builds in each frame `schedule` gives it, for up to `budget` milliseconds of `now`. At most one
 * build finishes in a frame, so boards that come near together swap in one a frame, each with the page's styles and
 * layout for its copy to itself.
 */
export function copyBuilds(
  schedule: (run: () => void) => void = (run) => requestAnimationFrame(run),
  now: () => number = () => performance.now(),
  budget = buildBudget
): CopyBuilds {
  const queue = new Set<Build>()
  let scheduled = false

  const run = () => {
    scheduled = false
    const end = now() + budget

    const build = [...queue].reduce<Build | undefined>(
      (first, next) => (first && first.rank() <= next.rank() ? first : next),
      undefined
    )

    if (!build) {
      return
    }

    for (;;) {
      if (build.step()) {
        queue.delete(build)
        break
      }

      if (now() >= end) {
        break
      }
    }

    if (queue.size > 0) {
      ask()
    }
  }

  const ask = () => {
    if (!scheduled) {
      scheduled = true
      schedule(run)
    }
  }

  return {
    build: (steps, rank, done) => {
      const build: Build = {
        rank,
        step: () => {
          const step = steps.next()

          if (step.done) {
            done(step.value)
          }

          return step.done === true
        }
      }

      queue.add(build)
      ask()

      return () => {
        queue.delete(build)
      }
    }
  }
}

/** The window's queue, which every route board builds its copy through. */
export const windowCopyBuilds = copyBuilds()
