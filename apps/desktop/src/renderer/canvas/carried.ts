import type { Palette } from "@parity-app/presence-colors"
import { createStore, type Store, windowStore } from "../store.ts"
import { type DragPhase, flightMs } from "./drag-motion.ts"

/** Someone else dragging, whose picture carries their outline, in their color, and their name. */
export interface Dragger {
  palette: Palette
  label?: string
}

/** Where carried layers land, in the canvas area's pixels, and how round its corners are. */
export interface Spot {
  x: number
  y: number
  w: number
  h: number
  radius: number
}

/**
 * The picture of layers carried out of a layout, while they're carried and while it flies once they're let go: what it
 * shows, where its top-left is in the canvas area's pixels, where it was grabbed from its top-left, and the drag's
 * phase. Dropped, `spot` is where they landed, which keeps its outline until the picture gets there. Someone else's
 * drag (`drag-preview.ts`) carries theirs, `by` them. The overlay over `area` draws it (`CarriedPicture`).
 */
export interface Carried<Picture = HTMLElement> {
  area: Element
  picture: Picture
  at: { x: number; y: number }
  grab: { x: number; y: number }
  phase: DragPhase
  spot?: Spot
  by?: Dragger
}

/** Waiting for a flight to end: the window's timers, or a test's. */
export interface Timers {
  set(run: () => void, ms: number): number
  clear(timer: number): void
}

export const windowTimers: Timers = {
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
   * runs. With reduced motion, or with nothing carried, it goes and `landed` runs at once. `spot` is where it lands, to
   * outline until then.
   */
  letGo(
    phase: Exclude<DragPhase, "carrying">,
    to: { x: number; y: number },
    reduced: boolean,
    landed: () => void,
    spot?: Spot
  ): void
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
    letGo(phase, to, reduced, landed, spot) {
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

      store.set(spot ? { ...carried, phase, at: to, spot } : { ...carried, phase, at: to })
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

/** The local drag's key among the carried pictures: a preview's is its own. */
export const localDrag = "local"

/**
 * Carried pictures, one per drag, by key: the local drag's (`localDrag`) and each preview's, so several people can drag
 * at once and a person can drag while seeing someone else's. Each is a `carriedPictures` of its own, with its own flight.
 */
export interface CarriedSet<Picture> {
  /** Every picture carried or flying, by its drag's key. */
  readonly store: Store<ReadonlyMap<string, Carried<Picture>>>
  /** A drag's own carried picture, made the first time it's asked for. */
  of(key: string): CarriedPictures<Picture>
  /** Lands a drag's picture at once, if it's still flying, and forgets it. */
  forget(key: string): void
}

export function carriedSet<Picture>(
  timers: Timers = windowTimers,
  store: Store<ReadonlyMap<string, Carried<Picture>>> = createStore<ReadonlyMap<string, Carried<Picture>>>(
    () => new Map()
  )
): CarriedSet<Picture> {
  const made = new Map<string, CarriedPictures<Picture>>()

  return {
    store,
    of(key) {
      const known = made.get(key)

      if (known) {
        return known
      }

      const pictures = carriedPictures(timers, keyed(store, key))
      made.set(key, pictures)

      return pictures
    },
    forget(key) {
      made.get(key)?.finish()
      made.delete(key)
      keyed(store, key).set(undefined)
    }
  }
}

/** One key of a store of pictures by key, as a store of its own. */
function keyed<Picture>(
  all: Store<ReadonlyMap<string, Carried<Picture>>>,
  key: string
): Store<Carried<Picture> | undefined> {
  const set = (next: Carried<Picture> | undefined) => {
    const now = all.get()

    if (next === now.get(key)) {
      return
    }

    const changed = new Map(now)

    if (next) {
      changed.set(key, next)
    } else {
      changed.delete(key)
    }

    all.set(changed)
  }

  return {
    subscribe: all.subscribe,
    notify: all.notify,
    get: () => all.get().get(key),
    set,
    update: (change) => set(change(all.get().get(key))),
    reset: () => set(undefined),
    dispose: () => set(undefined)
  }
}

/** The window's carried pictures: the canvas's own layer drag's, and each preview's. */
export const carriedPictureSet = carriedSet<HTMLElement>(
  windowTimers,
  windowStore<ReadonlyMap<string, Carried>>(() => new Map())
)

/** The canvas's own layer drag's carried picture. */
export const carriedPicture = carriedPictureSet.of(localDrag)
