import { type DesignNode, walkNodes } from "@parity-app/core"
import {
  type DropTarget,
  dropTargetAt,
  flowOf,
  type FrameLayout,
  frameLayout,
  type MeasuredLayer,
  type Point
} from "@parity-app/editor"
import type { ContainerEntry } from "../design-store.ts"
import { findNodeElement, nodeBox } from "../frame.ts"

/**
 * Frames' layouts as they were when a drag began. While layers are dragged they're hidden where they were and copies
 * show where they'd land, so the layouts on screen keep changing under the pointer. Drop targets are found in these
 * instead: a neighbour that slid into the dragged layer's place isn't under the pointer, and a slot doesn't move because
 * a copy was shown in it. The frame the drag starts in is measured before anything is hidden; any other frame, the first
 * time the pointer is over it, before a copy is shown in it.
 */
export class DragLayouts {
  private readonly frames = new Map<HTMLElement, FrameLayout>()

  /** Measures a frame of a design now, as it's laid out: each layer's box, and how each layout flows. */
  measure(host: HTMLElement, root: DesignNode): FrameLayout {
    const measured: MeasuredLayer[] = []
    walkNodes(root, (node) => {
      const element = node.type === "layout" ? findNodeElement(host, node.id) : undefined
      measured.push({
        id: node.id,
        box: nodeBox(host, node.id),
        ...(element ? { flow: flowOf(getComputedStyle(element)) } : {})
      })
    })
    const layout = frameLayout(host.getBoundingClientRect(), measured)
    this.frames.set(host, layout)
    return layout
  }

  get(host: HTMLElement, root: DesignNode): FrameLayout {
    return this.frames.get(host) ?? this.measure(host, root)
  }
}

export interface DropAt extends DropTarget {
  /** The frame it lands in. */
  host: HTMLElement
}

/**
 * Where layers dropped at a point in a frame would go, by the frame's layout when the drag began (see `dropTargetAt`).
 * `source` is the design the layers are in.
 */
export function dropInFrame(
  layouts: DragLayouts,
  entry: ContainerEntry,
  host: HTMLElement,
  point: Point,
  source: string,
  ids: readonly string[]
): DropAt | undefined {
  const found = dropTargetAt({
    layout: layouts.get(host, entry.container.root),
    frame: host.getBoundingClientRect(),
    design: entry.key,
    root: entry.container.root,
    point,
    source,
    ids
  })
  return found && { ...found, host }
}
