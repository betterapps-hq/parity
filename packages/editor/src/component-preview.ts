import {
  type ComponentInfo,
  type ComponentLibrary,
  type ComponentSource,
  type DesignNode,
  type OpenProp,
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
 * needs, see `componentExample`), drawn open (`drawnOpen`), at its own size up to `previewMaxWidth`, with room around
 * it. The same component gives the same tree, and the same preview key, every time; agents get what's placed, not
 * drawn open, as the component's example.
 */
export function componentPreviewTree(component: string, context: PreviewContext): RenderNode[] {
  const placed = drawnOpen(componentExample(component, context.info, context.sources), context.sources)
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

/** The value an item is given to be the one open or chosen, when neither it nor its sample has one. */
export const previewValue = "parity-preview"

/**
 * What's placed, drawn open (PAR-517): a dialog, popover or menu shows its content, which it otherwise renders only
 * once opened, and an accordion, navigation menu or tabs show an item's. It reads which props each component declares
 * (`openProps`), so it applies to any library's, and keeps a value the sample gives.
 *
 * - The first component that takes `defaultOpen`, and within it the first again, is given `defaultOpen: true` unless
 *   it's given `open` or `defaultOpen` already. Only the first, so a menubar opens one menu, not all of them over each
 *   other, and a part opens with every parent it's placed in.
 * - A component that takes `defaultValue`, isn't given `value` and chooses none of the components inside it that take
 *   `value` (a part placed in its parents' samples, or a sample that chooses nothing) chooses the first of them: that
 *   item keeps its value, else takes the first the component chooses, else `previewValue`, and the component chooses
 *   it, beside the others it chooses when they're a list, as an accordion's are. A sample that already chooses one of
 *   its items, as a radio group's or tabs' does, is left as it is.
 */
export function drawnOpen(node: DesignNode, sources: Record<string, ComponentSource>): DesignNode {
  const tree = structuredClone(node)
  const declares = (layer: DesignNode, prop: OpenProp) =>
    layer.type === "component" && (sources[layer.component]?.openProps?.includes(prop) ?? false)
  const chooseItems = (layer: DesignNode) => {
    if (layer.type === "component" && declares(layer, "defaultValue") && !("value" in (layer.props ?? {}))) {
      const items = inside(layer).filter((child) => declares(child, "value"))
      const chosen = layer.props?.defaultValue
      const choices = Array.isArray(chosen) ? chosen : [chosen]
      const choosesOne = items.some(
        (item) => item.type === "component" && item.props?.value !== undefined && choices.includes(item.props.value)
      )
      const item = items[0]
      if (!choosesOne && item?.type === "component") {
        const first: unknown = Array.isArray(chosen) ? chosen[0] : chosen
        const value = item.props?.value ?? first ?? previewValue
        item.props = { ...item.props, value }
        let defaultValue: unknown = value
        if (Array.isArray(chosen)) defaultValue = chosen.includes(value) ? chosen : [...chosen, value]
        layer.props = { ...layer.props, defaultValue }
      }
    }
    for (const child of children(layer)) chooseItems(child)
  }
  const openFirst = (layer: DesignNode): boolean => {
    let opened = false
    const given = layer.type === "component" ? (layer.props ?? {}) : {}
    if (layer.type === "component" && declares(layer, "defaultOpen") && !("open" in given || "defaultOpen" in given)) {
      layer.props = { ...given, defaultOpen: true }
      opened = true
    }
    let within = false
    for (const child of children(layer)) within ||= openFirst(child)
    return opened || within
  }
  chooseItems(tree)
  openFirst(tree)
  return tree
}

/** A layer's children, in every slot, in order. */
function children(node: DesignNode): DesignNode[] {
  if (node.type === "layout") return node.children
  if (node.type === "component") return Object.values(node.slots ?? {}).flat()
  return []
}

/** Every layer inside a node, depth first, in order. */
function inside(node: DesignNode): DesignNode[] {
  return children(node).flatMap((child) => [child, ...inside(child)])
}
