import { useSyncExternalStore } from "react"

/** Something the window's views listen to: each `notify` tells every listener it changed. */
export interface Signal {
  /** Listens for changes until the returned function is called; `useSyncExternalStore` takes it as it is. */
  subscribe: (listener: () => void) => () => void
  notify: () => void
  /** Lets go of every listener without telling them, as a project's tab closes. */
  dispose: () => void
}

/**
 * A value the window keeps, such as a dialog that's open or a project's console filter, and the views that show it.
 * `set` replaces it and tells them; `notify` tells them after it changed in place; `reset` puts back its first value.
 */
export interface Store<T> extends Signal {
  get: () => T
  set: (next: T) => void
  /** Replaces the value with what `change` makes of it, then tells the listeners. */
  update: (change: (now: T) => T) => void
  reset: () => void
}

/** A signal of its own, for a store whose value is read some other way, such as from a Map it keeps. */
export function signal(): Signal {
  const listeners = new Set<() => void>()

  return {
    subscribe(listener) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    notify() {
      for (const listener of listeners) {
        listener()
      }
    },
    dispose() {
      listeners.clear()
    }
  }
}

/**
 * A store holding what `initial` makes, made again by `reset`. A store that outlives a project is a `windowStore`, so
 * stories and tests can put it back; one kept for an open project goes with its session (`projectPart`), whose closing
 * disposes of it: its listeners are let go and its first value comes back, without telling anyone.
 */
export function createStore<T>(initial: () => T): Store<T> {
  const changes = signal()
  let value = initial()

  const set = (next: T): void => {
    value = next
    changes.notify()
  }

  return {
    subscribe: changes.subscribe,
    notify: changes.notify,
    get: () => value,
    set,
    update: (change) => set(change(value)),
    reset: () => set(initial()),
    dispose() {
      changes.dispose()
      value = initial()
    }
  }
}

/** What `resetWindowStores` puts back: every `windowStore`, and whatever else asked with `resetWithWindow`. */
const windowResets = new Set<() => void>()

/** A store that lives as long as the window, put back with the rest by `resetWindowStores`. */
export function windowStore<T>(initial: () => T): Store<T> {
  const made = createStore(initial)
  windowResets.add(made.reset)

  return made
}

/**
 * Has something that isn't a `windowStore`, such as a cache a module keeps in a Map, put back by `resetWindowStores`
 * too. `reset` empties it and tells whoever listens.
 */
export function resetWithWindow(reset: () => void): void {
  windowResets.add(reset)
}

/** Puts every window-wide store back to its first value, as each story ends. */
export function resetWindowStores(): void {
  for (const reset of windowResets) {
    reset()
  }
}

/** The store's value, drawn again each time it changes. */
export function useStore<T>(source: Pick<Store<T>, "subscribe" | "get">): T {
  return useSyncExternalStore(source.subscribe, source.get)
}
