import {
  boardTarget,
  type ContainerSpec,
  editNode,
  findNode,
  locateNode,
  type NodeStyle,
  topmostNodes
} from "@parity-app/core"
import {
  absoluteDrag,
  boardReader,
  moveLayersAcross,
  moveLayersWithin,
  type MoveTarget,
  layersSelection,
  selectedNodes
} from "@parity-app/editor"
import { type ContainerEntry, containerKey } from "../design-store.ts"
import { findFrames, findNodeElement, findNodeElements, nodeBox } from "../frame.ts"
import { spacingUnit } from "../tokens-store.ts"
import type { ProjectSession } from "../workspace.ts"
import { type DropAt, DragLayouts, dropInFrame } from "./drop-target.ts"
import { areaSpace, frameGeometry } from "./frame-geometry.ts"
import { type Drag, followPress, gestures } from "./gesture.ts"
import { frameAt, type Point } from "./hit.ts"
import { kindColors } from "./kinds.tsx"
import { insetSteps } from "./layer-measure.ts"
import { LayerSnapping } from "./layer-snap.ts"
import { StylePreview } from "./style-preview.ts"

/**
 * Moving layers by dragging them, on the canvas or in the Layers panel. In a layout they go wherever they're dropped,
 * between other layers or into another layout, in the same design or another. A layer placed absolutely moves live by
 * its insets instead, snapping to its siblings and its parent. Where they land and how they move are
 * `@parity-app/editor`'s (`dropTargetAt`, `moveLayersWithin`, `moveLayersAcross`, `absoluteDrag`); this follows the
 * pointer, measures the frames, shows the
 * preview and applies the move to the store and the selection.
 */

export type { MoveTarget } from "@parity-app/editor"

/**
 * What the canvas draws while layers are dragged: where they'd go, and an outline following the pointer. An absolutely
 * placed layer moves itself, so it has neither.
 */
export interface DragView {
  ghost?: { x: number; y: number; w: number; h: number }
  line?: { x: number; y: number; w: number; h: number }
}

let view: DragView | undefined

export function getDragView(): DragView | undefined {
  return view
}

/**
 * Follows a press on selected layers. It becomes a drag once the pointer moves; released before that, `onClick` runs
 * instead. Escape cancels a drag, and so does the pointer being cancelled or the window losing focus: in a layout
 * nothing has moved yet, and an absolutely placed layer goes back (see `gestures.layerDrag` and
 * `gestures.absoluteDrag`).
 */
