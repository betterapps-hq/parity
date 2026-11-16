import { type ContainerSpec, type DesignNode, isInnerPath, locateNode, mapNode } from "@parity-app/core"

// Locking (PAR-192): a locked layer or design can't be selected or moved on the canvas, with everything inside it, as
// in Figma, and is still selected from Layers. It's saved in the .par as `locked` on the layer or the design, the same
// in every state and screen size.

/** Where a layer's lock comes from: itself, a layer around it, or its design. */
export type LockSource = { by: "itself" } | { by: "layer"; layer: DesignNode } | { by: "design" }

/**
 * Why a layer is locked, or undefined when it isn't: its own lock first, then the nearest locked layer around it, then
 * its design's. A layer inside an instance (`card/title`) is locked by its instance and what's around that.
 */
export function lockSource(container: ContainerSpec, id: string): LockSource | undefined {
  const [own] = id.split("/")
  const location = locateNode(container.root, own!)

  if (!location) {
    return container.locked ? { by: "design" } : undefined
  }

  if (location.node.locked && !isInnerPath(id)) {
    return { by: "itself" }
  }

  const around = [...location.ancestors, ...(isInnerPath(id) ? [location.node] : [])]
  const layer = around.reverse().find((node) => node.locked)

  if (layer) {
    return { by: "layer", layer }
  }

  return container.locked ? { by: "design" } : undefined
}

/** Whether the canvas leaves a layer alone: it, a layer around it, or its design is locked. */
export function isLocked(container: ContainerSpec, id: string): boolean {
  return lockSource(container, id) !== undefined
}

/**
 * What the canvas can pick among `path`, layers under the pointer outermost first: those before the first locked
 * layer, since everything inside a locked layer is locked too, so a click there picks the layer around it. The
 * design's own lock isn't read here: the canvas leaves a locked design alone before it looks at its layers.
 */
export function unlockedPath(container: ContainerSpec, path: readonly string[]): readonly string[] {
  const at = path.findIndex((id) => {
    const source = lockSource({ ...container, locked: false }, id)

    return source !== undefined
  })

  return at === -1 ? path : path.slice(0, at)
}

/**
 * The layers Lock can change: the design's own, other than its root (locking the root is locking the design) and the
 * layers inside an instance, which belong to its component.
 */
export function lockableIds(container: ContainerSpec, ids: readonly string[]): string[] {
  return ids.filter((id) => !isInnerPath(id) && id !== container.root.id && locateNode(container.root, id))
}

/** Whether every lockable layer among `ids` is locked by its own lock, so Lock reads Unlock. */
export function layersLocked(container: ContainerSpec, ids: readonly string[]): boolean {
  const own = lockableIds(container, ids)

  return own.length > 0 && own.every((id) => locateNode(container.root, id)!.node.locked === true)
}

/**
 * Locks the layers, or unlocks them when they're all locked. Unlocking takes `locked` away rather than saving
 * `false`, so the .par only says it where it's true. The same design comes back when nothing changed.
 */
export function toggleLockedLayers(container: ContainerSpec, ids: readonly string[]): ContainerSpec {
  const own = lockableIds(container, ids)

  if (own.length === 0) {
    return container
  }

  const lock = !layersLocked(container, own)
  const root = own.reduce((next, id) => mapNode(next, id, (node) => withLocked(node, lock)), container.root)

  return root === container.root ? container : { ...container, root }
}

/** Whether every design is locked, so Lock reads Unlock. */
export function designsLocked(containers: readonly ContainerSpec[]): boolean {
  return containers.length > 0 && containers.every((container) => container.locked === true)
}

/** Locks a design, or unlocks it, as `toggleLockedLayers` does a layer. */
export function setDesignLocked(container: ContainerSpec, lock: boolean): ContainerSpec {
  return withLocked(container, lock)
}

function withLocked<T extends { locked?: boolean }>(value: T, lock: boolean): T {
  if ((value.locked === true) === lock) {
    return value
  }

  if (lock) {
    return { ...value, locked: true }
  }

  const { locked: _locked, ...rest } = value

  // SAFETY: designs and layers, the values locked here, have `locked` optional, so one without it is still a T.
  return rest as T
}
