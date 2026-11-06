import { createContext, useContext, useEffect, useSyncExternalStore } from "react"
import type { ProjectPicture } from "../../shared/protocol.ts"
import { request } from "../service.ts"

/** Where the start page gets projects' pictures (PAR-607): the ones the service keeps, or a story's own. */
export interface PictureSource {
  subscribe: (listener: () => void) => () => void
  /** A project's picture: undefined until it's known, null when none is kept. */
  get: (root: string) => ProjectPicture | null | undefined
  /** Asks for a project's picture, if it hasn't been. */
  ask: (root: string) => void
}

/**
 * The pictures the service keeps, read the first time the start page shows each project. One the window takes stands in
 * at once, without reading it back.
 */
class KeptPictures implements PictureSource {
  private readonly pictures = new Map<string, ProjectPicture | null>()
  private readonly listeners = new Set<() => void>()
  /** Projects to ask about together, the ones a page shows at once. */
  private asking: string[] = []

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get = (root: string) => this.pictures.get(root)

  ask = (root: string) => {
    if (this.pictures.has(root) || this.asking.includes(root)) return
    this.asking.push(root)
    if (this.asking.length === 1) queueMicrotask(() => void this.read())
  }

  /** A picture the window took, or none for a project that has nothing to show. */
  set(root: string, picture: ProjectPicture | null): void {
    this.asking = this.asking.filter((candidate) => candidate !== root)
    this.pictures.set(root, picture)
    this.notify()
  }

  private async read(): Promise<void> {
    const roots = this.asking.splice(0)
    if (roots.length === 0) return
    const read = await request("pictures.read", { roots }).catch((): Record<string, ProjectPicture> => ({}))
    // One taken while this was read is newer.
    for (const root of roots) if (!this.pictures.has(root)) this.pictures.set(root, read[root] ?? null)
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

export const keptPictures = new KeptPictures()

const PictureContext = createContext<PictureSource>(keptPictures)

export const PictureSourceProvider = PictureContext.Provider

/** A project's picture, once it's known to be kept; nothing while it's read, or when none is. */
export function usePicture(root: string): ProjectPicture | undefined {
  const source = useContext(PictureContext)
  const picture = useSyncExternalStore(source.subscribe, () => source.get(root))
  useEffect(() => {
    source.ask(root)
  }, [source, root])
  return picture ?? undefined
}
