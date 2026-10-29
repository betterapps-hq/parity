import { componentLibrary, extractComponent, resolveModes, uniqueId } from "@parity/core"
import { shapeIdFor } from "../canvas/CanvasEditor.tsx"
import { type ContainerEntry, containerKey } from "../design-store.ts"
import type { ProjectSession } from "../workspace.ts"

/**
 * Extracts parts of a design into a new component design in the project file, placed above everything else
 * (components on top, screens below). Throws, changing nothing, if the design wouldn't render exactly the same afterwards.
 */
export function extractIntoComponent(
  session: ProjectSession,
  entry: ContainerEntry,
  occurrences: string[],
  name: string,
  paramNames?: Record<string, string>
): string {
  const { store, editor } = session
  const entries = store.getEntries()
  const id = uniqueId(
    name,
    entries.map((candidate) => candidate.container.id)
  )
  let top = entry.container.position.y
  for (const candidate of entries) {
    const bounds = editor?.getShapePageBounds(shapeIdFor(candidate.key))
    top = Math.min(top, bounds?.minY ?? candidate.container.position.y)
  }
  const { component, design } = extractComponent(entry.container, occurrences, {
    id,
    name,
    position: { x: entry.container.position.x, y: Math.round(top - 640) },
    viewports: [...new Set(resolveModes(store.getModes()).map((mode) => mode.viewport))],
    library: componentLibrary(entries.map((candidate) => candidate.container)),
    paramNames
  })
  const path = store.mainPath
  store.change(`Extract ${name}`, (snapshot) => {
    const documents = new Map(snapshot.documents)
    const source = documents.get(entry.path)!
    documents.set(entry.path, {
      ...source,
      containers: source.containers.map((container) => (container.id === entry.container.id ? design : container))
    })
    const target = documents.get(path) ?? { version: 3, containers: [] }
    documents.set(path, { ...target, containers: [...target.containers, component] })
    return { ...snapshot, documents }
  })
  return containerKey(path, id)
}

/** Every instance of a component design, across the project's designs. */
export function instancesOf(session: ProjectSession, componentId: string): { entry: ContainerEntry; node: string }[] {
  const found: { entry: ContainerEntry; node: string }[] = []
  for (const entry of session.store.getEntries()) {
    const visit = (node: ContainerEntry["container"]["root"]) => {
      if (node.type === "instance" && node.design === componentId) found.push({ entry, node: node.id })
      if (node.type === "layout") node.children.forEach(visit)
      if (node.type === "component")
        Object.values(node.slots ?? {})
          .flat()
          .forEach(visit)
    }
    visit(entry.container.root)
  }
  return found
}
