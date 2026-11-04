import {
  type ComponentInfo,
  type ComponentLibrary,
  type ComponentSource,
  type DesignNode,
  type RenderNode,
  resolveDesign,
  withLibraryContext
} from "@parity-app/core"
import { nodeForItem } from "./insert.ts"

/** The element a component preview is drawn in, whose box the picture is cropped to. */
export const previewRootId = "parity-preview"
/** How wide a component's preview may be drawn, in pixels; a narrower one is drawn at its own width. */
export const previewMaxWidth = 640
/** Room around a component in its preview, so its shadow and focus ring aren't cut off. */
export const previewPadding = 8
/** The width of the frame a preview is drawn in: the widest preview with its room around it. */
export const previewFrameWidth = previewMaxWidth + 2 * previewPadding

/** What a component's preview tree needs to know of the project. */
export interface PreviewContext {
  /** What the component takes, when the project knows. */
  info?: ComponentInfo
  /** Where the project's and libraries' components come from, for the parents a library part needs. */
  sources: Record<string, ComponentSource>
  library: ComponentLibrary
  /** The viewport option of the mode it's drawn in, whose responsive patches apply. */
  viewport: string
}

/**
 * What a component's preview draws: what inserting it would place in an empty layout (its sample and the parents a part
 * needs, see `nodeForItem` and `withLibraryContext`), at its own size up to `previewMaxWidth`, with room around it. Its
 * layers are numbered in order rather than given fresh ids, so the same component gives the same tree, and the same
 * preview key, every time.
 */
export function componentPreviewTree(component: string, context: PreviewContext): RenderNode[] {
  const taken = new Set<string>()
  const part = nodeForItem({ kind: "component", component }, context.info, taken)
  const placed = numbered(withLibraryContext(part, context.sources, [], taken), { next: 1 })
  return [
    {
      kind: "element",
      nodeId: previewRootId,
      tag: "div",
      style: {
        display: "flow-root",
        boxSizing: "border-box",
        width: "max-content",
        maxWidth: `${previewFrameWidth}px`,
        padding: `${previewPadding}px`
      },
      children: resolveDesign(placed, undefined, context.viewport, context.library)
    }
  ]
}

/** A node with its layers' ids replaced by `p1`, `p2` and on, in the order they're met. */
function numbered(node: DesignNode, count: { next: number }): DesignNode {
  const id = `p${count.next++}`
  if (node.type === "layout") return { ...node, id, children: node.children.map((child) => numbered(child, count)) }
  if (node.type === "component" && node.slots) {
    const slots = Object.entries(node.slots).map(
      ([slot, children]) => [slot, children.map((child) => numbered(child, count))] as const
    )
    return { ...node, id, slots: Object.fromEntries(slots) }
  }
  return { ...node, id }
}
