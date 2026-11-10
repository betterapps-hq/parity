import { type ConnectorInfo, type Found, offered, type Searched } from "@parity-app/connectors"
import { generateId } from "@parity-app/core"
import {
  type Bounds,
  type ReferenceAnchor,
  type ReferenceSearch,
  referenceBounds,
  referenceFrom,
  referenceRow,
  referenceSearch,
  referenceSize
} from "@parity-app/editor"
import { canvasIdFor } from "../canvas/CanvasEditor.tsx"
import { containerModes } from "../canvas/view.ts"
import { openLibraryBrowser } from "../library/library-browser.ts"
import type { ProjectSession } from "../workspace.ts"

/*
 * Find references (PAR-840): the library browser on the library that finds screens from real apps, for the selected
 * design when there is one, and what's picked placed in a row beside it on the canvas, to look at and never in it.
 */

/** The library Find references searches: the first offered connector that finds screens. */
export const referenceLibrary: ConnectorInfo | undefined = offered.find(({ info }) =>
  info.finds.includes("screens")
)?.info

/** The selected design Find references searches for, if one is selected. */
function selectedDesign(session: ProjectSession) {
  const { design } = session.selection.get()

  return design ? session.store.getEntry(design) : undefined
}

/**
 * Opens the library browser on the reference library: on the selected design's name when one is selected, or on the
 * recent searches when none is, or on `search` when it's given, as More from an app does. What's picked lands beside
 * the design that was selected as it opened.
 */
export function findReferences(session: ProjectSession, search?: ReferenceSearch): void {
  const library = referenceLibrary

  if (!library) {
    return
  }

  const target = selectedDesign(session)

  const opening: ReferenceSearch | undefined =
    search ??
    (target
      ? referenceSearch(target.container.name, containerModes(session.store.getModes(), target.container).primary.width)
      : undefined)

  const searched: Searched | undefined = opening && { query: opening.query, filters: { ...opening.filters } }

  openLibraryBrowser({
    library,
    search: searched,
    pick: {
      label: (count) => (count === 0 ? "Place on canvas" : `Place ${count} on canvas`),
      accepts: (found) => found.kind === "screens",
      take: (picked, foundWith) => placeReferences(session, picked, target?.key, foundWith)
    }
  })
}

/** The box a design's board takes on the canvas, once the canvas has drawn it. */
function designBounds(session: ProjectSession, key: string): Bounds | undefined {
  const box = session.editor?.getShapePageBounds(canvasIdFor(key))

  return box && { minX: box.minX, minY: box.minY, maxX: box.maxX, maxY: box.maxY }
}

/**
 * Places screens on the canvas as references, as one step: in a row beside the design they were found for (by key), or
 * in the middle of the view without one, under any batch already there, each with the description that found it. The
 * design's file keeps them, or the project's main file without one. The canvas fits them in, and the last is selected.
 */
export function placeReferences(
  session: ProjectSession,
  picked: readonly Found[],
  design?: string,
  foundWith: ReadonlyMap<string, string> = new Map()
): void {
  const { store, editor, selection } = session

  if (picked.length === 0) {
    return
  }

  const entry = design ? store.getEntry(design) : undefined
  const beside = entry && designBounds(session, entry.key)
  const center = editor?.getViewportPageBounds().center ?? { x: 0, y: 0 }
  const anchor: ReferenceAnchor = beside ? { beside } : { around: { x: center.x, y: center.y } }

  const taken = new Set(store.getReferences().map(({ reference }) => reference.id))

  const placed = store.getReferences().map(({ reference }) => referenceBounds(reference))
  const sizes = picked.map((found) => referenceSize({ platform: found.platform, image: found.image }))
  const points = referenceRow(anchor, sizes, placed, othersOnCanvas(session))

  const positioned = picked.map((found, index) => {
    const id = generateId(taken)
    taken.add(id)

    return referenceFrom(found, id, points[index]!, { query: foundWith.get(found.id) })
  })

  const label = positioned.length === 1 ? `Place ${positioned[0]!.app}` : `Place ${positioned.length} references`
  const keys = store.addReferences(entry?.path ?? store.mainPath, positioned, label)

  selection.set({ reference: keys.at(-1) })
  fitIn(session, [...(beside ? [beside] : []), ...positioned.map(referenceBounds)])
}

/** The boxes of everything on the canvas but references, as designs and notes, which a row of references keeps clear of. */
function othersOnCanvas(session: ProjectSession): Bounds[] {
  const { editor } = session

  return (editor?.getCurrentPageShapes() ?? []).flatMap((item) => {
    const box = item.type === "canvas-reference" ? undefined : editor?.getShapePageBounds(item.id)

    return box ? [{ minX: box.minX, minY: box.minY, maxX: box.maxX, maxY: box.maxY }] : []
  })
}

/** Moves the camera to show every box, as the canvas fits placed references in. */
function fitIn(session: ProjectSession, boxes: readonly Bounds[]): void {
  const { editor } = session

  if (!editor || boxes.length === 0) {
    return
  }

  const minX = Math.min(...boxes.map((box) => box.minX))
  const minY = Math.min(...boxes.map((box) => box.minY))
  const maxX = Math.max(...boxes.map((box) => box.maxX))
  const maxY = Math.max(...boxes.map((box) => box.maxY))

  editor.zoomToBounds({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }, { inset: 80, animation: { duration: 320 } })
}