export function pressLayers(
  session: ProjectSession,
  area: HTMLElement,
  start: PointerEvent,
  onClick: () => void
): void {
  const current = session.selection.get()
  const entry = current.design ? session.store.getEntry(current.design) : undefined

  if (!entry) {
    return
  }

  const ids = topmostNodes(entry.container.root, selectedNodes(current))
    .map((node) => node.id)
    .filter((id) => id !== entry.container.root.id)

  if (ids.length === 0) {
    return
  }

  const host = findFrames(area, entry.key, { mode: current.mode, state: current.state })[0]
  // Everything each layer draws at its top level, so a component returning a fragment moves whole.
  const elements = host ? ids.flatMap((id) => findNodeElements(host, id)) : []

  if (!host || elements.length === 0) {
    return
  }

  const rects = ids.flatMap((id) => nodeBox(host, id) ?? [])

  const union = {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom))
  }

  const edited = session.store.editFrame(current)

  if (!edited) {
    return
  }

  const { state, viewport } = edited
  const primary = findNode(entry.container.root, ids.at(-1)!)

  const absolute =
    ids.length === 1 &&
    primary &&
    boardReader(entry.container, { state, viewport })(primary).style?.position === "absolute"

  const space = areaSpace(area)
  let target: MoveTarget | undefined

  let preview: DropPreview | undefined
  // Targets are found in the layouts as they were when the drag began, not as the preview reflows them.
  const layouts = new DragLayouts()
  let placed: ReturnType<typeof followAbsolute>
  // Dropped into another design, the layers change that one too.
  const moves = { designs: [entry.key], layers: ids }

  followPress(absolute ? gestures.absoluteDrag : gestures.layerDrag, session.store, start, {
    design: absolute ? entry.key : undefined,
    moves,
    cursor: "grabbing",
    start(drag) {
      if (absolute) {
        placed = followAbsolute(session, entry, ids[0]!, host, drag)
      } else {
        layouts.measure(host, entry.container.root)
        preview = new DropPreview(elements)
      }
    },
    move(event) {
      const delta = { x: event.clientX - start.clientX, y: event.clientY - start.clientY }

      if (absolute) {
        placed?.move(delta, event)
        view = {}

        return
      }

      const ghost = space.box({
        left: union.left + delta.x,
        top: union.top + delta.y,
        right: union.right + delta.x,
        bottom: union.bottom + delta.y
      })

      const found = moveTarget(area, session, { x: event.clientX, y: event.clientY }, entry, ids, layouts)
      target = found?.target
      // The layouts reflow around a copy of the layers where they'd land; the line is only for when they can't.
      const shown = found ? preview!.show(found.host, found.target, found.siblings) : (preview!.clear(), false)
      view = { ghost }

      if (found && !shown) {
        view.line = { ...found.line, ...space.point(found.line) }
      }
    },
    // Dropped, layers in a layout move, and so does an absolutely placed layer, which was previewed as it moved.
    end(kept, drag) {
      preview?.end()
      view = undefined
      placed?.end(kept)

      if (!kept || absolute || !target) {
        return
      }

      if (moveLayers(session, entry, ids, target, drag.gesture) && target.design !== entry.key) {
        moves.designs.push(target.design)
      }
    },
    click: onClick
  })
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

  return frame && dropInFrame(layouts, frame.entry, frame.host, point, source.key, ids)
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
      // SAFETY: a deep clone of an element is an element of the same kind.
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

    for (const original of originals) {
      original.style.setProperty("display", "none", "important")
    }
  }

  /** Puts the copies at a target. Returns false when the layout isn't in the frame, so nothing could be shown. */
  show(host: HTMLElement, target: MoveTarget, siblings: readonly string[]): boolean {
    const key = `${host.dataset.design}:${host.dataset.mode}:${host.dataset.state}:${target.parent}:${target.index}`

    if (key === this.at) {
      return true
    }

    this.clear()
    const parent = findNodeElement(host, target.parent)

    if (!parent) {
      return false
    }

    const before = siblings
      .slice(target.index)
      .map((id) => findNodeElement(host, id))
      .find((element) => element && element.parentElement === parent && !this.originals.includes(element))

    // SAFETY: a deep clone of an element is an element of the same kind.
    this.copies = this.templates.map((template) => template.cloneNode(true) as HTMLElement)

    for (const copy of this.copies) {
      parent.insertBefore(copy, before ?? null)
    }

    this.at = key

    return true
  }

  clear(): void {
    for (const copy of this.copies) {
      copy.remove()
    }

    this.copies = []
    this.at = ""
  }

  end(): void {
    this.clear()
    this.originals.forEach((original, index) => {
      const display = this.displays[index]

      if (display) {
        original.style.setProperty("display", display)
      } else {
        original.style.removeProperty("display")
      }
    })
  }
}

/**
 * Moves layers to a target as one undo step, in the drag's gesture when given. Within a design they keep their ids,
 * and every state's changes to them; into another design they go as they're shown, with fresh ids. Returns whether
 * they moved.
 */
