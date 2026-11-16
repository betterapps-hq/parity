import { resolveModes } from "@parity-app/core"
import { aboveEverything, makeComponent } from "@parity-app/editor"
import { type ContainerEntry, changeSnapshot, containerEntries, designKey } from "@parity-app/multiplayer"
import { canvasIdFor } from "../canvas/CanvasEditor.tsx"
import type { ProjectSession } from "../workspace.ts"
import { recordComponentChange } from "./component-events.ts"

/**
 * Extracts parts of a design into a new component design in the project file, placed above everything else
 * (components on top, screens below). Throws, changing nothing, if the design wouldn't render exactly the same
 * afterwards. The rules are `@parity-app/editor`'s; this measures the designs on the canvas and applies them to the
 * document, and records it as `component.changed` (PAR-728).
 */
export function extractIntoComponent(
  session: Pick<ProjectSession, "editor" | "doc">,
  entry: ContainerEntry,
  occurrences: string[],
  name: string,
  paramNames?: Record<string, string>
): string {
  const { doc, editor } = session

  const position = aboveEverything(
    entry.container.position,
    containerEntries(doc).map((candidate) => ({
      position: candidate.container.position,
      bounds: editor?.getShapePageBounds(canvasIdFor(candidate.key))
    }))
  )

  const viewports = [...new Set(resolveModes(doc.modes()).map((mode) => mode.viewport))]
  const path = doc.main
  let id = ""
  changeSnapshot(doc, `Extract ${name}`, (snapshot) => {
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
  recordComponentChange("extract", entry.key, occurrences, id)

  return designKey(path, id)
}
