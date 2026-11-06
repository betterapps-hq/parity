import {
  type ComponentInfo,
  type ComponentLibrary,
  type ComponentProp,
  type ComponentSource,
  type DesignNode,
  type OpenProp,
  type RenderNode,
  renderProblem,
  resolveDesign,
  walkNodes
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
  /** Props laid over the component's own, as one of its variants' (PAR-208). */
  props?: Record<string, unknown>
}

/**
 * What a component's preview draws: what inserting it would place in an empty layout (its sample and the parents a part
 * needs, see `componentExample`), drawn open (`drawnOpen`), at its own size up to `previewMaxWidth`, with room around
 * it. The same component gives the same tree, and the same preview key, every time; agents get what's placed, not
 * drawn open, as the component's example.
 */
export function componentPreviewTree(component: string, context: PreviewContext): RenderNode[] {
  const example = componentExample(component, context.info, context.sources)
  const placed = drawnOpen(context.props ? withProps(example, component, context.props) : example, context.sources)
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

/** The example with props laid over the component's own, on its first layer of that component, outermost first. */
function withProps(node: DesignNode, component: string, props: Record<string, unknown>): DesignNode {
  const tree = structuredClone(node)
  const target = [tree, ...inside(tree)].find((layer) => layer.type === "component" && layer.component === component)
  if (target?.type === "component") target.props = { ...target.props, ...props }
  return tree
}

/** A prop whose options a component's card shows as small previews, one per option (PAR-208). */
export interface PreviewVariants {
  prop: string
  options: (string | number | boolean)[]
}

/**
 * The variants a component's card shows: its first variant of its styles (cva) with more than one option, else its first
 * own prop of a few named options, as a size or an orientation. None for a component without either.
 */
export function previewVariants(info: ComponentInfo | undefined): PreviewVariants | undefined {
  const choices = (prop: ComponentProp) => prop.kind === "enum" && (prop.options?.length ?? 0) > 1
  const props = info?.props ?? []
  const prop =
    props.find((candidate) => candidate.group === "variant" && choices(candidate)) ??
    props.find((candidate) => candidate.group === "own" && choices(candidate))
  return prop ? { prop: prop.name, options: prop.options! } : undefined
}

/**
 * The props a component requires that what inserting it places doesn't give it, which its preview may not draw
 * without. Inserting gives a required text, number, yes-or-no or option prop a value of its own (`componentNode`), so
 * these are lists, objects and other nodes. A function is left out, since a missing handler doesn't stop it drawing, and
 * so is `children` when the sample puts layers inside it.
 */
export function missingProps(
  component: string,
  info: ComponentInfo | undefined,
  sources: Record<string, ComponentSource>
): string[] {
  const example = componentExample(component, info, sources)
  const layer = [example, ...inside(example)].find(
    (candidate) => candidate.type === "component" && candidate.component === component
  )
  if (layer?.type !== "component") return []
  return (info?.props ?? [])
    .filter((prop) => prop.required && prop.kind !== "function")
    .filter((prop) => layer.props?.[prop.name] === undefined && !layer.slots?.[prop.name]?.length)
    .map((prop) => prop.name)
}

/** Why a component has no picture, when drawing it failed or showed nothing. */
export type PreviewProblem = "failed" | "needs-props" | "needs-provider" | "server-only" | "draws-nothing"

/**
 * Why a preview has no picture: a provider it needs or code that only runs on a server, as its error says
 * (`renderProblem`); else a required prop with no value (`missingProps`); else it failed, or drew nothing of its own.
 */
export function previewProblem(drawn: { error: string } | { empty: true }, missing: readonly string[]): PreviewProblem {
  if ("error" in drawn) {
    const problem = renderProblem(drawn.error)
    if (problem === "provider") return "needs-provider"
    if (problem === "server" || problem === "async") return "server-only"
  }
  if (missing.length > 0) return "needs-props"
  return "error" in drawn ? "failed" : "draws-nothing"
}

/** How many times each component is placed in a project's designs, by its name, counting layers in slots too. */
export function componentUses(roots: readonly DesignNode[]): Map<string, number> {
  const uses = new Map<string, number>()
  for (const root of roots) {
    walkNodes(root, (node) => {
      if (node.type === "component") uses.set(node.component, (uses.get(node.component) ?? 0) + 1)
    })
  }
  return uses
}
