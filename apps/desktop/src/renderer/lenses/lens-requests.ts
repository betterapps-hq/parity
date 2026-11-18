import { type CanvasDraws, canvasOf } from "../canvas/CanvasEditor.tsx"

/** The lens whose canvas draws each kind of design. */
const lensDrawing: Record<CanvasDraws, string> = { pages: "pages", stories: "stories", designs: "screens" }

/** The lens whose canvas draws a design, by its key. */
export function lensOf(key: string): string {
  return lensDrawing[canvasOf(key)]
}

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
