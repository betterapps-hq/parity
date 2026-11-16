import { createStore, type Store, windowStore } from "../store.ts"
import { type DragPhase, flightMs } from "./drag-motion.ts"

/**
 * The picture of layers carried out of a layout, while they're carried and while it flies once they're let go: what it
 * shows, where its top-left is in the canvas area's pixels, where it was grabbed from its top-left, and the drag's
 * phase. The overlay over `area` draws it (`CarriedPicture`).
 */
export interface Carried<Picture = HTMLElement> {
  area: Element
  picture: Picture
  at: { x: number; y: number }
  grab: { x: number; y: number }
  phase: DragPhase
}

/** Waiting for a flight to end: the window's timers, or a test's. */
export interface Timers {
  set(run: () => void, ms: number): number
  clear(timer: number): void
}

const windowTimers: Timers = {
  set: (run, ms) => window.setTimeout(run, ms),
  clear: (timer) => window.clearTimeout(timer)
}

/** A carried picture's lifecycle (see `carriedPictures`). */
export interface CarriedPictures<Picture> {
  readonly store: Store<Carried<Picture> | undefined>
  /** Picks a picture up, after ending any flight still going. */
  pickUp(carried: Omit<Carried<Picture>, "phase">): void
  /** Moves the picture with the pointer, while it's carried. */
  carry(at: { x: number; y: number }): void
  /**
   * Lets it go: it flies `to` where it lands (`dropping`) or back to where it was (`cancelling`), then goes, and `landed`
   * runs. With reduced motion, or with nothing carried, it goes and `landed` runs at once.
   */
  letGo(phase: Exclude<DragPhase, "carrying">, to: { x: number; y: number }, reduced: boolean, landed: () => void): void
  /** Ends a flight still going at once, as though it had landed. */
  finish(): void
}

/**
 * Keeps one carried picture at a time, from picking it up until it lands: picked up, it's carried, moving with the
 * pointer; let go, it flies for `flightMs` and is gone. Picking up another, or `finish`, lands a flight still going
 * first, so what waits for it to land is never left waiting.
 */
export function carriedPictures<Picture>(
  timers: Timers = windowTimers,
  store: Store<Carried<Picture> | undefined> = createStore<Carried<Picture> | undefined>(() => undefined)
): CarriedPictures<Picture> {
  let flight: { timer: number; land: () => void } | undefined

  const finish = () => {
    if (!flight) {
      return
    }

    const { timer, land } = flight
    flight = undefined
    timers.clear(timer)
    land()
  }

  return {
    store,
    pickUp(carried) {
      finish()
      store.set({ ...carried, phase: "carrying" })
    },
    carry(at) {
      const carried = store.get()

      if (carried?.phase === "carrying") {
        store.set({ ...carried, at })
      }
    },
    letGo(phase, to, reduced, landed) {
      const carried = store.get()

      const land = () => {
        store.set(undefined)
        landed()
      }

      const ms = flightMs(phase, reduced)

      if (carried?.phase !== "carrying" || ms === 0) {
        land()

        return
      }

      store.set({ ...carried, phase, at: to })
      flight = {
        timer: timers.set(() => {
          flight = undefined
          land()
        }, ms),
        land
      }
    },
    finish
  }
}

/** The window's carried picture: the canvas's own layer drag carries one at a time. */
export const carriedPicture = carriedPictures<HTMLElement>(
  windowTimers,
  windowStore<Carried | undefined>(() => undefined)
)
