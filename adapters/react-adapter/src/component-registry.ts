// Compiled by the customer's build tool with the guest, so it imports nothing at runtime.
import type { GuestComponentSource, GuestInit } from "@parity-app/core"

/** A module that gives a component when it loads, for one drawn on demand, as the builder gives the guest them. */
export type ComponentLoader = NonNullable<GuestInit["lazyComponents"]>[string]

/** Where the dev server serves a component's file, and where the component is in it. */
export interface SourceAddress {
  /** The file's address on the dev server. */
  address: string
  /** The file's address and the export's name, which tell one source from another. */
  from: string
}

/**
 * A guest's components by id: those it loaded with, drawn at once or loaded on demand, and those added since it loaded,
 * which load on demand from their own file. It knows where each comes from, so adding one from the file it already
 * comes from changes nothing, and taking one back puts back what the guest loaded with.
 */
export interface ComponentRegistry<Component> {
  /** Every component's id, in the order they came: the same array throughout, which the guest lists as its own. */
  names: string[]
  /** A component the guest has to hand. */
  component(id: string): Component | undefined
  /** What loads a component drawn on demand. */
  loader(id: string): ComponentLoader | undefined
  /** How many times a component has come from a new file, so its boundaries start afresh each time. */
  moves(id: string): number
  /**
   * Draws each component from its source from now on, loading it with `load`, given the address the dev server serves
   * its file at and the export's name. Gives back the ids that came from a new file.
   */
  add(sources: Record<string, GuestComponentSource>, load: (address: string, name: string) => ComponentLoader): string[]
  /** Takes back components `add` gave. Gives back the ids it took back; ids it wasn't given change nothing. */
  remove(ids: readonly string[]): string[]
  /** Goes up each time `add` or `remove` changes where a component comes from. `subscribe` hears when it does. */
  revision: { get: () => number; subscribe: (listener: () => void) => () => void }
}

/**
 * The address the dev server serves a component's file at, and where the component is in it. A new `version` is the
 * same file with changed code, which the dev server builds afresh at a new address.
 */
export function sourceAddress(source: GuestComponentSource): SourceAddress {
  const address = `/${source.path.replace(/^\.?\//, "")}${source.version === undefined ? "" : `?t=${source.version}`}`

  return { address, from: `${address}#${source.export}` }
}

/** The registry of a guest that loaded with `components`, and with `lazy` to load on demand. */
export function componentRegistry<Component>(
  components: Readonly<Record<string, Component>>,
  lazy: Readonly<Record<string, ComponentLoader>> = {}
): ComponentRegistry<Component> {
  const eager = new Map(Object.entries(components))
  const loaders = new Map(Object.entries(lazy))
  const names = [...eager.keys(), ...loaders.keys()]
  /** What the guest loaded with, for a component added over one of them to go back to once its new source goes. */
  const loadedWith = { eager: new Map(eager), loaders: new Map(loaders) }
  /** Where each component added since the guest loaded comes from. */
  const added = new Map<string, string>()
  const moved = new Map<string, number>()
  let revision = 0
  const listeners = new Set<() => void>()

  const move = (id: string) => moved.set(id, (moved.get(id) ?? 0) + 1)

  const changed = (ids: string[]) => {
    if (ids.length === 0) {
      return ids
    }

    revision++

    for (const listener of listeners) {
      listener()
    }

    return ids
  }

  return {
    names,
    component: (id) => eager.get(id),
    loader: (id) => loaders.get(id),
    moves: (id) => moved.get(id) ?? 0,
    add(sources, load) {
      const ids: string[] = []

      for (const [id, source] of Object.entries(sources)) {
        const { address, from } = sourceAddress(source)

        if (added.get(id) === from) {
          continue
        }

        added.set(id, from)
        move(id)
        ids.push(id)
        loaders.set(id, load(address, source.export))
        // One it had already has moved to another file, so it's drawn from there from now on.
        eager.delete(id)

        if (!names.includes(id)) {
          names.push(id)
        }
      }

      return changed(ids)
    },
    remove(taken) {
      const ids: string[] = []

      for (const id of taken) {
        if (!added.delete(id)) {
          continue
        }

        move(id)
        ids.push(id)
        loaders.delete(id)
        // One the guest loaded with is drawn as it loaded again; one it was only given is gone.
        const component = loadedWith.eager.get(id)
        const loader = loadedWith.loaders.get(id)

        if (component !== undefined) {
          eager.set(id, component)
        } else if (loader) {
          loaders.set(id, loader)
        } else {
          names.splice(names.indexOf(id), 1)
        }
      }

      return changed(ids)
    },
    revision: {
      get: () => revision,
      subscribe(listener) {
        listeners.add(listener)

        return () => listeners.delete(listener)
      }
    }
  }
}
