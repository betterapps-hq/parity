import {
  boardTarget,
  type CanvasDocument,
  deleteNode,
  type DesignNode,
  editNode,
  findNode,
  insertNode,
  locateNode,
  moveNodes,
  nodeIds,
  nodeInState,
  topmostNodes,
  withFreshIds
} from "@parity-app/core"
import { editingState } from "../chrome/LayerPanel.tsx"
import { type ContainerEntry, containerKey } from "../design-store.ts"
import { findFrames, findNodeElement, findNodeElements, nodeBox } from "../frame.ts"
import { layersSelection, selectedNodes } from "../selection.ts"
import { spacingUnit } from "../tokens-store.ts"
import type { ProjectSession } from "../workspace.ts"
import { type DropAt, DragLayouts, dropTargetAt, type MoveTarget } from "./drop-target.ts"
import { frameAt, frameScale, type Point } from "./hit.ts"
import { type DrawnSteps, shiftInsets } from "./insets.ts"
import { kindColors } from "./kinds.tsx"
import { frameDrawn } from "./nudge.ts"

/**
 * Moving layers by dragging them, on the canvas or in the Layers panel. In a layout they go wherever they're dropped,
 * between other layers or into another layout, in the same design or another. A layer placed absolutely moves by its
 * insets instead, in steps of the spacing scale.
 */

export type { MoveTarget } from "./drop-target.ts"

/** What the canvas draws while layers are dragged: where they'd go, and an outline following the pointer. */
export interface DragView {
  ghost: { x: number; y: number; w: number; h: number }
  line?: { x: number; y: number; w: number; h: number }
}

let view: DragView | undefined

export function getDragView(): DragView | undefined {
  return view
}

/** How far, in screen pixels, the pointer goes before a press becomes a drag. */
const threshold = 4

/**
 * Follows a press on selected layers. It becomes a drag once the pointer moves; released before that, `onClick` runs
 * instead. Escape cancels a drag.
 */
export function pressLayers(
  session: ProjectSession,
  area: HTMLElement,
  start: PointerEvent,
  onClick: () => void
): void {
  const current = session.selection.get()
  const entry = current.design ? session.store.getEntry(current.design) : undefined
  if (!entry) return
  const ids = topmostNodes(entry.container.root, selectedNodes(current))
    .map((node) => node.id)
    .filter((id) => id !== entry.container.root.id)
  if (ids.length === 0) return
  const host = findFrames(area, entry.key, { mode: current.mode, state: current.state })[0]
  // Everything each layer draws at its top level, so a component returning a fragment moves whole.
  const elements = host ? ids.flatMap((id) => findNodeElements(host, id)) : []
  if (!host || elements.length === 0) return
  const rects = ids.flatMap((id) => nodeBox(host, id) ?? [])
  const union = {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom))
  }
  const state = editingState(entry.container, current.state)
  const primary = findNode(entry.container.root, ids.at(-1)!)
  const absolute = ids.length === 1 && primary && nodeInState(primary, state).style?.position === "absolute"
  const origin = area.getBoundingClientRect()
  let dragging = false
  let target: MoveTarget | undefined
  let delta = { x: 0, y: 0 }

  let preview: DropPreview | undefined
  // Targets are found in the layouts as they were when the drag began, not as the preview reflows them.
  const layouts = new DragLayouts()
  let drawn: DrawnSteps | undefined

  const restore = () => {
    for (const element of elements) element.style.opacity = ""
    preview?.end()
    view = undefined
  }
  const onMove = (event: PointerEvent) => {
    delta = { x: event.clientX - start.clientX, y: event.clientY - start.clientY }
    if (!dragging) {
      if (Math.hypot(delta.x, delta.y) < threshold) return
      dragging = true
      document.body.style.cursor = "grabbing"
      if (absolute) {
        drawn = frameDrawn(area, entry.key, current, spacingUnit(session.tokens.get())).insets(ids[0]!)
        for (const element of elements) element.style.opacity = "0.35"
      } else {
        layouts.measure(host, entry.container.root)
        preview = new DropPreview(elements)
      }
    }
    event.preventDefault()
    const ghost = {
      x: union.left + delta.x - origin.left,
      y: union.top + delta.y - origin.top,
      w: union.right - union.left,
      h: union.bottom - union.top
    }
    if (absolute) {
      view = { ghost }
      return
    }
    const found = moveTarget(area, session, { x: event.clientX, y: event.clientY }, entry, ids, layouts)
    target = found?.target
    // The layouts reflow around a copy of the layers where they'd land; the line is only for when they can't.
    const shown = found ? preview!.show(found.host, found.target, found.siblings) : (preview!.clear(), false)
    view = {
      ghost,
      ...(found && !shown
        ? { line: { ...found.line, x: found.line.x - origin.left, y: found.line.y - origin.top } }
        : {})
    }
  }
  const finish = (drop: boolean) => {
    window.removeEventListener("pointermove", onMove, true)
    window.removeEventListener("pointerup", onUp, true)
    window.removeEventListener("keydown", onKey, true)
    document.body.style.cursor = ""
    restore()
    if (!dragging) {
      if (drop) onClick()
      return
    }
    if (!drop) return
    if (absolute)
      nudgeAbsolute(session, entry, ids[0]!, delta, frameScale(host) * (session.editor?.getZoomLevel() ?? 1), drawn)
    else if (target) moveLayers(session, entry, ids, target)
  }
  const onUp = () => finish(true)
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return
    event.preventDefault()
    event.stopImmediatePropagation()
    finish(false)
  }
  window.addEventListener("pointermove", onMove, true)
  window.addEventListener("pointerup", onUp, true)
  window.addEventListener("keydown", onKey, true)
}