export function moveLayers(
  session: ProjectSession,
  source: ContainerEntry,
  ids: readonly string[],
  target: MoveTarget,
  gesture?: string
): boolean {
  const { store, selection } = session
  const frame = { mode: selection.get().mode, state: selection.get().state }
  const label = ids.length === 1 ? "Move layer" : `Move ${ids.length} layers`

  if (target.design === source.key) {
    if (moveLayersWithin(source.container, ids, target) === source.container) {
      return false
    }

    store.updateContainer(source.key, label, (container) => moveLayersWithin(container, ids, target), { gesture })
    selection.set(layersSelection(source.key, [...ids], frame))

    return true
  }

  const destination = store.getEntry(target.design)

  if (!destination) {
    return false
  }

  const edited = store.editFrame({ design: source.key, ...frame })

  if (!edited) {
    return false
  }

  const { state, viewport } = edited
  let copies: string[] = []
  store.updateContainers(
    [source.key, destination.key],
    label,
    ([from, to]) => {
      const moved = moveLayersAcross(from!, to!, ids, target, state, viewport)
      copies = moved.copies

      return [moved.source, moved.destination]
    },
    { gesture }
  )

  if (copies.length === 0) {
    return false
  }

  selection.set(layersSelection(containerKey(destination.path, destination.container.id), copies))

  return true
}

/**
 * Moves an absolutely placed layer as the pointer moves, by the insets `@parity-app/editor`'s `absoluteDrag` gives,
 * snapping to its siblings and its parent as `LayerSnapping` measured them. While it's dragged the move is previewed
 * on the frames' elements (`StylePreview`), and the design is written once, when it's dropped (PAR-551): one undo
 * step, and nothing to undo when it ends where it began or Escape calls it off. A component that doesn't draw the
 * styles it's given on its root can't be previewed (CAN-45), so it's written as it moves instead, in the drag's
 * gesture, which Escape takes back.
 */
function followAbsolute(
  session: ProjectSession,
  entry: ContainerEntry,
  id: string,
  host: HTMLElement,
  drag: Drag
): { move(delta: Point, held: { ctrlKey: boolean; metaKey: boolean }): void; end(kept: boolean): void } | undefined {
  const { store, editor } = session
  const current = session.selection.get()
  const unit = spacingUnit(session.tokens.get())
  const edited = store.editFrame(current)
  const location = locateNode(entry.container.root, id)

  if (!location || !edited) {
    return undefined
  }

  const { state, viewport } = edited
  // The scale, where the layer's sides are drawn and what it snaps to, all read from the frame as it's drawn now.
  const frame = frameGeometry(host)
  const { scale } = frame
  const insets = frame.node(id)?.insets
  const snapping = LayerSnapping.measure(editor, frame, entry.container, id)

  const follow = absoluteDrag({
    style: boardReader(entry.container, { state, viewport })(location.node).style ?? {},
    // Where its sides are drawn, for those set by a token or not at all.
    drawn: insets && insetSteps(insets, unit),
    unit,
    scale,
    snapping
  })

  const moved = (style: NodeStyle) => (container: ContainerSpec) =>
    editNode(container, boardTarget(container, state.id), id, { style })

  const write = (style: NodeStyle) =>
    store.updateContainer(entry.key, "Move layer", moved(style), { gesture: drag.gesture })

  const preview = new StylePreview(session, entry.key)
  // Whether the move is written as it goes, for a layer the preview can't show.
  let live = false
  let shown: NodeStyle = {}

  return {
    move(delta, held) {
      const { change, snapped } = follow({ dx: delta.x, dy: delta.y, snaps: snapping?.snaps(held) ?? false })
      snapping?.show(snapped)

      if (JSON.stringify(change) === JSON.stringify(shown)) {
        return
      }

      const moving = Object.keys(change).length > 0

      if (live) {
        // A side moved back to where it began goes back to what was written, which only the drag's checkpoint has.
        if (Object.keys(shown).some((side) => !(side in change))) {
          drag.revert()
        }

        if (moving) {
          write(change)
        }
      } else {
        preview.show(moving ? moved(change) : (container) => container)
        live = moving && !preview.active

        if (live) {
          write(change)
        }
      }

      shown = change
    },
    end(kept) {
      snapping?.clear()
      const moving = Object.keys(shown).length > 0

      if (live || !kept || !moving) {
        preview.cancel()

        return
      }

      // The frames already show the move, so they're left as they are while the design draws it.
      preview.settle(moved(shown))
      write(shown)
    }
  }
}
