import type { Timers } from "./carried.ts"

/** Timers that run only when a test moves the clock on, and the time they keep. */
export function clock(): Timers & { tick(ms: number): void; now: () => number } {
  let now = 0
  let next = 1
  const waiting = new Map<number, { at: number; run: () => void }>()

  return {
    set(run, ms) {
      const id = next++
      waiting.set(id, { at: now + ms, run })

      return id
    },
    clear(id) {
      waiting.delete(id)
    },
    tick(ms) {
      now += ms

      for (const [id, { at, run }] of waiting) {
        if (at <= now) {
          waiting.delete(id)
          run()
        }
      }
    },
    now: () => now
  }
}