/**
 * Where layers dropped at a point would go: in the frame under it, the layout and the slot under the point, by the
 * layouts as they were when the drag began (see `dropTargetAt`). The line to draw is in client coordinates.
 */
export function moveTarget(
  area: ParentNode,
  session: ProjectSession,
  point: Point,
  source: ContainerEntry,
  ids: readonly string[],
  layouts: DragLayouts
): DropAt | undefined {
  const frame = frameAt(area, session.store, point, session.editor)
  return frame && dropTargetAt(layouts, frame.entry, frame.host, point, source.key, ids)
}

/**
 * Shows where dragged layers would land, before anything changes: the layers are hidden where they are, and faded
 * copies of them go where they'd be dropped, so every layout around them reflows exactly as it will. The copies are
 * plain DOM, outside React, and gone before the move is made.
 */
class DropPreview {
  private readonly templates: HTMLElement[]
  private readonly displays: string[]
  private copies: HTMLElement[] = []
  private at = ""

  constructor(private readonly originals: HTMLElement[]) {
    this.templates = originals.map((original) => {
      const copy = original.cloneNode(true) as HTMLElement
      // Copies aren't layers: hit testing and outlines must not find them.
      for (const element of [copy, ...copy.querySelectorAll<HTMLElement>("[data-canvas-node]")]) {
        element.removeAttribute("data-canvas-node")
      }
      copy.dataset.dropPreview = ""
      copy.style.opacity = "0.55"
      copy.style.outline = `1.5px dashed ${kindColors.layer}`
      copy.style.outlineOffset = "1px"
      copy.style.pointerEvents = "none"
      return copy
    })
    this.displays = originals.map((original) => original.style.getPropertyValue("display"))
    for (const original of originals) original.style.setProperty("display", "none", "important")
  }

  /** Puts the copies at a target. Returns false when the layout isn't in the frame, so nothing could be shown. */
  show(host: HTMLElement, target: MoveTarget, siblings: readonly string[]): boolean {
    const key = `${host.dataset.design}:${host.dataset.mode}:${host.dataset.state}:${target.parent}:${target.index}`
    if (key === this.at) return true
    this.clear()
    const parent = findNodeElement(host, target.parent)
    if (!parent) return false
    const before = siblings
      .slice(target.index)
      .map((id) => findNodeElement(host, id))
      .find((element) => element && element.parentElement === parent && !this.originals.includes(element))
    this.copies = this.templates.map((template) => template.cloneNode(true) as HTMLElement)
    for (const copy of this.copies) parent.insertBefore(copy, before ?? null)
    this.at = key
    return true
  }

  clear(): void {
    for (const copy of this.copies) copy.remove()
    this.copies = []
    this.at = ""
  }

