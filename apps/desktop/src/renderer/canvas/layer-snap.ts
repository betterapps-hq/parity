import { childEntries, type ContainerSpec, locateNode } from "@parity-app/core"
import {
  type Edge,
  type LayerSnapped,
  lockedEdgeMoves,
  resizedBox,
  resizeEdges,
  type LayerSnapScene,
  type SnapBox,
  type SnapEdges,
  type SnapGuide,
  type SnapPoint,
  type SnapSpacing,
  snapLayer,
  snaps
} from "@parity-app/editor"
import type { Editor, GapsSnapIndicator, PointsSnapIndicator } from "tldraw"
import { getPreferences } from "../chrome/preferences.ts"
import { findNodeElement, nodeBox } from "../frame.ts"
import { clearSnaps } from "./snap.ts"

/**
 * Snapping a layer as it's moved or resized, by `@parity-app/editor`'s `snapLayer`: this measures what it snaps to
 * when the gesture begins, and shows where it locks, the guides and spacing marks as tldraw's snap indicators, the same
 * red lines a dragged design shows, and the distances on the overlay as Alt's redlines are drawn.
 */

/** A distance shown while a layer snaps: the line in client pixels, and its length in the frame's own pixels. */
export interface SnapMeasure {
  from: SnapPoint
  to: SnapPoint
  length: number
}

let measures: SnapMeasure[] = []

/** The distances to draw for the layer snapping now, if any. */
export function getSnapMeasures(): readonly SnapMeasure[] {
  return measures
}

/** A layer's snapping through one gesture, in the frame's own pixels from its top left. */
export class LayerSnapping {
  private constructor(
    private readonly editor: Editor | undefined,
    private readonly host: HTMLElement,
    /** Screen pixels per pixel of the frame. */
    private readonly scale: number,
    /** The layer's box when the gesture began. */
    readonly box: SnapBox,
    private readonly scene: LayerSnapScene
  ) {}

  /**
   * Measures, in the frame `host` draws at `scale`, the layer's box, the boxes of its siblings that are drawn, and the
   * box its insets count from: its containing block inside the border.
   */
  static measure(
    editor: Editor | undefined,
    host: HTMLElement,
    container: ContainerSpec,
    layer: string,
    scale: number
  ): LayerSnapping | undefined {
    const location = locateNode(container.root, layer)
    const parent = location?.ancestors.at(-1)
    const element = findNodeElement(host, layer)
    const around = element?.offsetParent
    const own = nodeBox(host, layer)
    if (!location || !parent || !own || !(around instanceof HTMLElement)) return undefined
    const origin = host.getBoundingClientRect()
    const toBox = (rect: DOMRect): SnapBox => ({
      x: (rect.left - origin.left) / scale,
      y: (rect.top - origin.top) / scale,
      w: rect.width / scale,
      h: rect.height / scale
    })
    const siblings = (childEntries(parent).find((entry) => entry.slot === location.slot)?.nodes ?? [])
      .filter((node) => node.id !== layer)
      .flatMap((node) => {
        const rect = nodeBox(host, node.id)
        return rect && (rect.width > 0 || rect.height > 0) ? [toBox(rect)] : []
      })
    const style = getComputedStyle(around)
    // The border is in the frame's own pixels, as the boxes are.
    const border = (side: string) => parseFloat(style.getPropertyValue(`border-${side}-width`)) || 0
    const outer = toBox(around.getBoundingClientRect())
    const inner = {
      x: outer.x + border("left"),
      y: outer.y + border("top"),
      w: outer.w - border("left") - border("right"),
      h: outer.h - border("top") - border("bottom")
    }
    const snapping = new LayerSnapping(editor, host, scale, toBox(own), { siblings, parent: inner })
    snapping.clearWhenDone()
    return snapping
  }

  /**
   * Where the layer goes for a pointer at `box`, snapped, with the guides, spacing marks and distances shown. Unsnapped,
   * with nothing shown, when snapping is turned off or Ctrl (Cmd on a Mac) is held.
   */
  snap(box: SnapBox, held: { ctrlKey: boolean; metaKey: boolean }, edges?: SnapEdges): LayerSnapped | undefined {
    if (!snaps(held, getPreferences().snapping)) {
      this.clear()
      return undefined
    }
    const snapped = snapLayer(box, this.scene, this.scale, edges)
    const origin = this.host.getBoundingClientRect()
    const client = (point: SnapPoint) => ({
      x: origin.left + point.x * this.scale,
      y: origin.top + point.y * this.scale
    })
    measures = snapped.distances.map(({ from, to, length }) => ({ from: client(from), to: client(to), length }))
    const editor = this.editor
    if (editor) {
      const page = (point: SnapPoint) => editor.screenToPage(client(point))
      const line = (guide: SnapGuide): PointsSnapIndicator => ({
        id: `layer-snap-${guide.axis}`,
        type: "points",
        points: [page(guide.from), page(guide.to)]
      })
      const marks = (spacing: SnapSpacing): GapsSnapIndicator => ({
        id: `layer-spacing-${spacing.axis}`,
        type: "gaps",
        direction: spacing.axis === "x" ? "horizontal" : "vertical",
        gaps: spacing.gaps.map((gap) => ({
          startEdge: [page(gap.start[0]), page(gap.start[1])],
          endEdge: [page(gap.end[0]), page(gap.end[1])]
        }))
      })
      editor.snaps.setIndicators([...snapped.guides.map(line), ...snapped.spacing.map(marks)])
    }
    return snapped
  }

  /**
   * For a resize by `edge`'s handle with the pointer moved `delta` screen pixels: how far each dragged edge that locks
   * moves, in the frame's pixels, with the guides and distances shown.
   */
  resize(edge: Edge, delta: SnapPoint, held: { ctrlKey: boolean; metaKey: boolean }): { x?: number; y?: number } {
    const edges = resizeEdges(edge)
    const box = resizedBox(this.box, edges, { x: delta.x / this.scale, y: delta.y / this.scale })
    const snapped = this.snap(box, held, edges)
    return snapped ? lockedEdgeMoves(this.box, snapped, edges) : {}
  }

  /**
   * Takes the guides away when the pointer is released or Escape is pressed, for a gesture that doesn't say when it
   * ends. Listening from before the gesture's own listeners, it hears Escape before they stop it.
   */
  private clearWhenDone(): void {
    const end = () => {
      window.removeEventListener("pointerup", end, true)
      window.removeEventListener("pointercancel", end, true)
      window.removeEventListener("keydown", onKey, true)
      this.clear()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") end()
    }
    window.addEventListener("pointerup", end, true)
    window.addEventListener("pointercancel", end, true)
    window.addEventListener("keydown", onKey, true)
  }

  /** Takes the guides and distances away, when the gesture ends or moves freely. */
  clear(): void {
    measures = []
    if (this.editor) clearSnaps(this.editor)
  }
}
