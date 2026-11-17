/** Who hears of a lens asked for from outside the lens shell. */
const listeners = new Set<(lens: string) => void>()

/**
 * Asks the open project's shell to show a lens, as a link in it does, from outside it: an extension's Show routes asks
 * for Pages. The lens in focus hears, so with every tab closed nothing does.
 */
export function requestLens(lens: string): void {
  for (const listener of listeners) {
    listener(lens)
  }
}

/** Hears the lenses asked for with `requestLens` until the returned function is called. */
export function onLensRequest(listener: (lens: string) => void): () => void {
  listeners.add(listener)

  return () => listeners.delete(listener)
}
