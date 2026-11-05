import {
  type ComponentInfo,
  type ComponentLibrary,
  type ComponentSource,
  type RenderNode,
  resolveDesign
} from "@parity-app/core"
import { componentExample } from "./composition.ts"

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
 * needs, see `componentExample`), at its own size up to `previewMaxWidth`, with room around it. The same component
 * gives the same tree, and the same preview key, every time; agents get it as the component's example.
 */
export function componentPreviewTree(component: string, context: PreviewContext): RenderNode[] {
  const placed = componentExample(component, context.info, context.sources)
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
