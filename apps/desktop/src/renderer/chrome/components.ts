import { resolveModes } from "@parity-app/core"
import { aboveEverything, makeComponent } from "@parity-app/editor"
import { shapeIdFor } from "../canvas/CanvasEditor.tsx"
import { type ContainerEntry, containerKey } from "../design-store.ts"
import type { ProjectSession } from "../workspace.ts"

/**
 * Extracts parts of a design into a new component design in the project file, placed above everything else
 * (components on top, screens below). Throws, changing nothing, if the design wouldn't render exactly the same
 * afterwards. The rules are `@parity-app/editor`'s; this measures the designs on the canvas and applies them to the
 * store.
 */
export function extractIntoComponent(
  session: ProjectSession,
  entry: ContainerEntry,
  occurrences: string[],
  name: string,
  paramNames?: Record<string, string>
): string {
  const { store, editor } = session
  const position = aboveEverything(
    entry.container.position,
    store.getEntries().map((candidate) => ({
      position: candidate.container.position,
      bounds: editor?.getShapePageBounds(shapeIdFor(candidate.key))
    }))
  )
  const viewports = [...new Set(resolveModes(store.getModes()).map((mode) => mode.viewport))]
  const path = store.mainPath
  let id = ""
  store.change(`Extract ${name}`, (snapshot) => {
    const made = makeComponent(snapshot.documents, { path: entry.path, id: entry.container.id }, occurrences, {
      name,
      into: path,
      position,
      viewports,
      paramNames
    })
    id = made.id
    return { ...snapshot, documents: made.documents }
  })
  return containerKey(path, id)
}
