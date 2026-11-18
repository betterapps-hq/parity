import type { Disposable } from "@parity-app/extension"
import type { Gesture, Point, Presence, Self, Viewing } from "@parity-app/extension/internal"
import type { WindowSurface } from "./window-modules.ts"

/*
 * `parity.presence` for one project tab (docs/proposals/extensions-in-the-window.md, "The event and call tables"): this
 * person's pointer at most once a frame, the latest, with its leaving never dropped; every gesture in order; and what
 * they're viewing on each change, and who's signed in whenever that changes. The window gives the raw events as a port; nothing is collected while no window
 * module listens. A move's drop and its end wait for the changes committed before them to be told to
 * `sync.onLocalChanges`, so a copy that sends both on one ordered channel delivers the write first.
 */

/** This person's pointer over the canvas, on the page. */
export interface Pointer {
  at: Point
  over: boolean
  /** When the pointer was there, on the window's clock, from the input event. */
  t?: number
}

/** What the tab's window tells of this person. */
export interface PresencePort {
  self(): Self
  /** Told whenever who's signed in may have changed; `self` is read again then. Returns what stops it. */
  onSelfChange(listener: () => void): () => void
  /** Every move of the pointer over the canvas, and its leaving. Returns what stops it. */
  onPointer(listener: (pointer: Pointer) => void): () => void
  onGesture(listener: (gesture: Gesture) => void): () => void
  onViewing(listener: (viewing: Viewing) => void): () => void
  /** Calls `callback` at the next animation frame. Returns what calls it off. */
  frame(callback: () => void): () => void
  /** Tells `sync.onLocalChanges` every change committed so far, before a gesture's drop or end is told. */
  flushChanges?(): void
}

/** The tab's `parity.presence`, for `windowModules`'s `surfaces`. */
export function windowPresence(port: PresencePort): WindowSurface {
  const pointers = new Set<(pointer: Pointer) => void>()
  const gestures = new Set<(gesture: Gesture) => void>()
  const viewings = new Set<(viewing: Viewing) => void>()
  const selves = new Set<(self: Self) => void>()
  let stopPointer: (() => void) | undefined
  let stopGesture: (() => void) | undefined
  let stopViewing: (() => void) | undefined
  let stopSelf: (() => void) | undefined
  let lastViewing: string | undefined

  // Who's signed in, kept as one object until it changes, so a module can compare it or hand it to React as it is.
  let self: Self | undefined
  let selfKey: string | undefined

  /** Who's signed in now: the same object as when it was last read, unless it's changed since. */
  const readSelf = (): Self => {
    const next = port.self()
    const key = JSON.stringify(next)

    if (!self || key !== selfKey) {
      self = next
      selfKey = key
    }

    return self
  }

  const heardSelf = () => {
    const before = self
    const now = readSelf()

    if (now === before) {
      return
    }

    for (const listener of selves) {
      listener(now)
    }
  }

  // The latest pointer this frame, sent when the frame comes.
  let pending: Pointer | undefined
  let cancelFrame: (() => void) | undefined

  const tellPointer = (pointer: Pointer) => {
    for (const listener of pointers) {
      listener(pointer)
    }
  }

  const heardPointer = (pointer: Pointer) => {
    // Leaving is told at once, and what moved before it this frame is dropped for it.
    if (!pointer.over) {
      cancelFrame?.()
      cancelFrame = undefined
      pending = undefined
      tellPointer(pointer)

      return
    }

    pending = pointer
    cancelFrame ??= port.frame(() => {
      cancelFrame = undefined
      const latest = pending
      pending = undefined

      if (latest) {
        tellPointer(latest)
      }
    })
  }

  const heardGesture = (gesture: Gesture) => {
    if (gesture.kind === "move" && gesture.phase !== "start") {
      port.flushChanges?.()
    }

    for (const listener of gestures) {
      listener(gesture)
    }
  }

  const heardViewing = (viewing: Viewing) => {
    const key = JSON.stringify([viewing.design, viewing.state, viewing.mode])

    if (key === lastViewing) {
      return
    }

    lastViewing = key

    for (const listener of viewings) {
      listener(viewing)
    }
  }

  /** Adds a listener, listening to the window while any is added. */
  const listen = <T>(listeners: Set<T>, listener: T, start: () => void, stop: () => void): Disposable => {
    listeners.add(listener)

    if (listeners.size === 1) {
      start()
    }

    return once(() => {
      listeners.delete(listener)

      if (listeners.size === 0) {
        stop()
      }
    })
  }

  return {
    capability: "presence",
    make(context) {
      const presence: Presence = {
        get self() {
          return readSelf()
        },
        onSelfChange(listener) {
          const handle = listen(
            selves,
            context.listener("presence.onSelfChange", listener),
            () => {
              // Read first, so the change is measured from who was signed in as the module began listening.
              readSelf()
              stopSelf = port.onSelfChange(heardSelf)
            },
            () => {
              stopSelf?.()
              stopSelf = undefined
            }
          )

          context.onEnd(() => handle.dispose())

          return handle
        },
        onPointer(listener) {
          const handle = listen(
            pointers,
            context.listener("presence.onPointer", listener),
            () => {
              stopPointer = port.onPointer(heardPointer)
            },
            () => {
              stopPointer?.()
              stopPointer = undefined
              cancelFrame?.()
              cancelFrame = undefined
              pending = undefined
            }
          )

          context.onEnd(() => handle.dispose())

          return handle
        },
        onGesture(listener) {
          const handle = listen(
            gestures,
            context.listener("presence.onGesture", listener),
            () => {
              stopGesture = port.onGesture(heardGesture)
            },
            () => {
              stopGesture?.()
              stopGesture = undefined
            }
          )

          context.onEnd(() => handle.dispose())

          return handle
        },
        onViewing(listener) {
          const handle = listen(
            viewings,
            context.listener("presence.onViewing", listener),
            () => {
              lastViewing = undefined
              stopViewing = port.onViewing(heardViewing)
            },
            () => {
              stopViewing?.()
              stopViewing = undefined
            }
          )

          context.onEnd(() => handle.dispose())

          return handle
        }
      }

      return presence
    }
  }
}

function once(dispose: () => void): Disposable {
  let done = false

  return {
    dispose() {
      if (!done) {
        done = true
        dispose()
      }
    }
  }
}
