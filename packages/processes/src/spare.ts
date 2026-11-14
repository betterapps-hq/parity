import type { Lifecycle } from "./lifecycle.ts"

/** A child kept started ahead of need, so whoever needs one next skips its start (PAR-1079). */
export interface Spare<T extends { life: Pick<Lifecycle, "running"> }> {
  /** The spare if it's still running, which then stops being the spare, or a child started now. */
  take(): T
  /** Starts a spare, unless one is running already. */
  prepare(): void
}

/** Keeps at most one child that `start` starts waiting to be taken. One that ends while it waits is let go. */
export function keepSpare<T extends { life: Pick<Lifecycle, "running"> }>(start: () => T): Spare<T> {
  let spare: T | undefined

  return {
    take() {
      const taken = spare?.life.running ? spare : start()
      spare = undefined

      return taken
    },
    prepare() {
      if (!spare?.life.running) {
        spare = start()
      }
    }
  }
}
