import type { ContainerSpec } from "@parity-app/core"
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
import { getEffectivePreferences } from "../project-settings.ts"
import { type FrameGeometry, toScreen } from "./frame-geometry.ts"
import { snapScene } from "./layer-measure.ts"
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
    private readonly frame: FrameGeometry,
    /** The layer's box when the gesture began. */
    readonly box: SnapBox,
    /** What it snaps to: its siblings' boxes and its parent's. */
    readonly scene: LayerSnapScene
  ) {}

  /**
   * Measures what the layer snaps to in the frame (see `snapScene`). The gesture that measures it says when it ends,
   * with `clear`.
   */
  static measure(
    editor: Editor | undefined,
    frame: FrameGeometry,
    container: ContainerSpec,
    layer: string
  ): LayerSnapping | undefined {
    const measured = snapScene(frame, container, layer)

    return measured && new LayerSnapping(editor, frame, measured.box, measured.scene)
  }

  /** Whether the layer snaps with these keys held: when snapping is turned on, unless Ctrl (Cmd on a Mac) is held. */
  snaps(held: { ctrlKey: boolean; metaKey: boolean }): boolean {
    return snaps(held, getEffectivePreferences().snapping)
  }

  /** Shows where the layer snapped, the guides, spacing marks and distances, or nothing when it didn't. */
  show(snapped: LayerSnapped | undefined): void {
    if (!snapped) {
      this.clear()

      return
    }

    // Where the frame is now, so the guides stay on it if the canvas moved since the gesture began.
    const drawn = { rect: this.frame.rect, scale: this.frame.scale }
    const client = (point: SnapPoint) => toScreen(drawn, point)

    measures = snapped.distances.map(({ from, to, length }) => ({ from: client(from), to: client(to), length }))
    const editor = this.editor

    if (!editor) {
      return
    }

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

    if (this.editor) {
      clearSnaps(this.editor)
    }
  }
}
