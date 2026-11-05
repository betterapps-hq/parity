import { childEntries, type ContainerSpec, locateNode } from "@parity-app/core"
import {
  type LayerSnapped,
  type LayerSnapScene,
  type LayerSnapStart,
  type SnapBox,
  type SnapGuide,
  type SnapPoint,
  type SnapSpacing,
  snaps
} from "@parity-app/editor"
import type { Editor, GapsSnapIndicator, PointsSnapIndicator } from "tldraw"
import { getPreferences } from "../chrome/preferences.ts"
import { findNodeElement, nodeBox } from "../frame.ts"
import { clearSnaps } from "./snap.ts"

/**
 * Snapping a layer as it's moved or resized: this measures what it snaps to when the gesture begins, for
 * `@parity-app/editor`'s `absoluteDrag` and `layerResize`, and shows where they say it locked, the guides and spacing
 * marks as tldraw's snap indicators, the same red lines a dragged design shows, and the distances on the overlay as
 * Alt's redlines are drawn.
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
export class LayerSnapping implements LayerSnapStart {
  private constructor(
    private readonly editor: Editor | undefined,
    private readonly host: HTMLElement,
    /** Screen pixels per pixel of the frame. */
    private readonly scale: number,
    /** The layer's box when the gesture began. */
    readonly box: SnapBox,
    /** What it snaps to: its siblings' boxes and its parent's. */
    readonly scene: LayerSnapScene
  ) {}

  /**
   * Measures, in the frame `host` draws at `scale`, the layer's box, the boxes of its siblings that are drawn, and the
   * box its insets count from, inside its border: its containing block, which `offsetParent` gives, a transformed or
   * contained ancestor as well as a positioned one. That's the parent's own box when the parent is a layout, as layouts
   * are always positioned; only in a component's slot can it be another, whatever the component's elements make the
   * containing block, since that's where the layer's insets are written from. Snapped to that box's edge, a side's inset
   * is 0. The gesture that measures it says when it ends, with `clear`.
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
    return new LayerSnapping(editor, host, scale, toBox(own), { siblings, parent: inner })
  }

  /** Whether the layer snaps with these keys held: when snapping is turned on, unless Ctrl (Cmd on a Mac) is held. */
  snaps(held: { ctrlKey: boolean; metaKey: boolean }): boolean {
    return snaps(held, getPreferences().snapping)
  }

  /** Shows where the layer snapped, the guides, spacing marks and distances, or nothing when it didn't. */
  show(snapped: LayerSnapped | undefined): void {
    if (!snapped) {
      this.clear()
      return
    }
    const origin = this.host.getBoundingClientRect()
    const client = (point: SnapPoint) => ({
      x: origin.left + point.x * this.scale,
      y: origin.top + point.y * this.scale
    })
    measures = snapped.distances.map(({ from, to, length }) => ({ from: client(from), to: client(to), length }))
    const editor = this.editor
    if (!editor) return
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

  /** Takes the guides and distances away, when the gesture ends, however it ends, or moves freely. */
  clear(): void {
    measures = []
    if (this.editor) clearSnaps(this.editor)
  }
}
