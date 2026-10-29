import { type DesignNode, isInnerPath, locateNode } from "@parity/core"
import type { ContainerEntry, DesignStore } from "../design-store.ts"
import { findFrames, findNodeElement, nodeElements } from "../frame.ts"

export interface Point {
  x: number
  y: number
}

export interface Hit {
  entry: ContainerEntry
  /** The frame under the point. */
  host: HTMLElement
  mode: string
  state: string
  /** The design's nodes under the point, root first. */
  chain: DesignNode[]
  /**
   * Every rendered node under the point, outermost first, by the ids the canvas gives them. Inside an instance these
   * reach past `chain`: `card`, then `card/title`.
   */
  path: string[]
}

export function inside(rect: DOMRect, point: Point): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
}

/**
 * What's under a point (client coordinates): which frame of which design, and which of its nodes. Frames ignore
 * pointer events, so this goes by layout boxes rather than the browser's hit testing.
 */
export function hitTest(area: ParentNode, store: DesignStore, point: Point): Hit | undefined {
  for (const host of area.querySelectorAll<HTMLElement>("[data-frame]")) {
    if (!inside(host.getBoundingClientRect(), point)) continue
    const entry = store.getEntry(host.dataset.design ?? "")
    if (!entry) continue
    // Document order puts descendants after their ancestors, so the last box containing the point is the deepest.
    const path = nodeElements(host)
      .filter((element) => inside(element.getBoundingClientRect(), point))
      .flatMap((element) => element.dataset.canvasNode ?? [])
    // Inside an instance, ids are `instance/inner`: the instance is the design's own node.
    const deepest = path.at(-1)?.split("/")[0]
    const location = deepest ? locateNode(entry.container.root, deepest) : undefined
    const chain = location ? [...location.ancestors, location.node] : [entry.container.root]
    return { entry, host, mode: host.dataset.mode ?? "", state: host.dataset.state ?? "", chain, path }
  }
  return undefined
}

/**
 * Which node a click selects, by id, Figma style. With a layer selected, clicks pick among its siblings (or leave the
 * group for the top level), inside an instance too; `deep` (Ctrl or Cmd) picks the deepest layer, inside instances as
 * well; otherwise the design's top-level child.
 */
export function pickNode(hit: Hit, selected: string | undefined, deep: boolean): string | undefined {
  const { chain, path } = hit
  if (deep) return chain.length > 1 ? path.at(-1) : undefined
  if (selected && isInnerPath(selected)) {
    // The rendered parent of the selected layer, whose children are the selected layer's siblings.
    const element = findNodeElement(hit.host, selected)
    const parent = element?.parentElement?.closest<HTMLElement>("[data-canvas-node]")?.dataset.canvasNode
    const index = parent ? path.indexOf(parent) : -1
    if (index !== -1 && path[index + 1]) return path[index + 1]
  } else if (selected) {
    const location = locateNode(hit.entry.container.root, selected)
    const parent = location?.ancestors.at(-1)
    const index = parent ? chain.findIndex((node) => node.id === parent.id) : -1
    if (index !== -1 && chain[index + 1]) return chain[index + 1]!.id
  }
  return chain[1]?.id
}

/**
 * One level deeper than the selection, under the point: what a double-click selects. Past an instance, that's the
 * layers inside it, as the component draws them.
 */
export function pickDeeper(hit: Hit, selected: string | undefined): string | undefined {
  if (!selected) return hit.chain[1]?.id
  const index = hit.chain.findIndex((node) => node.id === selected)
  if (index !== -1 && hit.chain[index + 1]) return hit.chain[index + 1]!.id
  const at = hit.path.indexOf(selected)
  if (at !== -1) return hit.path[at + 1]
  return pickNode(hit, selected, false)
}

/** The frame a selection belongs to: the one it was picked in, else the design's primary frame. */
export function selectionFrame(
  area: ParentNode,
  design: string,
  picked: { mode?: string; state?: string }
): HTMLElement | undefined {
  const frames = findFrames(area, design)
  return (
    frames.find((host) => host.dataset.mode === picked.mode && host.dataset.state === picked.state) ??
    frames.find((host) => host.dataset.mode === picked.mode) ??
    frames.find((host) => host.dataset.primary === "true") ??
    frames[0]
  )
}

/** A node's element in each frame of its design, the picked frame first. */
export function nodeInFrames(area: ParentNode, design: string, node: string, picked: HTMLElement | undefined) {
  return findFrames(area, design)
    .map((host) => ({ host, element: findNodeElement(host, node), picked: host === picked }))
    .filter((entry): entry is { host: HTMLElement; element: HTMLElement; picked: boolean } => !!entry.element)
    .sort((a, b) => Number(b.picked) - Number(a.picked))
}

/** The scale a frame is drawn at relative to its own layout (companion modes are shrunk). */
export function frameScale(host: HTMLElement): number {
  return Number(host.dataset.scale ?? "1") || 1
}