  end(): void {
    this.clear()
    this.originals.forEach((original, index) => {
      const display = this.displays[index]
      if (display) original.style.setProperty("display", display)
      else original.style.removeProperty("display")
    })
  }
}

/**
 * Moves layers to a target as one undo step. Within a design they keep their ids, and every state's changes to them;
 * into another design they go as they're shown, with fresh ids.
 */
export function moveLayers(
  session: ProjectSession,
  source: ContainerEntry,
  ids: readonly string[],
  target: MoveTarget
): void {
  const { store, selection } = session
  const frame = { mode: selection.get().mode, state: selection.get().state }
  const label = ids.length === 1 ? "Move layer" : `Move ${ids.length} layers`
  if (target.design === source.key) {
    const before = JSON.stringify(source.container.root)
    let moved = source.container.root
    try {
      moved = moveNodes(source.container.root, ids, target.parent, { index: target.index, slot: target.slot })
    } catch {
      return
    }
    if (JSON.stringify(moved) === before) return
    store.updateContainer(source.key, label, (container) => ({
      ...container,
      root: moveNodes(container.root, ids, target.parent, { index: target.index, slot: target.slot })
    }))
    selection.set(layersSelection(source.key, [...ids], frame))
    return
  }
  const destination = store.getEntry(target.design)
  if (!destination) return
  const state = editingState(source.container, frame.state)
  const taken = nodeIds(destination.container.root)
  const copies: DesignNode[] = topmostNodes(source.container.root, ids).map((node) =>
    withFreshIds(shown(node, state), taken)
  )
  store.change(label, (snapshot) => {
    const documents = new Map(snapshot.documents)
    const update = (entry: ContainerEntry, change: (container: typeof entry.container) => typeof entry.container) => {
      const document: CanvasDocument | undefined = documents.get(entry.path)
      if (!document) return
      const containers = document.containers.map((container) =>
        container.id === entry.container.id ? change(container) : container
      )
      documents.set(entry.path, { ...document, containers })
    }
    update(source, (container) =>
      ids.reduce((next, id) => (findNode(next.root, id) ? deleteNode(next, id) : next), container)
    )
    update(destination, (container) => {
      let root = container.root
      for (const [offset, copy] of copies.entries()) {
        root = insertNode(root, target.parent, copy, { index: target.index + offset, slot: target.slot })
      }
      return { ...container, root }
    })
    return { ...snapshot, documents }
  })
  selection.set(
    layersSelection(
      containerKey(destination.path, destination.container.id),
      copies.map((copy) => copy.id)
    )
  )
}

/** A node and what's inside it as a state shows them, for moving it to a design that doesn't have that state. */
function shown(node: DesignNode, state: ReturnType<typeof editingState>): DesignNode {
  const next = nodeInState(node, state)
  if (next.type === "layout") return { ...next, children: next.children.map((child) => shown(child, state)) }
  if (next.type === "component" && next.slots) {
    const slots = Object.fromEntries(
      Object.entries(next.slots).map(([slot, nodes]) => [slot, nodes.map((child) => shown(child, state))])
    )
    return { ...next, slots }
  }
  return next
}

/**
 * Moves an absolutely placed layer by its insets, in half steps of the spacing scale, keeping both sides, negative
 * insets and tokens, as nudging does (see `shiftInsets`). `delta` is in screen pixels, `scale` is screen pixels per
 * layout pixel, and `drawn` is where its sides were drawn when the drag began.
 */
function nudgeAbsolute(
  session: ProjectSession,
  entry: ContainerEntry,
  id: string,
  delta: { x: number; y: number },
  scale: number,
  drawn: DrawnSteps | undefined
): void {
  const unit = spacingUnit(session.tokens.get())
  const state = editingState(entry.container, session.selection.get().state)
  const location = locateNode(entry.container.root, id)
  if (!location) return
  const style = nodeInState(location.node, state).style ?? {}
  const steps = (px: number) => Math.round((px / scale / unit) * 2) / 2
  const { change } = shiftInsets(style, steps(delta.x), steps(delta.y), drawn)
  if (Object.keys(change).length === 0) return
  session.store.updateContainer(entry.key, "Move layer", (container) =>
    editNode(container, boardTarget(container, state.id), id, { style: change })
  )
}
