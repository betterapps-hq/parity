import { designOwner, type NodeRef } from "@parity-app/core"
import { Box, type Editor } from "tldraw"
import { canvasIdFor } from "../canvas/CanvasEditor.tsx"
import { routePageDesign, routePageGroup, routePageGroups } from "../canvas/route-pages.ts"
import { findFrames, nodeBox } from "../frame.ts"
import type { ProjectSession } from "../workspace.ts"

/** A project's tab, whose id finds its routes' pages; a caller without one can't reveal a route. */
type Session = Pick<ProjectSession, "editor" | "selection" | "store"> & { id?: string }

/**
 * Brings the selection into view without changing the zoom unless it has to: a design that's off screen is centered,
 * a layer is scrolled to within its frame, and a route without a page of its own to its group.
 */
export function revealSelection(session: Session): void {
  const { design, node, note, refs } = session.selection.get()
  const last = refs?.at(-1)

  if (last) {
    revealRef(session, last)

    return
  }

  const key = note ?? design

  if (!key) {
    return
  }

  const layer = node && design ? layerBounds(session.editor, design, node) : undefined

  revealBounds(session.editor, layer ?? designBounds(session, key))
}

/** Brings a node into view, changing the zoom only when it has to (PAR-1092). */
export function revealRef(session: Session, ref: NodeRef): void {
  revealBounds(session.editor, refBounds(session, ref))
}

/** Frames a node on the canvas, as Zoom to selection does (PAR-1092). Gives whether the canvas draws it. */
export function zoomToRef(session: Session, ref: NodeRef): boolean {
  const bounds = refBounds(session, ref)

  if (!session.editor || !bounds) {
    return false
  }

  session.editor.zoomToBounds(bounds, { inset: 80, animation: { duration: 250 } })

  return true
}

/**
 * Where the canvas draws a node, in page coordinates: a design, a layer in its main frame, a route's page or the group
 * drawn for a route without one. Nothing for a node the canvas doesn't draw.
 */
function refBounds(session: Session, ref: NodeRef): Box | undefined {
  if (ref.type === "route") {
    if (session.id === undefined) {
      return undefined
    }

    const page = routePageDesign(session.id, ref.key)

    if (page !== undefined) {
      return designBounds(session, page)
    }

    const group = routePageGroup(session.id, ref.key)

    return group && groupBounds(session, session.id, group.key)
  }

  if (ref.owner !== designOwner) {
    return undefined
  }

  if (ref.type === "design") {
    return designBounds(session, ref.key)
  }

  // A layer's key is `designKey/layerId`, and a design's key can hold a slash too.
  for (let at = ref.key.indexOf("/"); at !== -1; at = ref.key.indexOf("/", at + 1)) {
    const design = ref.key.slice(0, at)

    if (session.store.getEntry(design)) {
      return layerBounds(session.editor, design, ref.key.slice(at + 1))
    }
  }

  return undefined
}

function designBounds(session: Session, key: string): Box | undefined {
  const record = session.editor?.getShape(canvasIdFor(key))

  return record && session.editor?.getShapePageBounds(record)
}

/** A layer's box in its design's main frame, in page coordinates. */
function layerBounds(editor: Editor | undefined, design: string, node: string): Box | undefined {
  const host = editor && findFrames(editor.getContainer(), design).find((frame) => frame.dataset.primary === "true")
  const rect = host && nodeBox(host, node)

  if (!editor || !rect) {
    return undefined
  }

  const topLeft = editor.screenToPage({ x: rect.left, y: rect.top })
  const bottomRight = editor.screenToPage({ x: rect.right, y: rect.bottom })

  return Box.FromPoints([topLeft, bottomRight])
}

/** Every page in a layout group, and the groups in it, as one box. */
function groupBounds(session: Session, project: string, key: string): Box | undefined {
  const group = routePageGroups(project).find((each) => each.key === key)

  if (!group) {
    return designBounds(session, key)
  }

  const inside = group.members.flatMap((member) => groupBounds(session, project, member) ?? [])

  return inside.length === 0 ? undefined : Box.Common(inside)
}

/** Centers a box that's off screen, zooming out only when it doesn't fit. */
function revealBounds(editor: Editor | undefined, bounds: Box | undefined): void {
  if (!editor || !bounds) {
    return
  }

  const viewport = editor.getViewportPageBounds()

  if (viewport.contains(bounds)) {
    return
  }

  if (bounds.width > viewport.width || bounds.height > viewport.height) {
    editor.zoomToBounds(bounds, { inset: 80, animation: { duration: 250 } })
  } else {
    editor.centerOnPoint(bounds.center, { animation: { duration: 250 } })
  }
}
