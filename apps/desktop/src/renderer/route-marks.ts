import { type CanvasDocument, emptyDocument, markedRoutes, type ProjectRoute, type RouteMark } from "@parity-app/core"
import { applyDocuments, type ProjectDoc } from "@parity-app/multiplayer"
import { useMemo, useSyncExternalStore } from "react"

/**
 * The person's marks on the project's routes (PAR-1175, PAR-1176): a page Parity couldn't tell draws nothing marked as
 * an API route, or an API route the app gives a page while it runs marked as a page. They're kept in the project's
 * main file, by route id, so they hold for everyone on the project, and each is an undo step.
 */

/** The marks the project's main file keeps, by route id. */
function marksOf(doc: ProjectDoc): CanvasDocument["routeKinds"] {
  return doc.file(doc.main)?.routeKinds
}

/** The project's routes as Parity read them, with the person's marks, following the main file as it changes. */
export function useMarkedRoutes(doc: ProjectDoc, routes: readonly ProjectRoute[]): ProjectRoute[] {
  const subscribe = useMemo(() => (listener: () => void) => doc.subscribe(() => listener()), [doc])
  const marks = useSyncExternalStore(subscribe, () => marksOf(doc))

  return useMemo(() => markedRoutes(routes, marks), [routes, marks])
}

/**
 * Marks a route as an API route or as a page, as one undo step. Marking it as what Parity reads it as takes the mark
 * away, so it follows the code again.
 */
export function markRoute(doc: ProjectDoc, read: ProjectRoute, mark: RouteMark): void {
  const main = doc.file(doc.main) ?? emptyDocument()
  const marks = { ...main.routeKinds }

  if (mark === read.kind) {
    delete marks[read.id]
  } else {
    marks[read.id] = mark
  }

  const document: CanvasDocument = { ...main, routeKinds: marks }

  if (Object.keys(marks).length === 0) {
    delete document.routeKinds
  }

  applyDocuments(doc, mark === "api" ? "Mark as API route" : "Mark as page", [{ path: doc.main, document }], {
    origin: "edit"
  })
}
