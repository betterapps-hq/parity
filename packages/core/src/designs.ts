import { type CanvasDocument, type ContainerSpec, formatVersion } from "./document.ts"

/** A project file with nothing in it yet, in the current format. */
export function emptyDocument(): CanvasDocument {
  return { version: formatVersion, containers: [] }
}

/**
 * The file with `designs` added after the ones it has, which the Layers panel lists last. A file the project doesn't
 * have yet starts empty.
 */
export function addDesigns(document: CanvasDocument | undefined, designs: readonly ContainerSpec[]): CanvasDocument {
  const file = document ?? emptyDocument()

  return designs.length === 0 ? file : { ...file, containers: [...file.containers, ...designs] }
}

/**
 * The file without the designs `ids`, and the same file when it has none of them. Nothing else changes: an instance of
 * a component taken out stays where it's placed and shows as missing, and a link to a design taken out stays saved.
 */
export function removeDesigns(document: CanvasDocument, ids: Iterable<string>): CanvasDocument {
  const removed = new Set(ids)
  const containers = document.containers.filter((container) => !removed.has(container.id))

  return containers.length === document.containers.length ? document : { ...document, containers }
}
